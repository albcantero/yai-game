import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// FAX ELECTRÓNICO (pantalla `registro`): mensajería tipo Lifeline. El contacto es "???" (aún NO se revela
// que es Miquela Quirós). Hilo de mensajes (entrantes a la izquierda, respuestas propias a la derecha) y,
// abajo, DOS columnas con las opciones A y B que las jugadoras eligen para responder.
//
// Ritmo Lifeline: los mensajes del contacto NO aparecen de golpe. Antes de cada uno se muestra "Escribiendo..."
// durante 3 s (la pausa entre mensajes) y luego aparece. Las opciones A/B solo salen cuando ha terminado de
// escribir todo el paso. Al elegir, la respuesta propia aparece al instante y el contacto empieza a escribir
// las siguientes.
//
// v1 (BOCETO): guion lineal de RELLENO (placeholder). Ambas opciones avanzan igual por ahora; la ramificación
// y el contenido real vendrán después.
type Step = { incoming: string[]; a: string; b: string };
const SCRIPT: Step[] = [
  { incoming: ["¿Estáis dentro?", "No tengo mucho tiempo, así que escuchad bien"],
    a: "Sí, estamos en el almacén", b: "¿Quién eres?" },
  { incoming: ["El cuadro de luces del fondo es un señuelo", "Detrás hay una puerta que no deberíais poder abrir"],
    a: "¿Y cómo la abrimos?", b: "¿Por qué nos ayudas?" },
  { incoming: ["Cada sala esconde una llave", "Id sumándolas. Yo os guío desde aquí"],
    a: "De acuerdo", b: "Esto no me da buena espina" },
];

const TYPING_MS = 3000; // "Escribiendo..." antes de cada mensaje (la pausa de 3 s)
const GAP_MS = 400;     // respiro tras un mensaje antes de volver a "Escribiendo..."

type Msg = { from: "them" | "me"; text: string };

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);       // muestra la burbuja "Escribiendo..."
  const [delivering, setDelivering] = useState(true); // llegando mensajes: las opciones quedan ocultas
  const [step, setStep] = useState(0);

  const stepRef = useRef(0);          // paso actual SÍNCRONO (para teclas y para el guard de choose)
  const deliveringRef = useRef(true); // ídem (no elegir mientras llegan mensajes)
  const pausedRef = useRef(false);    // el armazón pausa la pantalla (diálogo/candado abiertos)
  const queueRef = useRef<string[]>([]);            // mensajes entrantes pendientes de revelar
  const timerRef = useRef<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => { if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; } };

  // Entrega la cola: "Escribiendo..." 3 s → revela un mensaje → (respiro) → repite. Al vaciarse: aparecen las opciones.
  const pump = () => {
    if (queueRef.current.length === 0) { setTyping(false); deliveringRef.current = false; setDelivering(false); return; }
    setTyping(true);
    timerRef.current = window.setTimeout(() => {
      const next = queueRef.current.shift()!;
      setMsgs((m) => [...m, { from: "them", text: next }]);
      setTyping(false);
      if (queueRef.current.length > 0) timerRef.current = window.setTimeout(pump, GAP_MS);
      else { deliveringRef.current = false; setDelivering(false); }
    }, TYPING_MS);
  };

  const startDelivery = (incoming: string[]) => {
    clearTimer();
    queueRef.current = [...incoming];
    deliveringRef.current = true;
    setDelivering(true);
    pump();
  };

  // Al montar: el contacto empieza a escribir el primer paso. Limpia el timer al desmontar.
  useEffect(() => { startDelivery(SCRIPT[0].incoming); return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll al fondo con cada mensaje nuevo (y al aparecer/desaparecer "Escribiendo...")
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs, typing]);

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
        <span className="fax-contact">???</span>
        <span className="fax-status">En línea</span>
      </header>
      <div className="fax-thread sunken-panel" ref={threadRef}>
        {msgs.map((m, i) => (<div key={i} className={"fax-msg " + m.from}>{m.text}</div>))}
        {typing && (
          <div className="fax-msg them fax-typing">
            Escribiendo<span className="fax-dots"><i>.</i><i>.</i><i>.</i></span>
          </div>
        )}
      </div>
      {/* abajo: DOS columnas con las opciones A y B (solo cuando el contacto ha terminado de escribir) */}
      {showChoices && (
        <div className="fax-choices">
          <button type="button" className="fax-choice" onClick={() => choose("A")}>
            <span className="fax-key">A</span>
            <span className="fax-opt">{current!.a}</span>
          </button>
          <button type="button" className="fax-choice" onClick={() => choose("B")}>
            <span className="fax-key">B</span>
            <span className="fax-opt">{current!.b}</span>
          </button>
        </div>
      )}
    </div>
  );
});

export default Fax;
