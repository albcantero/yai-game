-- Estado del FAX ELECTRÓNICO (conversación con el informante): COMPARTIDO en la fila 'live' (como el resto).
-- Solo guardamos `fax_picks` = las elecciones hechas, en orden (0/1 por paso). Con esto + el guion del cliente
-- se reconstruye TODA la conversación (no guardamos textos). `fax_read` = si se han leído los mensajes
-- disponibles (para futuros avisos de "mensajes nuevos"). Idempotente (re-aplicable sin romper nada).

alter table public.game_state add column if not exists fax_picks int[]  not null default '{}';
alter table public.game_state add column if not exists fax_read  boolean not null default false;

-- ELEGIR una respuesta del Fax: añade la elección de forma ATÓMICA y solo si el paso a responder es el
-- ACTUAL (cardinality(fax_picks) = p_step). Así dos jugadoras no se pisan: la segunda ya no casa y es no-op.
-- Marca el Fax como NO leído (acaba de llegar la respuesta del contacto).
create or replace function public.fax_choose(p_step int, p_pick int)
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state
     set fax_picks  = array_append(fax_picks, p_pick),
         fax_read   = false,
         updated_at = now()
   where id = 'live' and cardinality(fax_picks) = p_step
   returning * into g;
  if g.id is null then                      -- el paso ya estaba respondido: estado sin tocar
    select * into g from public.game_state where id = 'live';
  end if;
  return g;
end $$;
grant execute on function public.fax_choose(int, int) to authenticated;

-- MARCAR el Fax como leído (al abrirlo)
create or replace function public.fax_mark_read()
returns public.game_state
language plpgsql security definer set search_path = public as $$
declare g public.game_state;
begin
  update public.game_state set fax_read = true, updated_at = now() where id = 'live' returning * into g;
  return g;
end $$;
grant execute on function public.fax_mark_read() to authenticated;

-- reset limpia también el Fax
create or replace function public.reset_game(p_keys int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.game_state
     set keys = p_keys, open_paths = '{}', current = 'hub-almacen', solved = '{}', items = '{}', started = false,
         fax_picks = '{}', fax_read = false, updated_at = now()
   where id = 'live';
  delete from public.messages   where id is not null;
  delete from public.debug_logs where id is not null;
end $$;
