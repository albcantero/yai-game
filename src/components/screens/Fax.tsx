import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// FAX ELECTRÓNICO (pantalla `registro`): mensajería estilo MSN (Windows XP) con el chat con el informante
// (contacto "???", aún sin revelar que es Miquela Quirós). Mensajes a lo ancho (sin burbujas izq/der); como
// el chat es SOLO con ella, los suyos no llevan etiqueta (es evidente), y los nuestros van marcados "Nosotras:".
// Abajo, las dos respuestas: una a la izquierda y otra a la derecha.
//
// Ritmo: antes de cada mensaje del contacto se muestra "Escribiendo..." una ESPERA ALEATORIA de 1-3 s, y luego
// el mensaje aparece con efecto TYPEWRITER (carácter a carácter, misma idea que el typeLine de Terminal.tsx).
// Las opciones solo salen cuando ha terminado de escribir todo el paso.
//
// v1 (BOCETO): guion lineal de RELLENO (placeholder). Ambas opciones avanzan igual por ahora.
type Step = { incoming: string[]; a: string; b: string };
const SCRIPT: Step[] = [
  { incoming: ["¿Estáis dentro?", "No tengo mucho tiempo, así que escuchad bien"],
    a: "Sí, estamos en el almacén", b: "¿Quién eres?" },
  { incoming: ["El cuadro de luces del fondo es un señuelo", "Detrás hay una puerta que no deberíais poder abrir"],
    a: "¿Y cómo la abrimos?", b: "¿Por qué nos ayudas?" },
  { incoming: ["Cada sala esconde una llave", "Id sumándolas. Yo os guío desde aquí"],
    a: "De acuerdo", b: "Esto no me da buena espina" },
];

const TYPE_STEP = 28; // ms por carácter (typewriter, como el typeLine de Terminal)
const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const randWait = () => 1000 + Math.random() * 2000; // espera ALEATORIA de 1-3 s antes de cada mensaje

type Msg = { from: "them" | "me"; text: string };

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const [msgs, setMsgs] = useState<Msg[]>([]);       // mensajes ya completos
  const [live, setLive] = useState<string | null>(null); // mensaje entrante tecleándose (char a char); null = ninguno
  const [typing, setTyping] = useState(false);       // "Escribiendo..." durante la espera previa
  const [delivering, setDelivering] = useState(true); // llegando mensajes: las opciones quedan ocultas
  const [step, setStep] = useState(0);

  const stepRef = useRef(0);          // paso actual SÍNCRONO (teclas + guard de choose)
  const deliveringRef = useRef(true); // ídem (no elegir mientras llegan mensajes)
  const pausedRef = useRef(false);    // el armazón pausa la pantalla (diálogo/candado abiertos)
  const queueRef = useRef<string[]>([]);   // mensajes entrantes pendientes de teclear
  const timerRef = useRef<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => { if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const finishStep = () => { deliveringRef.current = false; setDelivering(false); }; // cola vacía: aparecen las opciones

  // Teclea un mensaje del contacto carácter a carácter; al acabar lo confirma y pasa al siguiente (o termina).
  function typeMessage(text: string) {
    if (prefersReduced()) { // movimiento reducido: aparece de golpe
      setMsgs((m) => [...m, { from: "them", text }]);
      setLive(null);
      if (queueRef.current.length > 0) timerRef.current = window.setTimeout(pumpTyping, randWait());
      else finishStep();
      return;
    }
    let i = 0;
    setLive("");
    const tick = () => {
      i++;
      setLive(text.slice(0, i));
      if (i < text.length) { timerRef.current = window.setTimeout(tick, TYPE_STEP); return; }
      setMsgs((m) => [...m, { from: "them", text }]); // completo: lo fija
      setLive(null);
      if (queueRef.current.length > 0) timerRef.current = window.setTimeout(pumpTyping, randWait());
      else finishStep();
    };
    timerRef.current = window.setTimeout(tick, TYPE_STEP);
  }

  // Muestra "Escribiendo..." una espera aleatoria de 1-3 s y luego teclea el siguiente mensaje de la cola.
  function pumpTyping() {
    if (queueRef.current.length === 0) { setTyping(false); finishStep(); return; }
    const next = queueRef.current.shift()!;
    setTyping(true);
    timerRef.current = window.setTimeout(() => { setTyping(false); typeMessage(next); }, randWait());
  }

  function startDelivery(incoming: string[]) {
    clearTimer();
    queueRef.current = [...incoming];
    deliveringRef.current = true;
    setDelivering(true);
    setLive(null);
    setTyping(false);
    pumpTyping();
  }

  // Al montar: el contacto empieza a escribir el primer paso. Limpia el timer al desmontar.
  useEffect(() => { startDelivery(SCRIPT[0].incoming); return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll al fondo con cada cambio (mensaje nuevo, tecleo en curso o "Escribiendo...")
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs, live, typing]);

  const current = step < SCRIPT.length ? SCRIPT[step] : null;

  const choose = (which: "A" | "B") => {
    if (pausedRef.current || deliveringRef.current) return; // no elegir mientras el contacto escribe
    const s = stepRef.current;
    if (s >= SCRIPT.length) return;
    const cur = SCRIPT[s];
    const reply = which === "A" ? cur.a : cur.b;
    const next = SCRIPT[s + 1];
    stepRef.current = s + 1;
    playSfx("/audio/terminal-simple-button.mp3");
    setStep(s + 1);
    setMsgs((m) => [...m, { from: "me", text: reply }]); // la respuesta propia, al instante
    if (next) startDelivery(next.incoming);              // el contacto empieza a escribir lo siguiente
  };

  useImperativeHandle(ref, () => ({
    handleKey: (k: string) => { const u = k.toLowerCase(); if (u === "a") choose("A"); else if (u === "b") choose("B"); },
    setPaused: (v: boolean) => { pausedRef.current = v; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const showChoices = !delivering && current !== null;

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
          <div key={i} className={"fax-msg " + m.from}>
            {m.from === "me" && <span className="fax-from">Nosotras:</span>}
            <span className="fax-text">{m.text}</span>
          </div>
        ))}
        {live !== null && (
          <div className="fax-msg them"><span className="fax-text">{live}</span></div>
        )}
        {typing && (
          <div className="fax-typing"><span className="fax-dots"><i>.</i><i>.</i><i>.</i></span></div>
        )}
      </div>
      {/* abajo: las dos respuestas (una a la izquierda, otra a la derecha). Sin letras A/B: solo el texto. */}
      {showChoices && (
        <div className="fax-choices">
          <div className="fax-choice left" onClick={() => choose("A")}>{current!.a}</div>
          <div className="fax-choice right" onClick={() => choose("B")}>{current!.b}</div>
        </div>
      )}
    </div>
  );
});

export default Fax;
