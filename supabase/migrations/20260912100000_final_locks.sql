-- CANDADOS FINALES (la "segunda oleada"): geometryLock que NO dan llave. Solo marcan el puzzle como resuelto
-- (para el contador de mecanismos) y, al completar los cuatro, otorgan el ITEM Llave Roja (Copia de la Llave
-- Maestra). Es solve() SIN sumar llave. Aditivo: no toca solve() ni ninguna otra función.
create or replace function public.solve_final(p_puzzle text, p_item text default null)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set solved = array_append(solved, p_puzzle),
         items  = case when p_item is null or p_item = any(items) then items else array_append(items, p_item) end,
         updated_at = now()
   where id = 'live' and not (p_puzzle = any(solved))
   returning * into g;
  if g.id is null then                      -- ya estaba resuelto: estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;
grant execute on function public.solve_final(text, text) to authenticated;
