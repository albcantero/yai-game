-- BLINDAJE de reset_game (C2 de la auditoría): borra partida + chat + logs, así que NINGÚN cliente debe
-- poder ejecutarla. Postgres concede EXECUTE a PUBLIC por defecto al crear una función; lo revocamos
-- explícitamente (PUBLIC incluye anon y authenticated). Solo service_role (script `npm run reset`) o el
-- editor SQL del panel pueden resetear: service_role no se ve afectado por estos REVOKE.
revoke execute on function public.reset_game(int) from public;
revoke execute on function public.reset_game(int) from anon;
revoke execute on function public.reset_game(int) from authenticated;
