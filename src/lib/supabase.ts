// Cliente de Supabase para el chat: identidad anonima, login contra nuestra tabla, y datos.
import { createClient } from "@supabase/supabase-js";

const URL =
  (import.meta.env.PUBLIC_SUPABASE_URL as string) || "https://uydwufnirtivbsckiisx.supabase.co";
const KEY =
  (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string) ||
  "sb_publishable_aKwQwWy_mxKwZ2lvh8Ajcg_9Bevj4As";

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export interface Character {
  username: string;
  display_name: string;
}

// Garantiza una sesion (anonima) para poder hablar con la base. Idempotente: solo una vez.
let ensuring: Promise<void> | null = null;
export function ensureSession(): Promise<void> {
  if (!ensuring) {
    ensuring = (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) await supabase.auth.signInAnonymously();
    })();
  }
  return ensuring;
}

// Login contra NUESTRA tabla (RPC). Ata tu identidad anonima a un personaje.
export async function loginCharacter(
  username: string,
  password: string,
): Promise<{ ok: boolean; username?: string; display_name?: string; error?: string }> {
  try {
    await ensureSession();
    const { data, error } = await supabase.rpc("login", {
      p_username: username.trim().toLowerCase(),
      p_password: password,
    });
    if (error) return { ok: false, error: error.message };
    return data as { ok: boolean; username?: string; display_name?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Personaje actualmente logueado (segun la sesion en la base), o null si no.
export async function currentCharacter(): Promise<Character | null> {
  await ensureSession();
  const { data: me } = await supabase.rpc("me");
  if (!me) return null;
  const { data } = await supabase
    .from("characters")
    .select("username,display_name")
    .eq("username", me)
    .single();
  return (data as Character) ?? null;
}
