// CANDADO de RUEDAS (números o letras): UN solo componente para ambos. `kind` elige el juego de símbolos, la
// curvatura del cilindro (ITEM_ANGLE) y el prefijo de clases CSS (padlock-* para números, letterlock-* para letras).
// El cuerpo del candado (SVG) se anima con Motion (intro, resultado correcto/incorrecto con shake, respuesta). Las
// RUEDAS son dials cilindro 3D PROPIOS: se arrastran en vertical y los símbolos RUEDAN (cada uno es un elemento
// estable keyeado por índice absoluto, entra/sale por los bordes; no "muta" en el sitio). Al acertar: onSolved.
import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import LockPanel, { type LockPanelHandle } from "./LockPanel";
import { E_OUT, E_INOUT, BTN_OUT, SHAKE } from "./lockAnim";
import { useCarousel } from "./useCarousel";

export type LockKind = "number" | "letters";

// Alfabeto español en MAYÚSCULAS (27 letras, Ñ tras la N). El candado de letras usa índices 0..26 sobre esto.
export const ALPHABET = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
// Convierte una palabra ("HELLO") en la combinación de índices para el candado de letras.
export const wordToCombo = (w: string): number[] =>
  w.toUpperCase().split("").map((c) => { const i = ALPHABET.indexOf(c); return i < 0 ? 0 : i; });

const RESTING = "hsl(120,50%,100%)"; // color en reposo del candado (verde muy claro, casi blanco)
// Eases CLAVADOS del original (GSAP): Power2.easeInOut = cúbica in-out; Power1.easeOut (default de GSAP) = quad out;
// Power0 = linear; Back.easeOut.config(4) = polinomio con overshoot 4 (no es bezier: va como función de progreso).
const BACK_OUT_4 = (p: number) => { const t = p - 1; return t * t * (5 * t + 4) + 1; }; // Back.easeOut.config(4)
// E_OUT, E_INOUT, SHAKE y BTN_OUT (compartidos con GeometryLock) viven en lockAnim.ts
const OK_GREEN = "hsl(120,50%,60%)"; // color del texto "CORRECTO" (mismo verde que el cuerpo del candado)
const BAD_RED = "hsl(0,50%,60%)"; // color del texto "INCORRECTO" (mismo rojo que el cuerpo del candado)
const HOLD_MS = 1500; // lo que el MENSAJE (CORRECTO/INCORRECTO) aguanta antes del fade-out
const TRIED_HOLD_MS = 1500; // lo que la COMBINACIÓN aguanta antes del fade-out
const EXIT_DELAY_MS = 1000; // tras CORRECTO, cuánto tarda en aparecer "Salir" (antes que el aguante del mensaje)
const DIAL_OUT = 200; // px que caen las ruedas al salir (original: inputs +200, el doble que el botón). BTN_OUT (100) en lockAnim
const ROW = 28; // alto/separación de cada símbolo de la rueda (px); DEBE coincidir con .{prefix}-num en su CSS
const RENDER = 4; // slots renderizados a cada lado del centro (< 9: el cilindro no da la vuelta ni se solapa)

// Config por TIPO de candado: qué símbolos ruedan, cuánto se curva el cilindro (a más ángulo, más cerrado) y qué
// prefijo de clases usa (padlock-*/letterlock-*, cada uno con su hoja CSS). radius sale de ITEM_ANGLE + ROW.
type DialCfg = { symbols: string[]; itemAngle: number; radius: number; prefix: string };
const radiusFor = (angle: number) => Math.round((ROW / 2) / Math.tan((angle / 2) * Math.PI / 180)); // radio del cilindro (px)
const CFG: Record<LockKind, DialCfg> = {
  number: { symbols: "0123456789".split(""), itemAngle: 40, radius: radiusFor(40), prefix: "padlock" },   // 40°: cilindro más cerrado
  letters: { symbols: ALPHABET, itemAngle: 32, radius: radiusFor(32), prefix: "letterlock" },             // 32°: más abierto → se ven más letras
};
// valor inicial de cada rueda: números arrancan a 0 (p.ej. 0000); letras a A, B, C, D... (índices crecientes, no "AAAAA")
const initialDigits = (kind: LockKind, combo: number[]) =>
  kind === "letters" ? combo.map((_, i) => i % ALPHABET.length) : combo.map(() => 0);

