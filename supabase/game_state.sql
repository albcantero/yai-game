-- Estado GLOBAL de la partida (una sola fila, compartida por todo el grupo; NO por usuario).
-- Correr en el SQL editor de Supabase. Idempotente (se puede re-ejecutar).

create table if not exists public.game_state (
  id         text primary key,
  keys       int         not null default 99,
  open_paths text[]      not null default '{}',   -- nodos desbloqueados (ids: "r1", "cross-north"...)
  current    text        not null default 'hub-almacen', -- posición compartida del grupo
  updated_at timestamptz not null default now()
);

-- fila única de la partida en vivo
insert into public.game_state (id) values ('live') on conflict (id) do nothing;

alter table public.game_state enable row level security;

-- lectura para cualquier sesión (la app entra con auth anónima = rol authenticated)
drop policy if exists game_state_read on public.game_state;
create policy game_state_read on public.game_state for select to authenticated using (true);
-- (sin policy de UPDATE directo: los cambios van por RPC atómica, para que 8 jugadoras no pisen llaves)

-- DESBLOQUEAR una puerta: atómico (comprueba llaves, descuenta y añade el nodo en una sola operación).
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

grant execute on function public.unlock(text, int) to authenticated;
grant execute on function public.move(text) to authenticated;

-- realtime: emite los UPDATE de la fila a todas las jugadoras
alter publication supabase_realtime add table public.game_state;
