// CANDADO PRINCIPAL. Cuerpo del candado en SVG (animado con Motion: intro, resultado correcto/incorrecto con
// shake, respuesta). Las RUEDAS de la combinación son dials tipo carrusel (HTML): arrastras arriba/abajo y ves
// el número centrado con el anterior/siguiente cortados (máscara de cilindro). Los botones Resolver/Cancelar son
// Win98 (98.css). Al acertar llama a onSolved (resolver puzzle + cerrar overlay). Estética provisional
// (blanco sobre oscuro); ya lo pasaremos a nuestro retro.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { animate, stagger } from "motion";

const RESTING = "hsl(120,50%,100%)"; // color en reposo del candado (verde muy claro, casi blanco)
const EASE_IO = "easeInOut"; // ≈ Power2.easeInOut del original
const ROW = 28; // alto/separación de cada número de la rueda (px); DEBE coincidir con .dial-num en padlock.css
const ITEM_ANGLE = 40; // grados que gira el cilindro por número (a más grados, cilindro más "cerrado"/curvado)
const RADIUS = Math.round((ROW / 2) / Math.tan((ITEM_ANGLE / 2) * Math.PI / 180)); // radio del cilindro (px)
const RENDER = 4; // slots renderizados a cada lado del centro (ventana FIJA que sigue al scroll; < 9 evita que el cilindro dé la vuelta y solape)

