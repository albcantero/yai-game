// Store COMPARTIDO del estado de partida (game_state, fila 'live'). Se carga UNA sola vez al abrir la app y
// se mantiene con realtime; TODAS las pantallas leen de aquí (useGameState) en vez de pedir a la DB al
// montarse. Así se elimina el "popping" (parpadeo de estado vacío -> cargado) al abrir Minimap/Fax: cuando
// la pantalla se monta, el estado ya está en memoria y pinta correcto desde el primer frame.
import { useSyncExternalStore } from "react";
import { supabase, ensureSession } from "./supabase";

// Espejo del esquema de supabase/migrations (fila única 'live', compartida por el grupo).
export type GameState = {
  id: string;
  keys: number;
  open_paths: string[];
  current: string;
  solved: string[];
  items: string[];
  started: boolean;
  fax_picks: number[];                       // (obsoleto: sustituido por fax_progress)
  fax_read: boolean;
  fax_progress: Record<string, number[]>;    // picks del Fax POR BLOQUE (id_de_bloque -> [0/1,...])
  fax_seen: number;                           // nº de bloques del Fax "vistos" (para el aviso de mensajes nuevos)
};

let state: GameState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (gs: GameState) => { state = gs; emit(); };

let started = false;
let channel: ReturnType<typeof supabase.channel> | null = null;

// Arranca la carga + realtime (idempotente). Conviene llamarla lo ANTES posible (al abrir la app) para que el
// estado ya esté listo cuando el usuario abra una pantalla que lo use.
export function startGameState(): void {
  if (started) return;
  started = true;
  ensureSession().then(() => {
    supabase.from("game_state").select("*").eq("id", "live").single()
      .then(({ data }) => { if (data && !state) set(data as GameState); }); // !state: no pisar un realtime que llegó antes
    channel = supabase.channel("gs-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_state" }, (p) => {
        const n = p.new as Partial<GameState>;
        if (n && typeof n.keys === "number") set(n as GameState); // ignora payloads redactados (no pisar a vacío)
      })
      .subscribe();
  }).catch(() => {});
}

export const getGameState = (): GameState | null => state;

// Muta el estado compartido por RPC atómica y aplica la fila devuelta (realtime sincroniza al resto).
export async function applyRpc(fn: string, args: Record<string, unknown> = {}): Promise<void> {
  await ensureSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (!error && data) set(data as GameState);
}

const subscribe = (cb: () => void): (() => void) => {
  startGameState(); // red de seguridad: arranca la carga en cuanto alguien se suscribe (si no se hizo ya)
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

// Hook: devuelve el estado compartido (o null mientras carga). Se re-renderiza al cambiar (RPC/realtime).
export function useGameState(): GameState | null {
  return useSyncExternalStore(subscribe, getGameState, getGameState);
}
