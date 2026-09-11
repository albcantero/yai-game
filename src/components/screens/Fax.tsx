import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState, getGameState, applyRpc } from "../../lib/gameState";
import { DIALOG, FAX_START, type FaxNode } from "../../game/fax";

// FAX ELECTRÓNICO (pantalla `registro`): chat con el informante ("???", aún sin revelar que es Miquela).
// Los mensajes que ELLA deja aparecen de golpe (sin typing); al CHATEAR (tras responderle) su respuesta llega
// con "..." + typewriter, y suena "new-message" al APARECER cada mensaje (no con los "..."). Nuestra respuesta
// NO se manda como burbuja: los dos recuadros quedan bloqueados (elegida con borde negro, otra atenuada).
//
// El guion es un GRAFO RAMIFICADO (src/game/fax.ts): cada respuesta lleva a su propio nodo. La partida solo
// guarda la SECUENCIA de elecciones (game_state.fax_picks), que determina el camino recorrido.
//
// PERSISTENCIA (game_state, fila 'live', COMPARTIDA + realtime): al entrar se reconstruye INSTANTÁNEO desde
// fax_picks (no se reinicia ni se re-tipea); solo se anima lo NUEVO de esta sesión. Las elecciones se
// persisten con la RPC atómica `fax_choose`.

const TYPE_STEP = 28; // ms por carácter (typewriter, como el typeLine de Terminal)
const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const randWait = () => 1000 + Math.random() * 2000; // espera ALEATORIA de 1-3 s antes de cada mensaje (chateando)