// Una RUEDA (dial) 3D: los números viven en un CILINDRO real (rotateX + translateZ bajo perspective). El del
// centro mira al frente; los de arriba/abajo se giran y se DESVANECEN (profundidad). Se arrastra en vertical
// para girarlo (wrap 0..9). No hay flechas: el carrusel ES la interacción.
function Dial({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (v: number) => void }) {
  const [drag, setDrag] = useState(0); // desplazamiento en vivo del arrastre (px)
  const [anim, setAnim] = useState(false); // transición al soltar (snap)
  const startY = useRef(0);
  const active = useRef(false);
  const settling = useRef(false); // en el snap post-soltar: ignora nuevos arrastres

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || settling.current) return;
    active.current = true;
    startY.current = e.clientY;
    setAnim(false);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!active.current) return;
    setDrag(e.clientY - startY.current);
  };
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    const steps = Math.round(drag / ROW); // nº de números movidos (sin límite: scroll largo válido)
    if (steps === 0) { setAnim(true); setDrag(0); return; } // no llega: vuelve al centro
    settling.current = true;
    setAnim(true);
    setDrag(steps * ROW); // gira hasta encajar en el número destino (solo anima la fracción)
    window.setTimeout(() => {
      onChange(((value - steps) % 10 + 10) % 10); // arrastrar hacia abajo (steps>0) = número anterior
      setAnim(false);
      setDrag(0); // el re-render ya centra el nuevo valor: sin salto visual
      settling.current = false;
    }, 190);
  };

  // ventana FIJA de slots que SIGUE al scroll: el centro se calcula en vivo, y solo pintamos unos pocos slots
  // alrededor. Así nunca hay dos números en el mismo punto del cilindro (adiós solapes/"runas" y el pop al soltar).
  const s = drag / ROW;        // desplazamiento continuo en números
  const r = Math.round(s);     // parte entera (números completos ya girados)
  const f = s - r;             // fracción (-0.5..0.5)
  const center = value - r;    // número que está AHORA en el centro (arrastrar hacia abajo = anterior)
  return (
    <div className="lock-dial" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
      <div className="dial-cylinder">
        {Array.from({ length: RENDER * 2 + 1 }, (_, i) => i - RENDER).map((k) => {
          const angle = -(k - f) * ITEM_ANGLE; // slot k del cilindro (corrige la fracción del arrastre)
          const opacity = Math.max(0, Math.cos((angle * Math.PI) / 180)); // los que giran hacia atrás se desvanecen
          return (
            <div className="dial-num" key={k}
              style={{ transform: `rotateX(${angle}deg) translateZ(${RADIUS}px)`, opacity, transition: anim ? "transform .19s ease-out, opacity .19s ease-out" : "none" }}>
              {((center + k) % 10 + 10) % 10}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type PadlockProps = {
  combo: number[]; // combinación correcta (un dígito 0..9 por rueda)
  onSolved: () => void; // combo correcto: el candado se abre → resolver el puzzle + cerrar el overlay
  onClose: () => void; // cancelar (backdrop / botón Cancelar): cerrar sin resolver
};

export default function Padlock({ combo, onSolved, onClose }: PadlockProps) {
  const [digits, setDigits] = useState<number[]>(() => combo.map(() => 0)); // ruedas (empiezan a 0)
  const [busy, setBusy] = useState(false); // hay animación en curso: bloquea ruedas y "Resolver"
  const [response, setResponse] = useState(""); // texto "CORRECTO"/"INCORRECTO"

  const bodyRef = useRef<SVGGElement>(null); // cuerpo del candado (escala + baja + shake)
  const boxRef = useRef<SVGRectElement>(null); // caja (color de relleno)
  const barRef = useRef<SVGPathElement>(null); // arco (color de trazo + sube/baja)
  const actionsRef = useRef<HTMLDivElement>(null); // botones Resolver/Cancelar (bajan + opacity)
  const responseRef = useRef<HTMLSpanElement>(null); // texto de respuesta (sube + opacity)
  const dialRefs = useRef<(HTMLDivElement | null)[]>([]); // cada rueda (baja + opacity, en stagger)
  const killed = useRef(false); // el componente se desmontó: cortar los awaits pendientes

  useEffect(() => () => { killed.current = true; }, []);

  const setDigit = (i: number, v: number) => setDigits((d) => d.map((x, j) => (j === i ? v : x)));
  const isCorrect = () => digits.every((v, i) => v === combo[i]);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dials = () => dialRefs.current.filter(Boolean) as HTMLDivElement[];

  // ---- fases de la animación ----
  const intro = async () => {
    animate(actionsRef.current!, { y: 60, opacity: 0 }, { duration: 0.5, ease: EASE_IO });
    await animate(dials(), { y: 130, opacity: 0 }, { duration: 0.5, delay: stagger(0.1), ease: EASE_IO }).finished;
    await animate(bodyRef.current!, { y: 30 }, { duration: 0.5, ease: EASE_IO }).finished;
    await Promise.all([
      animate(bodyRef.current!, { scale: 0.9 }, { duration: 1, ease: EASE_IO }).finished,
      animate(barRef.current!, { y: 10 }, { duration: 1, ease: EASE_IO }).finished,
    ]);
  };
  const resultCorrect = async () => {
    await Promise.all([
      animate(barRef.current!, { y: -20, stroke: "hsl(120,50%,60%)" }, { duration: 0.3, ease: "backOut" }).finished,
      animate(bodyRef.current!, { scale: 1.2 }, { duration: 0.3, ease: "backOut" }).finished,
      animate(boxRef.current!, { fill: "hsl(120,50%,60%)" }, { duration: 0.3 }).finished,
    ]);
  };
  const resultIncorrect = async () => {
    await Promise.all([
      animate(barRef.current!, { y: 0, stroke: "hsl(0,50%,60%)" }, { duration: 0.1, ease: "linear" }).finished,
      animate(bodyRef.current!, { scale: 1 }, { duration: 0.1, ease: "linear" }).finished,
      animate(boxRef.current!, { fill: "hsl(0,50%,60%)" }, { duration: 0.1 }).finished,
    ]);
    await animate(bodyRef.current!, { x: [0, 10, -10, 10, 0] }, { duration: 0.4, ease: "linear" }).finished; // shake
  };
  const showResponse = async (msg: string) => {
    if (killed.current) return;
    setResponse(msg);
    await animate(responseRef.current!, { y: 30, opacity: 1 }, { duration: 0.5 }).finished;
    await wait(2000);
    await animate(responseRef.current!, { y: 0, opacity: 0 }, { duration: 0.5 }).finished;
  };
  const restore = async () => {
    await Promise.all([
      animate(boxRef.current!, { fill: RESTING }, { duration: 0.25, ease: EASE_IO }).finished,
      animate(barRef.current!, { stroke: RESTING, y: 0 }, { duration: 0.25, ease: EASE_IO }).finished,
      animate(bodyRef.current!, { scale: 1, y: 0 }, { duration: 0.25, ease: EASE_IO }).finished,
    ]);
    await Promise.all([
      animate(actionsRef.current!, { y: 0, opacity: 1 }, { duration: 0.5, ease: EASE_IO }).finished,
      animate(dials(), { y: 0, opacity: 1 }, { duration: 0.5, delay: stagger(0.1), ease: EASE_IO }).finished,
    ]);
  };

  const onUnlock = async () => {
    if (busy) return;
    setBusy(true);
    const correct = isCorrect();
    await intro();
    if (killed.current) return;
    if (correct) {
      await resultCorrect();
      await showResponse("CORRECTO");
      if (killed.current) return;
      onSolved(); // abre el candado → resolver el puzzle y cerrar el overlay (Computer desmonta esto)
    } else {
      await resultIncorrect();
      await showResponse("INCORRECTO");
      await restore();
      if (killed.current) return;
      setBusy(false);
    }
  };

  return (
    <>
      {/* cuerpo del candado (SVG): wrapper con la posición base + inner que anima Motion desde 0 */}
      <svg className="padlock-svg" viewBox="160 120 180 190" width="100%" height="100%">
        <g transform="translate(250,250)">
          <g ref={bodyRef} className="padlock-body">
            <rect ref={boxRef} x={-60} y={-45} width={120} height={90} rx={5} fill={RESTING} />
            <path ref={barRef} d="M-35 -45 v-40 c 0 -40, 70 -40, 70,0 v80" strokeWidth={15} strokeLinecap="round" fill="none" stroke={RESTING} />
          </g>
        </g>
      </svg>

      {/* ruedas de la combinación (carrusel) + el mensaje de respuesta superpuesto en su banda */}
      <div className="padlock-dials-wrap">
        <div className="padlock-dials">
          {digits.map((d, i) => (
            <div key={i} ref={(el) => { dialRefs.current[i] = el; }} className="dial-slot">
              <Dial value={d} disabled={busy} onChange={(v) => setDigit(i, v)} />
            </div>
          ))}
        </div>
        <div className="padlock-response-wrap">
          <span className="padlock-response" ref={responseRef}>{response}</span>
        </div>
      </div>

      {/* botones Win98 (98.css): bisel real, transparentes, sin icono. Bajan + fade en el intento. */}
      <div className="padlock-actions win98" ref={actionsRef}>
        <button type="button" onClick={onUnlock}>Resolver</button>
        <button type="button" onClick={() => { if (!busy) onClose(); }}>Cancelar</button>
      </div>
    </>
  );
}
