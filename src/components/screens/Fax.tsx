import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { supabase, ensureSession } from "../../lib/supabase";

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
  { incoming: ["¡Hola!", "¿Hola...? ¿Hay alguien ahí?", "No sé si funciona este cacharro."],
    a: "Hola. Sí recibimos tus mensajes. Gracias por ayudarnos.", b: "Funciona. Pero ¿quién eres?" },
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

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const [msgs, setMsgs] = useState<Entry[]>([]);
  const [live, setLive] = useState<string | null>(null); // mensaje entrante tecleándose (char a char); null = ninguno
  const [typing, setTyping] = useState(false);            // "..." durante la espera previa (chateando)
  const [delivering, setDelivering] = useState(true);     // llegando mensajes: las opciones quedan ocultas
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);              // estado compartido cargado (evita parpadeo de opciones)

  const stepRef = useRef(0);          // paso actual SÍNCRONO (teclas + guard de choose)
  const deliveringRef = useRef(true);
  const pausedRef = useRef(false);    // el armazón pausa la pantalla (diálogo/candado abiertos)
  const queueRef = useRef<string[]>([]);        // mensajes entrantes pendientes de teclear (chateando)
  const timerRef = useRef<number | null>(null);
  const renderedRef = useRef<number[]>([]);     // elecciones YA pintadas (para reconciliar con la DB)
  const threadRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => { if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const finishStep = () => { deliveringRef.current = false; setDelivering(false); }; // cola vacía: aparecen las opciones

  // Reconstruye TODA la conversación (INSTANTÁNEA) desde las elecciones guardadas + el SCRIPT. Se usa al cargar
  // y para reconciliar si otra jugadora avanzó (o hubo reset): así al entrar no se reinicia ni se re-tipea.
  function rebuild(picks: number[]) {
    clearTimer();
    setLive(null);
    setTyping(false);
    const entries: Entry[] = [];
    const n = Math.min(picks.length, SCRIPT.length);
    for (let i = 0; i < n; i++) {
      for (const t of SCRIPT[i].incoming) entries.push({ kind: "them", text: t });
      entries.push({ kind: "pick", a: SCRIPT[i].a, b: SCRIPT[i].b, sel: picks[i] === 1 ? 1 : 0 });
    }
    if (n < SCRIPT.length) for (const t of SCRIPT[n].incoming) entries.push({ kind: "them", text: t });
    setMsgs(entries);
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

  // persiste la elección (RPC atómica; realtime sincroniza al resto). Fire-and-forget: el estado local ya se
  // ha reflejado de forma optimista, y al recargar se leerá de la DB.
  const persistChoice = async (stepIdx: number, pick: number) => {
    try { await ensureSession(); await supabase.rpc("fax_choose", { p_step: stepIdx, p_pick: pick }); } catch { /* realtime/recarga reconcilian */ }
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
    void persistChoice(s, sel);
    if (next) startLive(next.incoming); else finishStep(); // CHATEANDO: la respuesta llega con "..." + typewriter
  };

  // carga la fila 'live' (fax_picks), reconstruye, marca leído y se suscribe a realtime (estado compartido)
  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const apply = (picks: number[]) => { if (!sameArr(picks, renderedRef.current)) rebuild(picks); }; // reconcilia (remoto/reset)
    ensureSession().then(() => {
      if (!alive) return;
      supabase.from("game_state").select("fax_picks").eq("id", "live").single().then(({ data }) => {
        if (!alive) return;
        const picks = Array.isArray((data as { fax_picks?: number[] } | null)?.fax_picks) ? (data as { fax_picks: number[] }).fax_picks : [];
        rebuild(picks);
        setReady(true);
        supabase.rpc("fax_mark_read").then(() => {}, () => {}); // marca leído al abrir (para el futuro aviso)
      });
      ch = supabase.channel("gs-fax")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_state" }, (p) => {
          const n = p.new as { fax_picks?: number[] };
          if (n && Array.isArray(n.fax_picks)) apply(n.fax_picks); // ignora payloads sin fax_picks (redactados)
        })
        .subscribe();
    }).catch(() => {});
    return () => { alive = false; clearTimer(); if (ch) supabase.removeChannel(ch); };
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
