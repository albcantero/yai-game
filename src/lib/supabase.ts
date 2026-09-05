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

// ---------- Chat (Fase 2b): DMs 1-a-1 + Sala común (to_char NULL) ----------
export interface Msg {
  id: number;
  created_at: string;
  from_char: string;
  to_char: string | null; // null = sala común
  body: string;
}

// Todos los personajes (para el roster y para mapear username -> display_name).
export async function allCharacters(): Promise<Character[]> {
  await ensureSession();
  const { data } = await supabase.from("characters").select("username,display_name");
  return (data as Character[]) ?? [];
}

// Historial de un hilo: sala común (target null) o DM 1-a-1 (target = username del otro).
export async function fetchThread(me: string, target: string | null): Promise<Msg[]> {
  await ensureSession();
  let q = supabase
    .from("messages")
    .select("id,created_at,from_char,to_char,body")
    .order("created_at", { ascending: true });
  if (target === null) {
    q = q.is("to_char", null);
  } else {
    q = q.or(
      `and(from_char.eq.${me},to_char.eq.${target}),and(from_char.eq.${target},to_char.eq.${me})`,
    );
  }
  const { data, error } = await q;
  if (error) return [];
  return (data as Msg[]) ?? [];
}

// Envia un mensaje (a la sala si target null, o DM al username target).
export async function sendMessage(
  from: string,
  target: string | null,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  await ensureSession();
  const { error } = await supabase.from("messages").insert({ from_char: from, to_char: target, body });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Suscripcion realtime a INSERTs de messages (la RLS filtra a lo que puedo ver). Devuelve el desuscriptor.
export function subscribeMessages(onInsert: (m: Msg) => void): () => void {
  const ch = supabase
    .channel("rt-messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) =>
      onInsert(p.new as Msg),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
