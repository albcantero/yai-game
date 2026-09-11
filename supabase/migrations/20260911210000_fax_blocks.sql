-- Fax por BLOQUES: el progreso pasa de una secuencia única a picks POR BLOQUE. `fax_progress` (jsonb) mapea
-- id_de_bloque -> array de elecciones (0/1). Qué bloques están desbloqueados NO se guarda: se calcula en vivo
-- con los triggers sobre el game_state (que ya persiste). Compartido, como el resto. (fax_picks queda obsoleto.)
alter table public.game_state add column if not exists fax_progress jsonb not null default '{}'::jsonb;

-- ELEGIR en un bloque: añade la elección al array de ESE bloque (atómico; solo si el paso a responder es el
-- actual de ese bloque, para que dos jugadoras no se pisen). Marca el Fax como no leído.
drop function if exists public.fax_choose(int, int);
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
         fax_read   = false,
         updated_at = now()
   where id = 'live'
     and coalesce(jsonb_array_length(fax_progress->p_block), 0) = p_step
   returning * into g;
  if g.id is null then                      -- el paso ya estaba respondido: estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;
grant execute on function public.fax_choose(text, int, int) to authenticated;

-- reset limpia también el progreso del Fax por bloque
create or replace function public.reset_game(p_keys int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.game_state
     set keys = p_keys, open_paths = '{}', current = 'hub-almacen', solved = '{}', items = '{}', started = false,
         fax_picks = '{}', fax_read = false, fax_progress = '{}'::jsonb, updated_at = now()
   where id = 'live';
  delete from public.messages   where id is not null;
  delete from public.debug_logs where id is not null;
end $$;
