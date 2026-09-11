-- 1) unlock ahora acepta los nodos EXTRA que revela una puerta (Almacén->cruz revela también R3).
--    Reemplaza unlock(text,int) por unlock(text,int,text[]) con default '{}' (compatible con 2 args).
drop function if exists public.unlock(text, int);
create or replace function public.unlock(p_node text, p_cost int, p_reveals text[] default '{}')
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set keys       = keys - p_cost,
         open_paths = (select array(select distinct unnest(open_paths || p_node || p_reveals))), -- destino + reveals, sin duplicados
         updated_at = now()
   where id = 'live' and keys >= p_cost
   returning * into g;
  if g.id is null then                      -- no llegaban las llaves: estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;
grant execute on function public.unlock(text, int, text[]) to authenticated;

-- 2) fix reset_game: los DELETE sin WHERE están bloqueados (sql_safe_updates). WHERE always-true por columna.
create or replace function public.reset_game(p_keys int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.game_state
     set keys = p_keys, open_paths = '{}', current = 'hub-almacen', solved = '{}', started = false, updated_at = now()
   where id = 'live';
  delete from public.messages   where id is not null; -- borra TODO el chat (sala común + DMs)
  delete from public.debug_logs where id is not null; -- limpia los logs de test
end $$;