// Una RUEDA (dial) cilindro 3D. Se arrastra en vertical: los símbolos ruedan (keyeados por índice absoluto j, así
// entran/salen por los bordes en vez de mutar). La mecánica de arrastre/snap/wrap vive en useCarousel (compartida
// con la fila del GeometryLock); aquí solo el render 3D del cilindro.
function Dial({ value, disabled, onChange, tick, cfg }: { value: number; disabled: boolean; onChange: (v: number) => void; tick: () => void; cfg: DialCfg }) {
  const N = cfg.symbols.length;
  const { anim, pos, onDown, onMove, finish } = useCarousel({ axis: "y", size: ROW, count: N, value, onCommit: onChange, onTick: tick, disabled });
  const c = Math.round(pos); // índice central actual
  return (
    <div className={cfg.prefix + "-dial"} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
      <div className={cfg.prefix + "-cylinder"}>
        {Array.from({ length: RENDER * 2 + 1 }, (_, i) => c - RENDER + i).map((j) => {
          const angle = -(j - pos) * cfg.itemAngle; // ángulo del símbolo j en el cilindro (fracción incluida)
          const opacity = Math.max(0, Math.cos((angle * Math.PI) / 180)); // los que giran hacia atrás se desvanecen
          return (
            <div className={cfg.prefix + "-num"} key={j}
              style={{ transform: `rotateX(${angle}deg) translateZ(${cfg.radius}px)`, opacity, transition: anim ? "transform .19s ease-out, opacity .19s ease-out" : "none" }}>
              {cfg.symbols[((j % N) + N) % N]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type PadlockProps = {
  combo: number[]; // combinación correcta (un índice por rueda: número 0..9 o letra 0..26)
  kind?: LockKind; // tipo de candado: "number" (default) o "letters"
  playSfx: (src: string, vol?: number) => void; // SFX del armazón (para el "tick" de cada paso del dial)
  onSolved: () => void; // combo correcto: el candado se abre → resolver el puzzle + cerrar el overlay
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function Padlock({ combo, kind = "number", playSfx, onSolved, onClose }: PadlockProps) {
  const cfg = CFG[kind];
  const p = cfg.prefix; // prefijo de clases CSS del tipo activo (padlock-* / letterlock-*)
  const tick = () => playSfx("/audio/tick.mp3", 1); // clic mecánico en cada paso del dial (volumen 100%)
  const [digits, setDigits] = useState<number[]>(() => initialDigits(kind, combo)); // ruedas (0000 / ABCDE...)
  const [busy, setBusy] = useState(false); // hay animación en curso: bloquea ruedas y "Resolver"
  const [response, setResponse] = useState(""); // texto "CORRECTO"/"INCORRECTO"
  const [exit, setExit] = useState(false); // tras CORRECTO: aparece el botón "Salir"

  const bodyRef = useRef<SVGGElement>(null); // cuerpo del candado (escala + baja + shake)
  const boxRef = useRef<SVGRectElement>(null); // caja (color de relleno)
  const barRef = useRef<SVGPathElement>(null); // arco (color de trazo + sube/baja)
  const actionsRef = useRef<HTMLDivElement>(null); // botones Resolver/Cancelar (bajan + opacity)
  const responseRef = useRef<HTMLSpanElement>(null); // texto de respuesta (sube + opacity)
  const triedRef = useRef<HTMLDivElement>(null); // combinación probada (persiste y desaparece IGUAL que el mensaje)
  const exitRef = useRef<HTMLDivElement>(null); // botón "Salir" (aparece tras CORRECTO)
  const dialRefs = useRef<(HTMLDivElement | null)[]>([]); // cada rueda (baja + opacity, en stagger)
  const dialsBoxRef = useRef<HTMLDivElement>(null); // caja de TODAS las ruedas: en letras lleva el borde + líneas → cae/vuelve como UNA sola pieza
  const panelRef = useRef<LockPanelHandle>(null); // marco compartido (LockPanel): entra/sale deslizando; expone close(cb)
  const killed = useRef(false); // el componente se desmontó: cortar los awaits pendientes

  useEffect(() => () => { killed.current = true; }, []);

  // la combinación probada aparece con FADE-IN (0→1) al empezar el intento (no de golpe)
  useEffect(() => {
    if (busy && triedRef.current) animate(triedRef.current, { opacity: [0, 1] }, { duration: 0.5, ease: E_OUT });
  }, [busy]);
  // el botón "Salir" (tras CORRECTO) aparece con FADE-IN
  useEffect(() => {
    if (exit && exitRef.current) animate(exitRef.current, { opacity: [0, 1] }, { duration: 0.5, ease: E_OUT });
  }, [exit]);

  const setDigit = (i: number, v: number) => setDigits((d) => d.map((x, j) => (j === i ? v : x)));
  const isCorrect = () => digits.every((v, i) => v === combo[i]);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dials = () => dialRefs.current.filter(Boolean) as HTMLDivElement[];
  // pinta caja y arco con EL MISMO color (una sola fuente → nunca se ve la costura de las dos piezas del SVG)
  const paint = (hue: number, L: number) => {
    const c = `hsl(${hue},50%,${L}%)`;
    if (boxRef.current) boxRef.current.style.fill = c;
    if (barRef.current) barRef.current.style.stroke = c;
    if (triedRef.current) triedRef.current.style.color = c; // los símbolos de la combinación se colorean con el candado
  };

  // ---- fases de la animación (timeline CLAVADA del original GSAP) ----
  // startUnlockAttempt: el BOTÓN cae en t0 (0.5s); las RUEDAS caen UNA A UNA desde t0.25 (stagger 0.1s); el
  // candado SOLO baja en t1.05 (cuando botón+ruedas ya se fueron → nunca chocan); en t1.55 encoge (1s) y la
  // barra baja (1s). Fin t2.55. (label 'a'=0, stagger 'a+=0.25', 'build'=1.55)
  const intro = () => {
    animate(actionsRef.current!, { y: BTN_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT });
    if (kind === "letters") {
      // letras: UNA sola caja (borde + líneas + ruedas) → cae ENTERA y junta; en pantalla solo persiste la respuesta/combinación
      animate(dialsBoxRef.current!, { y: DIAL_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT, delay: 0.25 });
    } else {
      // números: cada rueda tiene su propia caja/borde → caen UNA A UNA (stagger 0.1s), como el original
      dials().forEach((el, i) => animate(el, { y: DIAL_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT, delay: 0.25 + i * 0.1 }));
    }
    animate(bodyRef.current!, { y: 30 }, { duration: 0.5, ease: E_INOUT, delay: 1.05 });
    animate(barRef.current!, { y: 10 }, { duration: 1, ease: E_OUT, delay: 1.55 });
    return animate(bodyRef.current!, { scale: 0.9 }, { duration: 1, ease: E_OUT, delay: 1.55 }).finished; // fin t2.55
  };
  // correcto (0.3s): barra sube (-20) y candado escala 1 (igual que incorrecto) con Back.easeOut(4); color de
  // AMBAS piezas verde (luminosidad 100→60, hue 120) desde UNA sola animación (power1.out) → sin costura
  const resultCorrect = () => Promise.all([
    animate(barRef.current!, { y: -20 }, { duration: 0.3, ease: BACK_OUT_4 }).finished,
    animate(bodyRef.current!, { scale: 1 }, { duration: 0.3, ease: BACK_OUT_4 }).finished, // mismo zoom que INCORRECTO (referencia)
    animate(100, 60, { duration: 0.3, ease: E_OUT, onUpdate: (L) => paint(120, L) }).finished,
  ]);
  // incorrecto: barra baja + candado escala 1 (0.1s lineal) + rojo (hue 0, luminosidad 100→60); luego SHAKE
  const resultIncorrect = () => {
    animate(barRef.current!, { y: 0 }, { duration: 0.1, ease: "linear" });
    animate(bodyRef.current!, { scale: 1 }, { duration: 0.1, ease: "linear" });
    animate(100, 60, { duration: 0.1, ease: E_OUT, onUpdate: (L) => paint(0, L) });
    return animate(bodyRef.current!, { x: SHAKE }, { duration: 0.4, delay: 0.1, ease: [E_OUT, E_OUT, E_OUT, E_OUT] }).finished;
  };
  // respuesta: entra (0.5s, +30 + opacity) → aguanta → sale (0.5s); la combinación sale un pelín aparte
  const showResponse = async (msg: string, color: string) => {
    if (killed.current) return;
    setResponse(msg);
    if (responseRef.current) responseRef.current.style.color = color;
    await animate(responseRef.current!, { y: 30, opacity: 1 }, { duration: 0.5, ease: E_OUT }).finished; // entra solo el mensaje (los símbolos ya están y persisten)
    // la COMBINACIÓN se va a los 1,5s (solo fade, sin subir); el MENSAJE también a 1,5s (sube 30 + fade)
    const triedExit = triedRef.current ? animate(triedRef.current, { opacity: [1, 0] }, { duration: 0.5, ease: E_OUT, delay: TRIED_HOLD_MS / 1000 }).finished : Promise.resolve();
    await wait(HOLD_MS);
    if (killed.current) return; // desmontado durante el aguante (p. ej. X → Sí): no animes refs ya nulos
    await Promise.all([
      animate(responseRef.current!, { y: 0, opacity: 0 }, { duration: 0.5, ease: E_OUT }).finished,
      triedExit, // esperamos también a la combinación (acaba un poco después) antes de restaurar
    ]);
  };
  // restaurar (solo si falla): caja/barra/candado vuelven (0.25s), luego botón (0.5s) y ruedas en stagger (+0.25)
  const restore = async () => {
    if (killed.current) return; // desmontado: no animes refs ya nulos
    await Promise.all([
      animate(60, 100, { duration: 0.25, ease: E_INOUT, onUpdate: (L) => paint(0, L) }).finished, // color de ambas piezas de rojo (L60) a blanco (L100), hue 0
      animate(barRef.current!, { y: 0 }, { duration: 0.25, ease: E_INOUT }).finished,
      animate(bodyRef.current!, { scale: 1, y: 0 }, { duration: 0.25, ease: E_OUT }).finished,
    ]);
    animate(actionsRef.current!, { y: 0, opacity: 1 }, { duration: 0.5, ease: E_OUT });
    if (kind === "letters") {
      await animate(dialsBoxRef.current!, { y: 0, opacity: 1 }, { duration: 0.5, ease: E_OUT, delay: 0.25 }).finished; // la caja entera (borde + líneas + ruedas) vuelve junta
    } else {
      await Promise.all(dials().map((el, i) => animate(el, { y: 0, opacity: 1 }, { duration: 0.5, ease: E_OUT, delay: 0.25 + i * 0.1 }).finished));
    }
  };

  const onUnlock = async () => {
    if (busy) return;
    setBusy(true);
    setResponse(""); // limpia el mensaje anterior (así se ve la combinación probada hasta que llega el resultado)
    setExit(false);
    const correct = isCorrect();
    await intro();
    if (killed.current) return;
    if (correct) {
      await resultCorrect();
      if (killed.current) return;
      playSfx("/audio/lock-online-1.mp3", 0.6); // ACIERTO: al TERMINAR la animación (candado abierto en verde), no al aparecer el texto
      // CORRECTO + combinación ENTRAN y PERSISTEN (sin fade-out); tras X seg aparece "Salir"
      setResponse("CORRECTO");
      onSolved(); // suma la llave + marca resuelto YA (en el CORRECTO), no al pulsar Salir
      if (responseRef.current) responseRef.current.style.color = OK_GREEN;
      await animate(responseRef.current!, { y: 30, opacity: 1 }, { duration: 0.5, ease: E_OUT }).finished;
      await wait(EXIT_DELAY_MS);
      if (killed.current) return;
      setExit(true); // aparece el botón "Salir" (al pulsarlo: onSolved → resolver + cerrar)
    } else {
      await resultIncorrect();
      playSfx("/audio/lock-fail-1.mp3", 0.6); // FALLO: al TERMINAR la animación (candado cerrado en rojo + shake), no al aparecer el texto
      await showResponse("INCORRECTO", BAD_RED);
      await restore();
      if (killed.current) return;
      setBusy(false);
    }
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      {/* cuerpo del candado (SVG): wrapper con la posición base + inner que anima Motion desde 0 */}
      <svg className={`${p}-svg`} viewBox="160 120 180 190" width="100%" height="100%">
        <g transform="translate(250,250)">
          <g ref={bodyRef} className={`${p}-body`}>
            <rect ref={boxRef} x={-60} y={-45} width={120} height={90} rx={5} fill={RESTING} />
            <path ref={barRef} d="M-35 -45 v-40 c 0 -40, 70 -40, 70,0 v80" strokeWidth={15} strokeLinecap="round" fill="none" stroke={RESTING} />
          </g>
        </g>
      </svg>

      {/* ruedas de la combinación (dials 3D propios) + el mensaje de respuesta superpuesto en su banda */}
      <div className={`${p}-dials-wrap`}>
        <div className={`${p}-dials`} ref={dialsBoxRef}>
          {digits.map((d, i) => (
            <div key={i} ref={(el) => { dialRefs.current[i] = el; }} className={`${p}-slot`}>
              <Dial value={d} disabled={busy} onChange={(v) => setDigit(i, v)} tick={tick} cfg={cfg} />
            </div>
          ))}
        </div>
        <div className={`${p}-response-wrap`}>
          <span className={`${p}-response`} ref={responseRef}>{response}</span>
        </div>
        {/* combinación probada: cada símbolo en el pixel EXACTO donde su dial lo mostraba (misma fila/celda/gap).
            Se ve mientras se resuelve (aunque las ruedas caigan) y se oculta al aparecer el mensaje. */}
        {busy && (
          <div className={`${p}-tried`} ref={triedRef} style={{ opacity: 0 }}>
            {digits.map((d, i) => <span key={i} className={`${p}-tried-cell`}>{cfg.symbols[d]}</span>)}
          </div>
        )}
      </div>

      {/* botones Win98 (98.css): bisel real, transparentes, sin icono. Bajan + fade en el intento. */}
      <div className="lock-actions win98" ref={actionsRef}>
        <button type="button" onClick={onUnlock}>Resolver</button>
        <button type="button" onClick={() => { if (!busy) panelRef.current?.close(onClose); }}>Cancelar</button>
      </div>

      {/* tras CORRECTO: botón "Salir" (aparece con fade-in; CORRECTO + combinación persisten arriba) */}
      {exit && (
        <div className="lock-exit win98" ref={exitRef} style={{ opacity: 0 }}>
          <button type="button" onClick={() => panelRef.current?.close(onClose)}>Salir</button>
        </div>
      )}
    </LockPanel>
  );
}
