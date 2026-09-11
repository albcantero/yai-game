import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState, getGameState, applyRpc, type GameState } from "../../lib/gameState";
import { BLOCKS, triggerMet, unlockedCount, type FaxBlock, type FaxNode } from "../../game/fax";

// FAX ELECTRÓNICO (pantalla `registro`): chat con el informante ("???", aún sin revelar que es Miquela).
// Conversación en BLOQUES (src/game/fax.ts), cada uno con su trigger y su mini-grafo ramificado.
//
// FLUJO (opción "inbox"): al abrir el Fax se fija el HISTORIAL de bloques ya completos + el primer bloque
// incompleto (el ACTIVO de esta sesión), todo INSTANTÁNEO. Dentro del bloque activo, tus respuestas hacen que
// ella conteste con "..." + typewriter en vivo (+ sonido new-message al terminar cada mensaje). Al terminar el
// bloque no salta a otro en caliente: los bloques que se disparen después aparecen (instantáneos) al VOLVER a
// abrir el Fax. GUARD incluido: un bloque nuevo no interrumpe uno a medias.
//
// PERSISTENCIA (game_state.fax_progress, jsonb {bloque:[picks]}, COMPARTIDA + realtime). Los bloques
// desbloqueados se calculan en vivo con los triggers sobre el game_state.

const TYPE_STEP = 28; // ms por carácter (typewriter, como el typeLine de Terminal)
const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const randWait = () => 1000 + Math.random() * 2000; // espera ALEATORIA de 1-3 s antes de cada mensaje (chateando)

// Entrada del historial: mensaje del contacto ("them") o una ELECCIÓN nuestra ya resuelta ("pick").
type Entry = { kind: "them"; text: string } | { kind: "pick"; a: string; b: string; sel: 0 | 1 };
const sameArr = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const progressOf = (g: GameState): Record<string, number[]> => (g.fax_progress ?? {}) as Record<string, number[]>;

// Recorre un bloque aplicando sus elecciones: historial (mensajes + picks) + nodo actual pendiente.
function traceBlock(block: FaxBlock, picks: number[]): { entries: Entry[]; curId: string | null } {
  const entries: Entry[] = [];
  let id: string | null = block.start;
  for (let i = 0; i < picks.length; i++) {
    if (id === null) break;
    const node: FaxNode | undefined = block.nodes[id];
    if (!node) { id = null; break; }
    for (const t of node.incoming) entries.push({ kind: "them", text: t });
    const sel: 0 | 1 = picks[i] === 1 ? 1 : 0;
    entries.push({ kind: "pick", a: node.a?.text ?? "", b: node.b?.text ?? "", sel });
    id = (sel === 0 ? node.a?.next : node.b?.next) ?? null;
  }
  if (id !== null) {
    const node: FaxNode | undefined = block.nodes[id];
    if (node) for (const t of node.incoming) entries.push({ kind: "them", text: t });
    else id = null;
  }
  return { entries, curId: id };
}

