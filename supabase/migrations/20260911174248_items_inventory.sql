-- Inventario COMPARTIDO: items especiales (Tarjeta del Almacén, Copia de la Llave Maestra). Se ganan al
-- resolver puzzles concretos (Sótano -> tarjeta, La Cámara -> llave-maestra); las puertas por item los leen de aquí.
alter table public.game_state add column if not exists items text[] not null default '{}';

-- solve ahora puede OTORGAR un item (p_item) además de +1 llave. Idempotente por puzzle.
drop function if exists public.solve(text);
create or replace function public.solve(p_puzzle text, p_item text default null)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set solved = array_append(solved, p_puzzle),
         keys   = keys + 1,
         items  = case when p_item is null or p_item = any(items) then items else array_append(items, p_item) end,
         updated_at = now()
   where id = 'live' and not (p_puzzle = any(solved))
   returning * into g;
  if g.id is null then                      -- ya estaba resuelto: estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;
grant execute on function public.solve(text, text) to authenticated;

-- reset limpia también el inventario
create or replace function public.reset_game(p_keys int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.game_state
     set keys = p_keys, open_paths = '{}', current = 'hub-almacen', solved = '{}', items = '{}', started = false, updated_at = now()
   where id = 'live';
  delete from public.messages   where id is not null;
  delete from public.debug_logs where id is not null;
end $$;
