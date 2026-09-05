// Logging remoto a Supabase para depurar en dispositivos reales (sobre todo iOS, donde no tengo
// consola). Gateado tras ?debug=1 (se recuerda en localStorage; ?debug=0 lo apaga). En juego
// normal no hace nada: cero red, cero ruido. Requiere la tabla public.debug_logs (ver README/SQL).

declare const __BUILD_SHA__: string; // inyectado por vite.define (astro.config.mjs)
export const BUILD = typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : "?";

const URL =
  (import.meta.env.PUBLIC_SUPABASE_URL as string) || "https://uydwufnirtivbsckiisx.supabase.co";
const KEY =
  (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string) ||
  "sb_publishable_aKwQwWy_mxKwZ2lvh8Ajcg_9Bevj4As";

let enabled = false;
let session = "";

export function rlogEnabled() {
  return enabled;
}

export function rlog(level: string, msg: string, data?: unknown) {
  if (!enabled) return;
  try {
    fetch(URL + "/rest/v1/debug_logs", {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ session, level, msg, data: data ?? null }),
      keepalive: true, // que el POST salga aunque la pagina se cierre/navegue
    }).catch(() => {});
  } catch {
    /* nunca romper la app por un log */
  }
}

export function initRemoteLog() {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("debug") === "1") localStorage.setItem("debug", "1");
    if (q.get("debug") === "0") localStorage.removeItem("debug");
    enabled = localStorage.getItem("debug") === "1";
  } catch {
    enabled = false;
  }
  if (!enabled) return;
  session = Math.random().toString(36).slice(2, 8);
  window.addEventListener("error", (e) => {
    rlog("error", e.message || "error", {
      src: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: (e.error && e.error.stack) || null,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    rlog("error", "unhandledrejection", {
      reason: r && r.message ? r.message : String(r),
      stack: (r && r.stack) || null,
    });
  });
  rlog("info", "session start", { build: BUILD, ua: navigator.userAgent, url: location.href });
}
