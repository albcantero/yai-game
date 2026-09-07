import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  allCharacters,
  currentCharacter,
  fetchThread,
  sendMessage,
  subscribeMessages,
  type Character,
  type Msg,
} from "../../lib/supabase";
import { menuNav } from "../../terminal/input";
import type { LineClass } from "../../terminal/types";

interface PanelOption {
  label: string;
  run: () => void;
}
interface PanelState {
  options: PanelOption[];
  active: number;
}
type SpinResult = { code: "OK" | "ERROR"; text: string; cls?: LineClass };

// Primitivas que el terminal le presta al chat: pintar líneas, spin, sleep pausable y el flag de montaje.
export interface ChatDeps {
  print: (text: string, cls?: LineClass) => void;
  clear: () => void;
  setLine: (v: string) => void;
  sys: (code: string, text: string, cls?: LineClass) => void;
  spin: (loadingText: string, task: () => Promise<SpinResult>, minMs?: number) => Promise<SpinResult>;
  sleep: (ms: number) => Promise<void>;
  mountedRef: MutableRefObject<boolean>;
}

// Subsistema de CUENTA + CHAT de la pantalla-terminal: identidad (loadIdentity/meRef), panel (roster de
// cuenta + lista de conversaciones), hilos (DMs 1-a-1 + sala común) con realtime resiliente, dedup por id
// y echo local. El terminal le pasa sus primitivas de pintado y lo que produce vuelve por el return.
export function useChat({ print, clear, setLine, sys, spin, sleep, mountedRef }: ChatDeps) {
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [thread, setThread] = useState<{ target: string | null; name: string } | null>(null);
  const meRef = useRef<Character | null>(null);
  const namesRef = useRef<Record<string, string>>({});
  const threadRef = useRef<{ target: string | null; name: string } | null>(null);
  const chatUnsubRef = useRef<null | (() => void)>(null);
  const seenMsgIdsRef = useRef<Set<number>>(new Set()); // ids ya pintados: dedup entre historial, echo local y realtime

  const logoutFlow = async () => {
    if (chatUnsubRef.current) {
      chatUnsubRef.current();
      chatUnsubRef.current = null;
    }
    threadRef.current = null;
    setThread(null);
    setPanel(null);
    await spin("Cerrando sesión...", async () => {
      await sleep(2000);
      return { code: "OK", text: "Se ha cerrado su sesión correctamente", cls: "b" };
    });
    clear();
  };

  const openPanel = () => {
    setPanel({
      active: 0,
      options: [
        { label: "Mis mensajes", run: () => void openMessages() },
        { label: "Salir", run: () => logoutFlow() },
      ],
    });
  };

  // ---------- Chat: roster (panel) + hilo (mensajes en lines + compose) ----------
  const printMsg = (m: Msg) => {
    if (seenMsgIdsRef.current.has(m.id)) return; // ya pintado (historial/echo/realtime): no duplicar
    seenMsgIdsRef.current.add(m.id);
    const mine = m.from_char === meRef.current?.username;
    const who = mine ? "Tú" : namesRef.current[m.from_char] ?? m.from_char;
    print(who + ": " + m.body, mine ? "b" : "");
  };
  const belongsToThread = (m: Msg, target: string | null, me: string) =>
    target === null
      ? m.to_char === null
      : (m.from_char === me && m.to_char === target) || (m.from_char === target && m.to_char === me);
  const sendChat = async (target: string | null, body: string) => {
    const from = meRef.current?.username;
    if (!from) return;
    const res = await sendMessage(from, target, body);
    if (!res.ok) {
      sys("ERROR", "No se pudo enviar el mensaje", "d");
      return;
    }
    if (res.msg && threadRef.current?.target === target) printMsg(res.msg); // echo local inmediato (no espera al realtime; el dedup evita repetir)
  };
  const openThread = async (target: string | null, name: string) => {
    setPanel(null);
    const t = { target, name };
    threadRef.current = t;
    setThread(t);
    setLine("");
    clear();
    seenMsgIdsRef.current = new Set(); // hilo nuevo: reinicia el dedup
    print(name, "muted");
    print("");
    const me = meRef.current?.username ?? "";
    // Carga (o recarga, tras una reconexión) el historial del hilo; el dedup por id evita repetir
    // lo ya pintado, así que en un resync solo se añaden los mensajes que se perdieron durante la caída.
    const backfill = async () => {
      const msgs = await fetchThread(me, target);
      if (!mountedRef.current || threadRef.current !== t) return; // desmontado o el usuario cambió de hilo
      for (const m of msgs) printMsg(m);
    };
    await backfill();
    if (!mountedRef.current || threadRef.current !== t) return; // no suscribir sobre un hilo ya abandonado/desmontado
    if (chatUnsubRef.current) chatUnsubRef.current();
    chatUnsubRef.current = subscribeMessages(
      (m) => {
        if (threadRef.current === t && belongsToThread(m, target, meRef.current?.username ?? "")) printMsg(m);
      },
      () => void backfill(), // reconexión del realtime: recupera lo perdido durante la caída
    );
  };
  const openMessages = async () => {
    const chars = (await allCharacters()).filter((c) => c.username !== meRef.current?.username);
    setPanel({
      active: 0,
      options: [
        { label: "Sala común", run: () => void openThread(null, "Sala común") },
        ...chars.map((c) => ({ label: c.display_name, run: () => void openThread(c.username, c.display_name) })),
        { label: "Salir", run: () => openPanel() },
      ],
    });
  };
  const backToRoster = () => {
    if (chatUnsubRef.current) {
      chatUnsubRef.current();
      chatUnsubRef.current = null;
    }
    threadRef.current = null;
    setThread(null);
    setLine("");
    clear();
    void openMessages();
  };
  const loadIdentity = async () => {
    const chars = await allCharacters();
    const map: Record<string, string> = {};
    for (const c of chars) map[c.username] = c.display_name;
    namesRef.current = map;
    meRef.current = await currentCharacter();
  };

  const handlePanelKey = (k: string) => {
    const p = panel;
    if (!p) return;
    const na = menuNav(p.active, p.options.length, k);
    if (na !== p.active) setPanel({ ...p, active: na });
    else if (k === "Enter") p.options[p.active].run();
  };

  // El terminal desuscribe el realtime al desmontar (su cleanup del boot llama a este).
  const unsubscribe = () => chatUnsubRef.current?.();

  return {
    panel,
    thread,
    meRef,
    openPanel,
    backToRoster,
    sendChat,
    handlePanelKey,
    loadIdentity,
    unsubscribe,
  };
}
