// Config compartida de Supabase: UNA sola definición (la usan supabase.ts y rlog.ts).
// La key es publishable/anon: pública por diseño (la frontera de seguridad es la RLS, no ocultar
// la key). Idealmente vendría solo por .env; el fallback literal existe para no romper un dev sin
// .env configurado. Si algún día quieres que falle ruidosamente cuando falte la env, quita el `||`.
export const SUPABASE_URL =
  (import.meta.env.PUBLIC_SUPABASE_URL as string) || "https://uydwufnirtivbsckiisx.supabase.co";
export const SUPABASE_ANON_KEY =
  (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string) ||
  "sb_publishable_aKwQwWy_mxKwZ2lvh8Ajcg_9Bevj4As";
