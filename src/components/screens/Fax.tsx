import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// FAX ELECTRÓNICO (pantalla `registro`): mensajería tipo Lifeline. El contacto es "???" (aún NO se revela
// que es Miquela Quirós). Hilo de mensajes (entrantes a la izquierda, respuestas propias a la derecha) y,
// abajo, DOS columnas con las opciones A y B que las jugadoras eligen para responder.
//
// v1 (BOCETO): guion lineal de RELLENO (placeholder). Al elegir A o B se añade la respuesta como mensaje
// propio y se avanza al siguiente paso (ambas opciones avanzan igual por ahora; la ramificación y el
// contenido real vendrán después, igual que el efecto "escribiendo..." con retardo tipo Lifeline).
type Step = { incoming: string[]; a: string; b: string };
const SCRIPT: Step[] = [
  { incoming: ["¿Estáis dentro?", "No tengo mucho tiempo, así que escuchad bien"],
    a: "Sí, estamos en el almacén", b: "¿Quién eres?" },
  { incoming: ["El cuadro de luces del fondo es un señuelo", "Detrás hay una puerta que no deberíais poder abrir"],
    a: "¿Y cómo la abrimos?", b: "¿Por qué nos ayudas?" },
  { incoming: ["Cada sala esconde una llave", "Id sumándolas. Yo os guío desde aquí"],
    a: "De acuerdo", b: "Esto no me da buena espina" },
];

type Msg = { from: "them" | "me"; text: string };

const Fax = forwardRef<ScreenHandle, ScreenServices>(function Fax({ playSfx }, ref) {
  const [msgs, setMsgs] = useState<Msg[]>(() => SCRIPT[0].incoming.map((text) => ({ from: "them", text })));
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);       // paso actual SÍNCRONO (para responder a teclas sin closure obsoleto)
  const pausedRef = useRef(false); // el armazón pausa la pantalla (candado/diálogo abiertos)
  const threadRef = useRef<HTMLDivElement>(null);

  // auto-scroll al fondo con cada mensaje nuevo
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs]);

  const current = step < SCRIPT.length ? SCRIPT[step] : null; // paso para PINTAR las opciones (estado)

  const choose = (which: "A" | "B") => {
    if (pausedRef.current) return;
    const s = stepRef.current;
    if (s >= SCRIPT.length) return;
    const cur = SCRIPT[s];
    const reply = which === "A" ? cur.a : cur.b;
    const next = SCRIPT[s + 1];
    stepRef.current = s + 1;
    playSfx("/audio/terminal-simple-button.mp3");
    setStep(s + 1);
    setMsgs((m) => [...m, { from: "me", text: reply }, ...(next ? next.incoming.map((t) => ({ from: "them" as const, text: t })) : [])]);
  };

  useImperativeHandle(ref, () => ({
    handleKey: (k: string) => { const u = k.toLowerCase(); if (u === "a") choose("A"); else if (u === "b") choose("B"); },
    setPaused: (v: boolean) => { pausedRef.current = v; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  return (
    <div className="fax">
      <header className="fax-head">
        <span className="fax-contact">???</span>
        <span className="fax-status">En línea</span>
      </header>
      <div className="fax-thread" ref={threadRef}>
        {msgs.map((m, i) => (<div key={i} className={"fax-msg " + m.from}>{m.text}</div>))}
      </div>
      {/* abajo: DOS columnas con las opciones A y B (las respuestas que eligen las jugadoras) */}
      <div className="fax-choices">
        <button type="button" className="fax-choice" onClick={() => choose("A")} disabled={!current}>
          <span className="fax-key">A</span>
          <span className="fax-opt">{current ? current.a : "—"}</span>
        </button>
        <button type="button" className="fax-choice" onClick={() => choose("B")} disabled={!current}>
          <span className="fax-key">B</span>
          <span className="fax-opt">{current ? current.b : "—"}</span>
        </button>
      </div>
    </div>
  );
});

export default Fax;
