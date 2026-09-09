// CANDADO PRINCIPAL. Cuerpo del candado en SVG (animado con Motion: intro, resultado correcto/incorrecto con
// shake, respuesta). Las RUEDAS de la combinación son dials cilindro 3D PROPIOS: se arrastran en vertical y los
// números RUEDAN (cada número es un elemento estable keyeado por índice absoluto, entra/sale por los bordes; no
// "muta" en el sitio). Botones Resolver/Cancelar Win98 (98.css). Al acertar: onSolved (resolver + cerrar overlay).
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { animate } from "motion";

const RESTING = "hsl(120,50%,100%)"; // color en reposo del candado (verde muy claro, casi blanco)
// Eases CLAVADOS del original (GSAP): Power2.easeInOut = cúbica in-out; Power1.easeOut (default de GSAP) = quad out;
// Power0 = linear; Back.easeOut.config(4) = polinomio con overshoot 4 (no es bezier: va como función de progreso).
const E_INOUT: [number, number, number, number] = [0.645, 0.045, 0.355, 1]; // Power2.easeInOut
const E_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]; // Power1.easeOut (default de GSAP)
const BACK_OUT_4 = (p: number) => { const t = p - 1; return t * t * (5 * t + 4) + 1; }; // Back.easeOut.config(4)
const OK_GREEN = "hsl(120,50%,60%)"; // color del texto "CORRECTO" (mismo verde que el cuerpo del candado)
const BAD_RED = "hsl(0,50%,60%)"; // color del texto "INCORRECTO" (mismo rojo que el cuerpo del candado)
const BTN_OUT = 100; // px que cae el botón al salir (proporción del original: botón +100)
const DIAL_OUT = 200; // px que caen las ruedas al salir (original: inputs +200, el doble que el botón)
const ROW = 28; // alto/separación de cada número de la rueda (px); DEBE coincidir con .dial-num en padlock.css
const ITEM_ANGLE = 40; // grados que gira el cilindro por número (a más grados, más curvado)
const RADIUS = Math.round((ROW / 2) / Math.tan((ITEM_ANGLE / 2) * Math.PI / 180)); // radio del cilindro (px)
const RENDER = 4; // slots renderizados a cada lado del centro (< 9: el cilindro no da la vuelta ni se solapa)

