// Cliente de Supabase para el chat: identidad anonima, login contra nuestra tabla, y datos.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export interface Character {
  username: string;
  display_name: string;
}

// Garantiza una sesion (anonima) para poder hablar con la base. Reintentable: si el sign-in falla,
// NO cachea el fallo (la proxima llamada lo reintenta) en vez de envenenar la sesion para siempre.
let ensuring: Promise<void> | null = null;
export function ensureSession(): Promise<void> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error; // propaga el fallo: el llamador decide (login lo muestra; el resto lo tolera)
  })();
  ensuring.catch(() => {
    ensuring = null; // limpia la promesa fallida => el siguiente ensureSession vuelve a intentarlo
  });
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
    if (!data) return { ok: false }; // la RPC "login" puede devolver null (p. ej. credenciales inválidas): no lo pases como objeto
    return data as { ok: boolean; username?: string; display_name?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Personaje actualmente logueado (segun la sesion en la base), o null si no.
export async function currentCharacter(): Promise<Character | null> {
  await ensureSession().catch(() => {});
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
  await ensureSession().catch(() => {});
  const { data } = await supabase.from("characters").select("username,display_name");
  return (data as Character[]) ?? [];
}

// Historial de un hilo: sala común (target null) o DM 1-a-1 (target = username del otro).
export async function fetchThread(me: string, target: string | null): Promise<Msg[]> {
  await ensureSession().catch(() => {});
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

// Todos los mensajes visibles para mí (la RLS ya filtra a sala común + mis DMs). Solo ids/remitente/
// destinatario: se usa para CONTAR no leídos por conversación en el roster, sin traer los cuerpos.
export async function fetchInbox(): Promise<Pick<Msg, "id" | "from_char" | "to_char">[]> {
  await ensureSession().catch(() => {});
  const { data } = await supabase.from("messages").select("id,from_char,to_char");
  return data ?? [];
}

// Envia un mensaje (a la sala si target null, o DM al username target).
export async function sendMessage(
  from: string,
  target: string | null,
  body: string,
): Promise<{ ok: boolean; msg?: Msg; error?: string }> {
  await ensureSession().catch(() => {});
  const { data, error } = await supabase
    .from("messages")
    .insert({ from_char: from, to_char: target, body })
    .select("id,created_at,from_char,to_char,body")
    .single(); // devuelve la fila insertada para pintar el mensaje propio al instante (echo local)
  if (error) return { ok: false, error: error.message };
  return { ok: true, msg: data as Msg };
}

// Suscripcion realtime a INSERTs de messages (la RLS filtra a lo que puedo ver). Devuelve el desuscriptor.
// Resiliente: si el canal cae (error/timeout) o el movil vuelve de segundo plano, re-suscribe; en cada
// re-suscripcion llama onResync para que el llamador recupere lo perdido durante la caida.
export function subscribeMessages(onInsert: (m: Msg) => void, onResync?: () => void): () => void {
  let closed = false;
  let firstJoin = true;
  let ch: ReturnType<typeof supabase.channel> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const join = () => {
    const channel = supabase
      .channel("rt-messages-" + Math.random().toString(36).slice(2, 8)) // nombre unico: evita colision con un canal saliente
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) =>
        onInsert(p.new as Msg),
      );
    ch = channel;
    channel.subscribe((status) => {
      // Ignora callbacks de un canal ya cerrado o reemplazado. CLAVE: removeChannel emite CLOSED al
      // propio callback; sin este guard (y sin excluir CLOSED abajo) nuestro teardown encenderia un
      // bucle de rejoin+refetch cada 2s.
      if (closed || channel !== ch) return;
      if (status === "SUBSCRIBED") {
        if (!firstJoin && onResync) onResync(); // reconexion real (incl. la auto de realtime-js): recupera el hueco
        firstJoin = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        scheduleRejoin(); // NO CLOSED: lo dispara nuestro propio removeChannel
      }
    });
  };
  const scheduleRejoin = () => {
    if (closed || retry) return;
    retry = setTimeout(() => {
      retry = null;
      if (closed) return;
      const old = ch;
      ch = null; // invalida el canal viejo: su CLOSED (por removeChannel) cae en el guard channel!==ch
      if (old) void supabase.removeChannel(old);
      join();
    }, 2000);
  };
  const onVis = () => {
    // Al volver a primer plano: solo recupera el hueco (backfill). NO se toca el canal (evita el churn
    // de removeChannel en cada foreground); si el canal murio de verdad, ya lo reconecta CHANNEL_ERROR/
    // TIMED_OUT o la auto-reconexion del socket de realtime-js (que reemite SUBSCRIBED -> onResync).
    if (document.visibilityState === "visible" && !closed && !firstJoin && onResync) onResync();
  };
  join();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    if (ch) void supabase.removeChannel(ch);
  };
}
