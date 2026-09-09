// CANDADO PRINCIPAL (combo-lock). Port del SVG que pasó Alberto, con las animaciones rehechas en Motion
// (motion@13, ya en el proyecto) en vez de GSAP: intro (esconde botón + dígitos, baja y encoge el candado),
// resultado (correcto = se abre en verde; incorrecto = rojo + shake), respuesta ("correct"/"incorrect") y,
// solo si falla, restaurar para reintentar. Al acertar llama a onSolved (resolver puzzle + cerrar overlay).
// Estética 1:1 del original de momento (blanco sobre oscuro); ya lo pasaremos a nuestro retro.
import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "motion";

const INPUT_WIDTH = 60; // separación entre dígitos (unidades del viewBox 0..500)
const RESTING = "hsl(120,50%,100%)"; // color en reposo del candado (verde muy claro, casi blanco)
const EASE_IO = "easeInOut"; // ≈ Power2.easeInOut del original

const rollOver = (val: number) => (val > 9 ? val % 10 : val < 0 ? val + 10 : val); // 0..9 cíclico

export type PadlockProps = {
  combo: number[]; // combinación correcta (un dígito 0..9 por rueda)
  onSolved: () => void; // combo correcto: el candado se abre → resolver el puzzle + cerrar el overlay
  onClose: () => void; // cancelar (lo dispara el backdrop desde Computer; aquí no se usa directamente)
};

