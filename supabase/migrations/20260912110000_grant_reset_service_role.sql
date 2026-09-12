-- FIX del blindaje de reset_game: el `revoke execute ... from public` de la migración anterior quitó también a
-- service_role el EXECUTE (lo tenía por el grant por defecto a PUBLIC, no explícito). El script `npm run reset`
-- corre como service_role y debe poder resetear. Se lo devolvemos EXPLÍCITAMENTE; anon/authenticated siguen sin
-- poder (sus revoke se mantienen).
grant execute on function public.reset_game(int) to service_role;