// Sesión = al abrir: bloques desbloqueados EN ORDEN; los completos van al historial; el primer incompleto es el
// ACTIVO (con el que se chatea). Se para en el primero incompleto (guard: no se muestran los siguientes).
type Session = { history: Entry[]; block: FaxBlock | null; picks: number[]; entries: Entry[]; curId: string | null };
function computeSession(g: GameState | null): Session {
  if (!g) return { history: [], block: null, picks: [], entries: [], curId: null };
  const prog = progressOf(g);
  const history: Entry[] = [];
  for (const block of BLOCKS) {
    if (!triggerMet(block.trigger, g)) continue; // no desbloqueado: sáltalo (se mantiene el orden)
    const picks = prog[block.id] ?? [];
    const { entries, curId } = traceBlock(block, picks);
    const node = curId !== null ? block.nodes[curId] : null;
    const complete = !node || (!node.a && !node.b);
    if (complete) { history.push(...entries); continue; }
    return { history, block, picks, entries, curId };
  }
  return { history, block: null, picks: [], entries: [], curId: null };
}

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const gs = useGameState();                           // estado compartido (ya cargado al abrir la app)
  const bootRef = useRef<Session>(computeSession(getGameState())); // sesión fijada al MONTAR
  const boot = bootRef.current;

  const [shown, setShown] = useState<Entry[]>(() => [...boot.history, ...boot.entries]); // historial + bloque activo
  const [live, setLive] = useState<string | null>(null); // mensaje entrante tecleándose (char a char)
  const [typing, setTyping] = useState(false);            // "..." durante la espera previa (chateando)
  const [delivering, setDelivering] = useState(false);    // llegando mensajes en vivo: opciones ocultas
  const [curId, setCurId] = useState<string | null>(boot.curId);
  const [ready, setReady] = useState(getGameState() !== null);

  const historyRef = useRef<Entry[]>(boot.history);   // historial de bloques completos (fijo en la sesión)
  const blockRef = useRef<FaxBlock | null>(boot.block); // bloque ACTIVO de esta sesión (fijo)
  const curIdRef = useRef<string | null>(boot.curId); // nodo actual del bloque activo (SÍNCRONO)
  const renderedRef = useRef<number[]>(boot.picks.slice()); // picks del bloque activo YA pintados
  const deliveringRef = useRef(false);
  const pausedRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const timerRef = useRef<number | null>(null);
  const didInitRef = useRef(getGameState() !== null); // ¿ya inicializado? (si gs llegó después del montaje, no)
  const markedRef = useRef(false); // ¿ya marcado leído en esta apertura?
  const threadRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => { if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const finishStep = () => { deliveringRef.current = false; setDelivering(false); };

  // Reconstruye la parte del BLOQUE ACTIVO (instantánea) sobre el historial fijo. Reconcilia avances remotos/reset.
  function rebuildBlock(picks: number[]) {
    clearTimer(); setLive(null); setTyping(false);
    const block = blockRef.current;
    const tr = block ? traceBlock(block, picks) : { entries: [] as Entry[], curId: null };
    setShown([...historyRef.current, ...tr.entries]);
    curIdRef.current = tr.curId; setCurId(tr.curId);
    deliveringRef.current = false; setDelivering(false);
    renderedRef.current = picks.slice();
  }

  // ── Entrega EN VIVO dentro del bloque activo: "..." (espera 1-3 s) + typewriter; new-message al terminar ──
  function typeMessage(text: string) {
    if (prefersReduced()) {
      setShown((s) => [...s, { kind: "them", text }]);
      setLive(null);
      playSfx("/audio/new-message.mp3", 0.6);
      if (queueRef.current.length > 0) pumpTyping(); else finishStep();
      return;
    }
    let i = 0;
    setLive("");
    const tick = () => {
      i++;
      setLive(text.slice(0, i));
      if (i < text.length) { timerRef.current = window.setTimeout(tick, TYPE_STEP); return; }
      setShown((s) => [...s, { kind: "them", text }]);
      setLive(null);
      playSfx("/audio/new-message.mp3", 0.6); // al TERMINAR de aparecer el mensaje
      if (queueRef.current.length > 0) pumpTyping(); else finishStep();
    };
    timerRef.current = window.setTimeout(tick, TYPE_STEP);
  }
  function pumpTyping() {
    if (queueRef.current.length === 0) { setTyping(false); finishStep(); return; }
    const next = queueRef.current.shift()!;
    setTyping(true);
    timerRef.current = window.setTimeout(() => { setTyping(false); typeMessage(next); }, randWait());
  }
  function startLive(incoming: string[]) {
    clearTimer();
    queueRef.current = [...incoming];
    deliveringRef.current = true; setDelivering(true);
    setLive(null); setTyping(false);
    pumpTyping();
  }

  const block = blockRef.current;
  const curNode = block && curId !== null ? block.nodes[curId] : null; // nodo pendiente (opciones interactivas)

  const persistChoice = (blockId: string, stepIdx: number, pick: number) => {
    void applyRpc("fax_choose", { p_block: blockId, p_step: stepIdx, p_pick: pick });
  };

  const choose = (which: "A" | "B") => {
    if (pausedRef.current || deliveringRef.current) return; // no elegir mientras el contacto escribe
    const b = blockRef.current;
    const id = curIdRef.current;
    if (!b || id === null) return;
    const node = b.nodes[id];
    if (!node) return;
    const chosen = which === "A" ? node.a : node.b;
    if (!chosen) return;
    const sel: 0 | 1 = which === "A" ? 0 : 1;
    playSfx("/audio/my-message.mp3", 0.6); // sonido al mandar NUESTRA respuesta
    setShown((s) => [...s, { kind: "pick", a: node.a?.text ?? "", b: node.b?.text ?? "", sel }]); // bloquea los recuadros
    const stepIdx = renderedRef.current.length;
    renderedRef.current = [...renderedRef.current, sel];
    const nextId = chosen.next;
    curIdRef.current = nextId; setCurId(nextId);
    persistChoice(b.id, stepIdx, sel);
    const nextNode = nextId !== null ? b.nodes[nextId] : null;
    if (nextNode) startLive(nextNode.incoming); else finishStep(); // ella responde con "..." + typewriter (o fin del bloque)
  };

  // carga inicial (si gs llegó tras montar) y reconciliación del BLOQUE ACTIVO (avance remoto / reset). Los
  // bloques que se desbloqueen después NO se traen aquí: aparecen al volver a abrir el Fax (opción "inbox").
  useEffect(() => {
    if (!gs) return;
    if (!didInitRef.current) { // gs llegó después del montaje: inicializa la sesión ahora (instantáneo)
      didInitRef.current = true;
      const s = computeSession(gs);
      historyRef.current = s.history; blockRef.current = s.block;
      curIdRef.current = s.curId; renderedRef.current = s.picks.slice();
      setShown([...s.history, ...s.entries]); setCurId(s.curId); setReady(true);
      return;
    }
    const b = blockRef.current;
    if (b) {
      const picks = progressOf(gs)[b.id] ?? [];
      if (!sameArr(picks, renderedRef.current)) rebuildBlock(picks);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);

  // al abrir el Fax (una vez, cuando haya estado): marca leído = guarda cuántos bloques hay disponibles.
  // El aviso "!" del menú se muestra cuando (bloques disponibles) > fax_seen.
  useEffect(() => {
    if (gs && !markedRef.current) {
      markedRef.current = true;
      if (unlockedCount(gs) > (gs.fax_seen ?? 0)) void applyRpc("fax_mark_read", { p_seen: unlockedCount(gs) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);
  useEffect(() => () => clearTimer(), []); // limpia el timer de typing al salir

  // auto-scroll al fondo con cada cambio
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [shown, live, typing]);

  useImperativeHandle(ref, () => ({
    handleKey: (k: string) => { const u = k.toLowerCase(); if (u === "a") choose("A"); else if (u === "b") choose("B"); },
    setPaused: (v: boolean) => { pausedRef.current = v; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const showChoices = ready && !delivering && !!curNode?.a && !!curNode?.b;

  return (
    <div className="fax win98">
      <header className="fax-head">
        <div className="fax-avatar" aria-hidden="true" />
        <div className="fax-id">
          <span className="fax-contact">???</span>
          <span className="fax-status">Conectado</span>
        </div>
      </header>
      <div className="fax-thread sunken-panel" ref={threadRef}>
        {shown.map((m, i) => (
          m.kind === "them" ? (
            <div key={i} className="fax-msg them"><span className="fax-text">{m.text}</span></div>
          ) : (
            /* elección resuelta: los dos recuadros BLOQUEADOS (la elegida con borde negro, la otra atenuada) */
            <div key={i} className="fax-choices locked">
              <div className={"fax-choice" + (m.sel === 0 ? " picked" : " dim")}>{m.a}</div>
              <div className={"fax-choice" + (m.sel === 1 ? " picked" : " dim")}>{m.b}</div>
            </div>
          )
        ))}
        {live !== null && (
          <div className="fax-msg them"><span className="fax-text">{live}</span></div>
        )}
        {typing && (
          <div className="fax-typing">
            <svg className="fax-dots" viewBox="0 0 20 4" aria-hidden="true">
              <rect x="0" y="0" width="4" height="4" />
              <rect x="8" y="0" width="4" height="4" />
              <rect x="16" y="0" width="4" height="4" />
            </svg>
          </div>
        )}
        {/* justo debajo del último mensaje, DENTRO del panel: las dos respuestas (dos recuadros al 50%) */}
        {showChoices && curNode && (
          <div className="fax-choices">
            <div className="fax-choice" onClick={() => choose("A")}>{curNode.a!.text}</div>
            <div className="fax-choice" onClick={() => choose("B")}>{curNode.b!.text}</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default Fax;
