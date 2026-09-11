import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState, getGameState, applyRpc } from "../../lib/gameState";

// FAX ELECTRÓNICO (pantalla `registro`): chat con el informante ("???", aún sin revelar que es Miquela).
// Los mensajes que ELLA deja aparecen de golpe (sin typing); al CHATEAR (tras responderle) su respuesta llega
// con "..." + typewriter. Nuestra respuesta NO se manda como burbuja: los dos recuadros quedan bloqueados
// (la elegida con borde negro, la otra atenuada) como registro.
//
// PERSISTENCIA (game_state, fila 'live', COMPARTIDA + realtime, como el resto del juego): solo se guarda
// `fax_picks` (las elecciones en orden); toda la conversación se reconstruye del SCRIPT. Al entrar se
// reconstruye INSTANTÁNEO (no se reinicia ni se re-tipea); solo se anima lo NUEVO de esta sesión. Las
// elecciones se persisten con la RPC atómica `fax_choose`.
//
// v1 (BOCETO): guion lineal de RELLENO tras el primer intercambio (placeholder).
type Step = { incoming: string[]; a: string; b: string };
const SCRIPT: Step[] = [
  { incoming: ["A ver, hmm. ¡Probando!", "¿Hola...? ¿Hay alguien ahí?", "Espero que funcione este cacharro."],
    a: "Te recibimos, ¿y tú a nosotras? Gracias por ayudarnos.", b: "Funciona. Pero ¿quién eres?" },
  { incoming: ["El cuadro de luces del fondo es un señuelo", "Detrás hay una puerta que no deberíais poder abrir"],
    a: "¿Y cómo la abrimos?", b: "¿Por qué nos ayudas?" },
  { incoming: ["Cada sala esconde una llave", "Id sumándolas. Yo os guío desde aquí"],
    a: "De acuerdo", b: "Esto no me da buena espina" },
];

const TYPE_STEP = 28; // ms por carácter (typewriter, como el typeLine de Terminal)
const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const randWait = () => 1000 + Math.random() * 2000; // espera ALEATORIA de 1-3 s antes de cada mensaje (chateando)

// Entrada del historial: mensaje del contacto ("them") o una ELECCIÓN nuestra ya resuelta ("pick").
type Entry = { kind: "them"; text: string } | { kind: "pick"; a: string; b: string; sel: 0 | 1 };
const sameArr = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Reconstruye las entradas del historial (mensajes del contacto + elecciones resueltas) desde las elecciones
// guardadas + el SCRIPT. Puro: se usa para el estado inicial (sin parpadeo) y en rebuild().
function buildEntries(picks: number[]): Entry[] {
  const entries: Entry[] = [];
  const n = Math.min(picks.length, SCRIPT.length);
  for (let i = 0; i < n; i++) {
    for (const t of SCRIPT[i].incoming) entries.push({ kind: "them", text: t });
    entries.push({ kind: "pick", a: SCRIPT[i].a, b: SCRIPT[i].b, sel: picks[i] === 1 ? 1 : 0 });
  }
  if (n < SCRIPT.length) for (const t of SCRIPT[n].incoming) entries.push({ kind: "them", text: t });
  return entries;
}

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const gs = useGameState();                     // estado compartido (ya cargado al abrir la app: sin parpadeo)
  const boot = getGameState()?.fax_picks ?? [];  // elecciones ya guardadas: inicializa el historial de golpe
  const bootStep = Math.min(boot.length, SCRIPT.length);
  const loaded = getGameState() !== null;

  const [msgs, setMsgs] = useState<Entry[]>(() => buildEntries(boot));
  const [live, setLive] = useState<string | null>(null); // mensaje entrante tecleándose (char a char); null = ninguno
  const [typing, setTyping] = useState(false);            // "..." durante la espera previa (chateando)
  const [delivering, setDelivering] = useState(!loaded);  // sin estado aún = "entregando"; con estado, opciones listas
  const [step, setStep] = useState(bootStep);
  const [ready, setReady] = useState(loaded);             // estado compartido cargado (evita parpadeo de opciones)

  const stepRef = useRef(bootStep);   // paso actual SÍNCRONO (teclas + guard de choose)
  const deliveringRef = useRef(!loaded);
  const pausedRef = useRef(false);    // el armazón pausa la pantalla (diálogo/candado abiertos)
  const queueRef = useRef<string[]>([]);        // mensajes entrantes pendientes de teclear (chateando)
  const timerRef = useRef<number | null>(null);
  const renderedRef = useRef<number[]>(boot.slice());     // elecciones YA pintadas (para reconciliar con la DB)
  const threadRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => { if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const finishStep = () => { deliveringRef.current = false; setDelivering(false); }; // cola vacía: aparecen las opciones

  // Reconstruye TODA la conversación (INSTANTÁNEA) desde las elecciones guardadas + el SCRIPT. Se usa al cargar
  // y para reconciliar si otra jugadora avanzó (o hubo reset): así al entrar no se reinicia ni se re-tipea.
  function rebuild(picks: number[]) {
    clearTimer();
    setLive(null);
    setTyping(false);
    setMsgs(buildEntries(picks));
    const n = Math.min(picks.length, SCRIPT.length);
    stepRef.current = n; setStep(n);
    deliveringRef.current = false; setDelivering(false);
    renderedRef.current = picks.slice();
  }

  // ── Entrega EN VIVO (chateando): antes de cada mensaje, "..." una espera aleatoria de 1-3 s y luego typewriter ──
  function typeMessage(text: string) {
    if (prefersReduced()) { // movimiento reducido: aparece de golpe
      setMsgs((m) => [...m, { kind: "them", text }]);
      setLive(null);
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

  const current = step < SCRIPT.length ? SCRIPT[step] : null;

  // persiste la elección por RPC atómica (actualiza el store; realtime sincroniza al resto). Fire-and-forget:
  // el estado local ya se reflejó de forma optimista; si hay carrera, la reconciliación por `gs` lo corrige.
  const persistChoice = (stepIdx: number, pick: number) => {
    void applyRpc("fax_choose", { p_step: stepIdx, p_pick: pick });
  };

  const choose = (which: "A" | "B") => {
    if (pausedRef.current || deliveringRef.current) return; // no elegir mientras el contacto escribe
    const s = stepRef.current;
    if (s >= SCRIPT.length) return;
    const cur = SCRIPT[s];
    const sel: 0 | 1 = which === "A" ? 0 : 1;
    const next = SCRIPT[s + 1];
    playSfx("/audio/terminal-simple-button.mp3");
    setMsgs((m) => [...m, { kind: "pick", a: cur.a, b: cur.b, sel }]); // optimista: bloquea los recuadros
    renderedRef.current = [...renderedRef.current, sel];
    stepRef.current = s + 1; setStep(s + 1);
    persistChoice(s, sel);
    if (next) startLive(next.incoming); else finishStep(); // CHATEANDO: la respuesta llega con "..." + typewriter
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

  const showChoices = ready && !delivering && current !== null;

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
        {showChoices && (
          <div className="fax-choices">
            <div className="fax-choice" onClick={() => choose("A")}>{current!.a}</div>
            <div className="fax-choice" onClick={() => choose("B")}>{current!.b}</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default Fax;