export default function Padlock({ combo, onSolved, onClose }: PadlockProps) {
  const [digits, setDigits] = useState<number[]>(() => combo.map(() => 0)); // ruedas (empiezan a 0)
  const [busy, setBusy] = useState(false); // hay animación en curso: bloquea ruedas y "unlock"
  const [response, setResponse] = useState(""); // texto "correct"/"incorrect"

  const bodyRef = useRef<SVGGElement>(null); // cuerpo del candado (escala + baja + shake)
  const boxRef = useRef<SVGRectElement>(null); // caja (color de relleno)
  const barRef = useRef<SVGPathElement>(null); // arco (color de trazo + sube/baja)
  const unlockRef = useRef<SVGGElement>(null); // botón unlock (baja + opacity)
  const responseRef = useRef<SVGTextElement>(null); // texto de respuesta (sube + opacity)
  const inputRefs = useRef<(SVGGElement | null)[]>([]); // cada rueda (baja + opacity, en stagger)
  const killed = useRef(false); // el componente se desmontó: cortar los awaits pendientes

  useEffect(() => () => { killed.current = true; }, []);

  const bump = (i: number, delta: number) => {
    if (busy) return;
    setDigits((d) => d.map((v, j) => (j === i ? rollOver(v + delta) : v)));
  };
  const isCorrect = () => digits.every((v, i) => v === combo[i]);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const inputs = () => inputRefs.current.filter(Boolean) as SVGGElement[];

  // ---- fases de la animación (equivalentes a las timelines de GSAP del original) ----
  const intro = async () => {
    animate(unlockRef.current!, { y: 100, opacity: 0 }, { duration: 0.5, ease: EASE_IO });
    await animate(inputs(), { y: 200, opacity: 0 }, { duration: 0.5, delay: stagger(0.1), ease: EASE_IO }).finished;
    await animate(bodyRef.current!, { y: 30 }, { duration: 0.5, ease: EASE_IO }).finished;
    await Promise.all([
      animate(bodyRef.current!, { scale: 0.9 }, { duration: 1, ease: EASE_IO }).finished,
      animate(barRef.current!, { y: 10 }, { duration: 1, ease: EASE_IO }).finished,
    ]);
  };
  const resultCorrect = async () => {
    await Promise.all([
      animate(barRef.current!, { y: -20, stroke: "hsl(120,50%,60%)" }, { duration: 0.3, ease: "backOut" }).finished, // arco (color + sube) en UNA llamada
      animate(bodyRef.current!, { scale: 1.2 }, { duration: 0.3, ease: "backOut" }).finished,
      animate(boxRef.current!, { fill: "hsl(120,50%,60%)" }, { duration: 0.3 }).finished,
    ]);
  };
  const resultIncorrect = async () => {
    await Promise.all([
      animate(barRef.current!, { y: 0, stroke: "hsl(0,50%,60%)" }, { duration: 0.1, ease: "linear" }).finished, // arco (color + baja) en UNA llamada
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
      animate(unlockRef.current!, { y: 0, opacity: 1 }, { duration: 0.5, ease: EASE_IO }).finished,
      animate(inputs(), { y: 0, opacity: 1 }, { duration: 0.5, delay: stagger(0.1), ease: EASE_IO }).finished,
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
      await showResponse("correct");
      if (killed.current) return;
      onSolved(); // abre el candado → resolver el puzzle y cerrar el overlay (Computer desmonta esto)
    } else {
      await resultIncorrect();
      await showResponse("incorrect");
      await restore();
      if (killed.current) return;
      setBusy(false);
    }
  };

  return (
    <svg className="padlock-svg" viewBox="0 0 500 500" width="100%" height="100%">
      {/* candado: wrapper con la posición base (atributo, lo maneja React) + inner que anima Motion desde 0 */}
      <g transform="translate(250,220)">
        <g ref={bodyRef} className="padlock-body">
          <rect ref={boxRef} x={-60} y={-45} width={120} height={90} rx={5} fill={RESTING} />
          <path ref={barRef} d="M-35 -45 v-40 c 0 -40, 70 -40, 70,0 v80" strokeWidth={15} strokeLinecap="round" fill="none" stroke={RESTING} />
        </g>
      </g>

      {/* ruedas de la combinación */}
      <g transform="translate(250,365)">
        {digits.map((d, i) => {
          const x = i * INPUT_WIDTH - (digits.length - 1) * INPUT_WIDTH / 2;
          return (
            <g key={i} transform={`translate(${x},0)`}>
              <g ref={(el) => { inputRefs.current[i] = el; }} className="combination-input">
                <rect x={-25} y={-40} width={50} height={80} fill="none" stroke="white" strokeWidth={2} rx={3} />
                <text className="padlock-digit" x={0} y={13} fontSize={36} fill="white" textAnchor="middle">{d}</text>
                <path d="M0 -32 l5 10 l-10 0 z" fill="white" />
                <path d="M0 32 l5 -10 l-10 0 z" fill="white" />
                <rect className="up-button" x={-25} y={-40} width={50} height={40} fill="transparent" pointerEvents="all" style={{ cursor: "pointer" }} onPointerUp={() => bump(i, 1)} />
                <rect className="down-button" x={-25} y={0} width={50} height={40} fill="transparent" pointerEvents="all" style={{ cursor: "pointer" }} onPointerUp={() => bump(i, -1)} />
              </g>
            </g>
          );
        })}
      </g>

      {/* botones: "Resolver" (comprueba la combinación) y "Cancelar" (cierra el candado). Ambos se ocultan
          juntos durante el intento (mismo grupo que anima Motion). */}
      <g transform="translate(250,435)">
        <g ref={unlockRef}>
          <text x={0} y={6} fontSize={16} fill="white" textAnchor="middle" pointerEvents="none">Resolver</text>
          <rect x={-55} y={-18} width={110} height={36} fill="transparent" stroke="white" strokeWidth={2} rx={3} pointerEvents="all" style={{ cursor: "pointer" }} onPointerUp={onUnlock} />
          <text x={0} y={54} fontSize={16} fill="white" textAnchor="middle" pointerEvents="none">Cancelar</text>
          <rect x={-55} y={30} width={110} height={36} fill="transparent" stroke="white" strokeWidth={2} rx={3} pointerEvents="all" style={{ cursor: "pointer" }} onPointerUp={() => { if (!busy) onClose(); }} />
        </g>
      </g>

      {/* texto de respuesta */}
      <text ref={responseRef} x={250} y={360} fontSize={50} fill="white" textAnchor="middle" opacity={0} pointerEvents="none">{response}</text>
    </svg>
  );
}