// Entrada del historial: mensaje del contacto ("them") o una ELECCIÓN nuestra ya resuelta ("pick").
type Entry = { kind: "them"; text: string } | { kind: "pick"; a: string; b: string; sel: 0 | 1 };
const sameArr = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Recorre el grafo aplicando las elecciones guardadas: reconstruye el historial (mensajes + elecciones) y
// devuelve el nodo ACTUAL pendiente (`curId`), cuyas opciones se pintarán interactivas. Puro (sin parpadeo).
function trace(picks: number[]): { entries: Entry[]; curId: string | null } {
  const entries: Entry[] = [];
  let id: string | null = FAX_START;
  for (let i = 0; i < picks.length; i++) {
    if (id === null) break;
    const node: FaxNode | undefined = DIALOG[id];
    if (!node) { id = null; break; }
    for (const t of node.incoming) entries.push({ kind: "them", text: t });
    const sel: 0 | 1 = picks[i] === 1 ? 1 : 0;
    entries.push({ kind: "pick", a: node.a?.text ?? "", b: node.b?.text ?? "", sel });
    id = (sel === 0 ? node.a?.next : node.b?.next) ?? null;
  }
  if (id !== null) {
    const node: FaxNode | undefined = DIALOG[id];
    if (node) for (const t of node.incoming) entries.push({ kind: "them", text: t });
    else id = null;
  }
  return { entries, curId: id };
}

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const gs = useGameState();                     // estado compartido (ya cargado al abrir la app: sin parpadeo)
  const boot = trace(getGameState()?.fax_picks ?? []); // recorrido inicial (para pintar el historial de golpe)
  const loaded = getGameState() !== null;

  const [msgs, setMsgs] = useState<Entry[]>(() => boot.entries);
  const [live, setLive] = useState<string | null>(null); // mensaje entrante tecleándose (char a char); null = ninguno
  const [typing, setTyping] = useState(false);            // "..." durante la espera previa (chateando)
  const [delivering, setDelivering] = useState(!loaded);  // sin estado aún = "entregando"; con estado, opciones listas
  const [curId, setCurId] = useState<string | null>(boot.curId);
  const [ready, setReady] = useState(loaded);             // estado compartido cargado (evita parpadeo de opciones)

  const curIdRef = useRef<string | null>(boot.curId); // nodo actual SÍNCRONO (teclas + guard de choose)
  const deliveringRef = useRef(!loaded);
  const pausedRef = useRef(false);    // el armazón pausa la pantalla (diálogo/candado abiertos)
  const queueRef = useRef<string[]>([]);        // mensajes entrantes pendientes de teclear (chateando)
  const timerRef = useRef<number | null>(null);
  const renderedRef = useRef<number[]>((getGameState()?.fax_picks ?? []).slice()); // elecciones YA pintadas (reconciliar con la DB)
  const threadRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => { if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const finishStep = () => { deliveringRef.current = false; setDelivering(false); }; // cola vacía: aparecen las opciones

  // Reconstruye TODA la conversación (INSTANTÁNEA) desde las elecciones guardadas. Se usa al cargar y para
  // reconciliar si otra jugadora avanzó (o hubo reset): así al entrar no se reinicia ni se re-tipea.
  function rebuild(picks: number[]) {
    clearTimer();
    setLive(null);
    setTyping(false);
    const { entries, curId: id } = trace(picks);
    setMsgs(entries);
    curIdRef.current = id; setCurId(id);
    deliveringRef.current = false; setDelivering(false);
    renderedRef.current = picks.slice();
  }

  // ── Entrega EN VIVO (chateando): antes de cada mensaje, "..." una espera aleatoria de 1-3 s y luego typewriter.
  //    Suena "new-message" al APARECER el mensaje (al empezar a teclearlo), NO con los "...". ──
  function typeMessage(text: string) {
    if (prefersReduced()) { // movimiento reducido: aparece de golpe
      setMsgs((m) => [...m, { kind: "them", text }]);
      setLive(null);
      playSfx("/audio/new-message.mp3", 0.6); // aparece de golpe = ya está el mensaje
      if (queueRef.current.length > 0) pumpTyping(); else finishStep();
      return;
    }
    let i = 0;
    setLive("");
    const tick = () => {
      i++;
      setLive(text.slice(0, i));
      if (i < text.length) { timerRef.current = window.setTimeout(tick, TYPE_STEP); return; }
      setMsgs((m) => [...m, { kind: "them", text }]);
      setLive(null);
      playSfx("/audio/new-message.mp3", 0.6); // al TERMINAR de aparecer (fin del typewriter) suena "mensaje nuevo"
      if (queueRef.current.length > 0) pumpTyping(); else finishStep(); // "..." al instante; la espera va dentro
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

  const curNode = curId !== null ? DIALOG[curId] : null;   // nodo pendiente (sus opciones se pintan interactivas)

  // persiste la elección por RPC atómica (actualiza el store; realtime sincroniza al resto). Fire-and-forget:
  // el estado local ya se reflejó de forma optimista; si hay carrera, la reconciliación por `gs` lo corrige.
  const persistChoice = (stepIdx: number, pick: number) => {
    void applyRpc("fax_choose", { p_step: stepIdx, p_pick: pick });
  };

  const choose = (which: "A" | "B") => {
    if (pausedRef.current || deliveringRef.current) return; // no elegir mientras el contacto escribe
    const id = curIdRef.current;
    if (id === null) return;
    const node: FaxNode | undefined = DIALOG[id];
    if (!node) return;
    const chosen = which === "A" ? node.a : node.b;
    if (!chosen) return; // esa opción no existe en este nodo
    const sel: 0 | 1 = which === "A" ? 0 : 1;
    playSfx("/audio/my-message.mp3", 0.6); // sonido al mandar NUESTRA respuesta (pulsar un recuadro)
    setMsgs((m) => [...m, { kind: "pick", a: node.a?.text ?? "", b: node.b?.text ?? "", sel }]); // optimista: bloquea los recuadros
    const stepIdx = renderedRef.current.length;
    renderedRef.current = [...renderedRef.current, sel];
    const nextId = chosen.next;
    curIdRef.current = nextId; setCurId(nextId);
    persistChoice(stepIdx, sel);
    const nextNode = nextId !== null ? DIALOG[nextId] : null;
    if (nextNode) startLive(nextNode.incoming); else finishStep(); // CHATEANDO: la respuesta llega con "..." + typewriter
  };

  // reconcilia con el estado compartido (carga inicial, avance remoto o reset): reconstruye INSTANTÁNEO si cambia
  useEffect(() => {
    if (!gs) return;
    const picks = gs.fax_picks ?? [];
    if (!sameArr(picks, renderedRef.current)) rebuild(picks);
    setReady(true); // idempotente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);

  // al abrir el Fax: marcar leído (para el futuro aviso de "mensajes nuevos"). Limpia el timer de typing al salir.
  useEffect(() => { void applyRpc("fax_mark_read"); return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll al fondo con cada cambio (mensaje nuevo, tecleo en curso o "...")
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs, live, typing]);

  useImperativeHandle(ref, () => ({
    handleKey: (k: string) => { const u = k.toLowerCase(); if (u === "a") choose("A"); else if (u === "b") choose("B"); },
    setPaused: (v: boolean) => { pausedRef.current = v; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const showChoices = ready && !delivering && !!curNode?.a && !!curNode?.b; // nodo de decisión (dos opciones)

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
        {msgs.map((m, i) => (
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
