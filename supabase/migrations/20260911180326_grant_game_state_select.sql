-- FIX: la RLS policy NO concede el privilegio de tabla; el rol necesita el GRANT explícito. Sin esto el cliente
-- (rol authenticated, sesión anónima) recibe "permission denied for table game_state" al LEER y al SUSCRIBIRSE por
-- realtime (los eventos llegan redactados/vacíos). Las RPC seguían funcionando por ser security definer.
-- Las tablas creadas por migración SQL no heredan los grants automáticos que sí tienen las creadas desde el panel.
grant select on public.game_state to authenticated;
