-- Aviso de "mensajes nuevos" en el Fax: `fax_seen` = cuántos BLOQUES había disponibles la última vez que se
-- abrió el Fax (el cliente lo calcula con los triggers y lo pasa). El aviso (el "!" del menú) se muestra cuando
-- (bloques disponibles ahora) > fax_seen. Así también salta cuando un bloque se desbloquea por un trigger.
alter table public.game_state add column if not exists fax_seen int not null default 0;

-- marcar el Fax como leído al abrirlo: guarda el nº de bloques disponibles visto (no baja nunca).
drop function if exists public.fax_mark_read();
create or replace function public.fax_mark_read(p_seen int)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state set fax_seen = greatest(fax_seen, p_seen), updated_at = now() where id = 'live' returning * into g;
  return g;
end $$;
grant execute on function public.fax_mark_read(int) to authenticated;

-- fax_choose ya NO toca "leído": con el modelo por bloques, el aviso se calcula por bloques disponibles.
create or replace function public.fax_choose(p_block text, p_step int, p_pick int)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set fax_progress = jsonb_set(
           coalesce(fax_progress, '{}'::jsonb),
           array[p_block],
           coalesce(fax_progress->p_block, '[]'::jsonb) || to_jsonb(p_pick)
         ),
         updated_at = now()
   where id = 'live'
     and coalesce(jsonb_array_length(fax_progress->p_block), 0) = p_step
   returning * into g;
  if g.id is null then
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;

-- reset limpia también el "visto" del Fax
create or replace function public.reset_game(p_keys int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.game_state
     set keys = p_keys, open_paths = '{}', current = 'hub-almacen', solved = '{}', items = '{}', started = false,
         fax_picks = '{}', fax_read = false, fax_progress = '{}'::jsonb, fax_seen = 0, updated_at = now()
   where id = 'live';
  delete from public.messages   where id is not null;
  delete from public.debug_logs where id is not null;
end $$;