// Una RUEDA (dial) cilindro 3D. Se arrastra en vertical: los números ruedan (keyeados por índice absoluto j, así
// entran/salen por los bordes en vez de mutar). Snap al soltar, con wrap 0..9. Arrastrar hacia abajo = anterior.
function Dial({ value, disabled, onChange, tick }: { value: number; disabled: boolean; onChange: (v: number) => void; tick: () => void }) {
  const [drag, setDrag] = useState(0); // desplazamiento en vivo del arrastre (px)
  const [anim, setAnim] = useState(false); // transición al soltar (snap)
  const startY = useRef(0);
  const active = useRef(false);
  const settling = useRef(false); // en el snap post-soltar: ignora nuevos arrastres
  const lastC = useRef(value); // último número en el centro (para el "tick" al cruzar cada número)

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || settling.current) return;
    active.current = true;
    startY.current = e.clientY;
    lastC.current = value;
    setAnim(false);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!active.current) return;
    const nd = e.clientY - startY.current;
    const nc = Math.round(value - nd / ROW); // número que pasa por el centro ahora
    if (nc !== lastC.current) { lastC.current = nc; tick(); } // "tick" en cada paso (cruce de número)
    setDrag(nd);
  };
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    const steps = Math.round(drag / ROW); // nº de números movidos (sin límite: scroll largo válido)
    if (steps === 0) { setAnim(true); setDrag(0); return; } // no llega: vuelve al centro
    settling.current = true;
    setAnim(true);
    setDrag(steps * ROW); // rueda hasta encajar en el número destino (solo anima la fracción)
    window.setTimeout(() => {
      onChange(((value - steps) % 10 + 10) % 10); // arrastrar hacia abajo (steps>0) = número anterior
      setAnim(false);
      setDrag(0); // el re-render ya centra el nuevo valor: sin salto visual
      settling.current = false;
    }, 190);
  };

  const posJ = value - drag / ROW;   // posición continua del centro, en índice (drag abajo = índice menor = anterior)
  const c = Math.round(posJ);        // índice central actual
  return (
    <div className="lock-dial" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
      <div className="dial-cylinder">
        {Array.from({ length: RENDER * 2 + 1 }, (_, i) => c - RENDER + i).map((j) => {
          const angle = -(j - posJ) * ITEM_ANGLE; // ángulo del número j en el cilindro (fracción incluida)
          const opacity = Math.max(0, Math.cos((angle * Math.PI) / 180)); // los que giran hacia atrás se desvanecen
          return (
            <div className="dial-num" key={j}
              style={{ transform: `rotateX(${angle}deg) translateZ(${RADIUS}px)`, opacity, transition: anim ? "transform .19s ease-out, opacity .19s ease-out" : "none" }}>
              {((j % 10) + 10) % 10}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type PadlockProps = {
  combo: number[]; // combinación correcta (un dígito 0..9 por rueda)
  playSfx: (src: string, vol?: number) => void; // SFX del armazón (para el "tick" de cada paso del dial)
  onSolved: () => void; // combo correcto: el candado se abre → resolver el puzzle + cerrar el overlay
  onClose: () => void; // cancelar (backdrop / botón Cancelar): cerrar sin resolver
};

export default function Padlock({ combo, playSfx, onSolved, onClose }: PadlockProps) {
  const tick = () => playSfx("/audio/tick.mp3", 1); // clic mecánico en cada paso del dial (volumen 100%)
  const [digits, setDigits] = useState<number[]>(() => combo.map(() => 0)); // ruedas (empiezan a 0)
  const [busy, setBusy] = useState(false); // hay animación en curso: bloquea ruedas y "Resolver"
  const [response, setResponse] = useState(""); // texto "CORRECTO"/"INCORRECTO"

  const bodyRef = useRef<SVGGElement>(null); // cuerpo del candado (escala + baja + shake)
  const boxRef = useRef<SVGRectElement>(null); // caja (color de relleno)
  const barRef = useRef<SVGPathElement>(null); // arco (color de trazo + sube/baja)
  const actionsRef = useRef<HTMLDivElement>(null); // botones Resolver/Cancelar (bajan + opacity)
  const responseRef = useRef<HTMLSpanElement>(null); // texto de respuesta (sube + opacity)
  const triedRef = useRef<HTMLDivElement>(null); // combinación probada (persiste y desaparece IGUAL que el mensaje)
  const dialRefs = useRef<(HTMLDivElement | null)[]>([]); // cada rueda (baja + opacity, en stagger)
  const slideRef = useRef<HTMLDivElement>(null); // wrapper que sube deslizándose al aparecer
  const killed = useRef(false); // el componente se desmontó: cortar los awaits pendientes

  useEffect(() => () => { killed.current = true; }, []);

  // al APARECER (pulsar Resolver): la placa entra deslizándose desde abajo (de fuera del viewport hasta su sitio),
  // sin opacidad, con spring bounce 0. Empieza en translateY(100vh) (inline) para no parpadear el primer frame.
  useEffect(() => {
    if (slideRef.current) animate(slideRef.current, { y: [window.innerHeight, 0] }, { type: "spring", bounce: 0, visualDuration: 0.55 });
  }, []);

  const setDigit = (i: number, v: number) => setDigits((d) => d.map((x, j) => (j === i ? v : x)));
  const isCorrect = () => digits.every((v, i) => v === combo[i]);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dials = () => dialRefs.current.filter(Boolean) as HTMLDivElement[];
  // pinta caja y arco con EL MISMO color (una sola fuente → nunca se ve la costura de las dos piezas del SVG)
  const paint = (hue: number, L: number) => {
    const c = `hsl(${hue},50%,${L}%)`;
    if (boxRef.current) boxRef.current.style.fill = c;
    if (barRef.current) barRef.current.style.stroke = c;
  };

  // ---- fases de la animación (timeline CLAVADA del original GSAP) ----
  // startUnlockAttempt: el BOTÓN cae en t0 (0.5s); las RUEDAS caen UNA A UNA desde t0.25 (stagger 0.1s); el
  // candado SOLO baja en t1.05 (cuando botón+ruedas ya se fueron → nunca chocan); en t1.55 encoge (1s) y la
  // barra baja (1s). Fin t2.55. (label 'a'=0, stagger 'a+=0.25', 'build'=1.55)
  const intro = () => {
    animate(actionsRef.current!, { y: BTN_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT });
    dials().forEach((el, i) => animate(el, { y: DIAL_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT, delay: 0.25 + i * 0.1 })); // cada rueda por separado
    animate(bodyRef.current!, { y: 30 }, { duration: 0.5, ease: E_INOUT, delay: 1.05 });
    animate(barRef.current!, { y: 10 }, { duration: 1, ease: E_OUT, delay: 1.55 });
    return animate(bodyRef.current!, { scale: 0.9 }, { duration: 1, ease: E_OUT, delay: 1.55 }).finished; // fin t2.55
  };
  // correcto (0.3s): barra sube (-20) y candado escala 1.2 con Back.easeOut(4); color de AMBAS piezas verde
  // (luminosidad 100→60, hue 120) desde UNA sola animación (power1.out) → sin costura entre caja y arco
  const resultCorrect = () => Promise.all([
    animate(barRef.current!, { y: -20 }, { duration: 0.3, ease: BACK_OUT_4 }).finished,
    animate(bodyRef.current!, { scale: 1.2 }, { duration: 0.3, ease: BACK_OUT_4 }).finished,
    animate(100, 60, { duration: 0.3, ease: E_OUT, onUpdate: (L) => paint(120, L) }).finished,
  ]);
  // incorrecto: barra baja + candado escala 1 (0.1s lineal) + rojo (hue 0, luminosidad 100→60); luego SHAKE
  const resultIncorrect = () => {
    animate(barRef.current!, { y: 0 }, { duration: 0.1, ease: "linear" });
    animate(bodyRef.current!, { scale: 1 }, { duration: 0.1, ease: "linear" });
    animate(100, 60, { duration: 0.1, ease: E_OUT, onUpdate: (L) => paint(0, L) });
    return animate(bodyRef.current!, { x: [0, 10, -10, 10, 0] }, { duration: 0.4, delay: 0.1, ease: [E_OUT, E_OUT, E_OUT, E_OUT] }).finished;
  };
  // respuesta: entra (0.5s, +30 + opacity) → aguanta 2s → sale (0.5s)
  const showResponse = async (msg: string, color: string) => {
    if (killed.current) return;
    setResponse(msg);
    if (responseRef.current) responseRef.current.style.color = color;
    await animate(responseRef.current!, { y: 30, opacity: 1 }, { duration: 0.5, ease: E_OUT }).finished; // entra solo el mensaje (los dígitos ya están y persisten)
    await wait(2000);
    // SALEN a la vez y con la MISMA animación (suben 30 + fade): mensaje (30→0) y combinación (0→-30)
    await Promise.all([
      animate(responseRef.current!, { y: 0, opacity: 0 }, { duration: 0.5, ease: E_OUT }).finished,
      triedRef.current ? animate(triedRef.current, { y: -30, opacity: 0 }, { duration: 0.5, ease: E_OUT }).finished : Promise.resolve(),
    ]);
  };
  // restaurar (solo si falla): caja/barra/candado vuelven (0.25s), luego botón (0.5s) y ruedas en stagger (+0.25)
  const restore = async () => {
    await Promise.all([
      animate(60, 100, { duration: 0.25, ease: E_INOUT, onUpdate: (L) => paint(0, L) }).finished, // color de ambas piezas de rojo (L60) a blanco (L100), hue 0
      animate(barRef.current!, { y: 0 }, { duration: 0.25, ease: E_INOUT }).finished,
      animate(bodyRef.current!, { scale: 1, y: 0 }, { duration: 0.25, ease: E_OUT }).finished,
    ]);
    animate(actionsRef.current!, { y: 0, opacity: 1 }, { duration: 0.5, ease: E_OUT });
    await Promise.all(dials().map((el, i) => animate(el, { y: 0, opacity: 1 }, { duration: 0.5, ease: E_OUT, delay: 0.25 + i * 0.1 }).finished));
  };

  const onUnlock = async () => {
    if (busy) return;
    setBusy(true);
    setResponse(""); // limpia el mensaje anterior (así se ve la combinación probada hasta que llega el resultado)
    const correct = isCorrect();
    await intro();
    if (killed.current) return;
    if (correct) {
      await resultCorrect();
      await showResponse("CORRECTO", OK_GREEN);
      if (killed.current) return;
      onSolved(); // abre el candado → resolver el puzzle y cerrar el overlay (Computer desmonta esto)
    } else {
      await resultIncorrect();
      await showResponse("INCORRECTO", BAD_RED);
      await restore();
      if (killed.current) return;
      setBusy(false);
    }
  };

  return (
    <div className="padlock-slide" ref={slideRef} style={{ transform: "translateY(100vh)" }}>
      {/* cuerpo del candado (SVG): wrapper con la posición base + inner que anima Motion desde 0 */}
      <svg className="padlock-svg" viewBox="160 120 180 190" width="100%" height="100%">
        <g transform="translate(250,250)">
          <g ref={bodyRef} className="padlock-body">
            <rect ref={boxRef} x={-60} y={-45} width={120} height={90} rx={5} fill={RESTING} />
            <path ref={barRef} d="M-35 -45 v-40 c 0 -40, 70 -40, 70,0 v80" strokeWidth={15} strokeLinecap="round" fill="none" stroke={RESTING} />
          </g>
        </g>
      </svg>

      {/* ruedas de la combinación (dials 3D propios) + el mensaje de respuesta superpuesto en su banda */}
      <div className="padlock-dials-wrap">
        <div className="padlock-dials">
          {digits.map((d, i) => (
            <div key={i} ref={(el) => { dialRefs.current[i] = el; }} className="dial-slot">
              <Dial value={d} disabled={busy} onChange={(v) => setDigit(i, v)} tick={tick} />
            </div>
          ))}
        </div>
        <div className="padlock-response-wrap">
          <span className="padlock-response" ref={responseRef}>{response}</span>
        </div>
        {/* combinación probada: cada dígito en el pixel EXACTO donde su dial lo mostraba (misma fila/celda/gap).
            Se ve mientras se resuelve (aunque las ruedas caigan) y se oculta al aparecer el mensaje. */}
        {busy && (
          <div className="padlock-tried" ref={triedRef}>
            {digits.map((d, i) => <span key={i} className="padlock-tried-cell">{d}</span>)}
          </div>
        )}
      </div>

      {/* botones Win98 (98.css): bisel real, transparentes, sin icono. Bajan + fade en el intento. */}
      <div className="padlock-actions win98" ref={actionsRef}>
        <button type="button" onClick={onUnlock}>Resolver</button>
        <button type="button" onClick={() => { if (!busy) onClose(); }}>Cancelar</button>
      </div>
    </div>
  );
}
