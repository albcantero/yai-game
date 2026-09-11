-- Estado GLOBAL de la partida: una sola fila 'live', compartida por el grupo (NO por usuario).
-- Fuente única de verdad del PROGRESO: llaves, salas abiertas, posición, puzzles resueltos, arranque.
-- Idempotente (se puede re-aplicar sin romper nada). La CONFIG (characters/credentials/login) vive aparte.

create table if not exists public.game_state (
  id         text primary key,
  keys       int         not null default 0,             -- arranque real 0 (la 1ª llave la da el Almacén)
  open_paths text[]      not null default '{}',           -- nodos desbloqueados (ids: "r1", "cross-north"...)
  current    text        not null default 'hub-almacen',  -- posición compartida del grupo
  solved     text[]      not null default '{}',           -- ids de puzzles resueltos ("roomId#idx")
  started    boolean     not null default false,          -- tras la llamada de Miquela: abre Notas/Fax/Libro de juego
  updated_at timestamptz not null default now()
);

-- columnas nuevas por si la tabla ya existía (versión anterior sin solved/started)
alter table public.game_state add column if not exists solved  text[]  not null default '{}';
alter table public.game_state add column if not exists started boolean not null default false;

-- fila única de la partida en vivo
insert into public.game_state (id) values ('live') on conflict (id) do nothing;

alter table public.game_state enable row level security;

-- lectura para cualquier sesión (la app entra con auth anónima = rol authenticated)
drop policy if exists game_state_read on public.game_state;
create policy game_state_read on public.game_state for select to authenticated using (true);
-- (sin policy de UPDATE directo: los cambios van por RPC atómica, para que las jugadoras no se pisen)

-- DESBLOQUEAR una puerta: atómico (comprueba llaves, descuenta y añade el nodo en una sola operación)
create or replace function public.unlock(p_node text, p_cost int)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set keys       = keys - p_cost,
         open_paths = case when p_node = any(open_paths) then open_paths else array_append(open_paths, p_node) end,
         updated_at = now()
   where id = 'live' and keys >= p_cost
   returning * into g;
  if g.id is null then                      -- no llegaban las llaves: devuelve el estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;

-- MOVER al grupo (posición compartida)
create or replace function public.move(p_node text)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state set current = p_node, updated_at = now() where id = 'live' returning * into g;
  return g;
end $$;

-- RESOLVER un puzzle: atómico e IDEMPOTENTE (si ya estaba resuelto, no vuelve a dar llave)
create or replace function public.solve(p_puzzle text)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set solved     = array_append(solved, p_puzzle),
         keys       = keys + 1,
         updated_at = now()
   where id = 'live' and not (p_puzzle = any(solved))
   returning * into g;
  if g.id is null then                      -- ya estaba resuelto: estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;

grant execute on function public.unlock(text, int) to authenticated;
grant execute on function public.move(text)         to authenticated;
grant execute on function public.solve(text)        to authenticated;

-- RESET de partida a punto 0 (testeo). DESTRUCTIVO: NO se concede a authenticated.
-- Se llama con service_role (script `npm run reset`) o desde el editor SQL: select public.reset_game();
create or replace function public.reset_game(p_keys int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.game_state
     set keys = p_keys, open_paths = '{}', current = 'hub-almacen', solved = '{}', started = false, updated_at = now()
   where id = 'live';
  delete from public.messages;   -- borra TODO el chat (sala común + DMs)
  delete from public.debug_logs; -- limpia los logs de test
end $$;
-- (a propósito SIN grant a authenticated: solo service_role / SQL editor pueden resetear)

-- realtime: emite los cambios de la fila a todas las jugadoras (guardado por si ya estaba en la publicación)
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_state'
  ) then
    alter publication supabase_realtime add table public.game_state;
  end if;
end $$;
