// CANDADO DE FIGURAS (geometrylock, especial #1). Carrusel HORIZONTAL por posición (arrastre + snap + wrap, misma
// técnica que el dial vertical; SIN dependencias). Cada rueda cicla 6 FORMAS; la centrada es la seleccionada. La
// pantalla muestra la combinación (mini-formas) + LOCKED/UNLOCKED. Al coincidir con `combo` (índices de forma) → resuelve.
// Clases namespaced (geolock-*) en geometrylock.css. Sonido de "select" con nuestro playSfx.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { animate } from "motion";

// Las 6 formas (índices 0..5). Cambiar aquí el set o el orden es trivial (solo SVG). fill vía CSS.
export const SHAPES: { name: string; el: React.ReactNode }[] = [
  { name: "triángulo", el: <polygon points="12,3 21,20 3,20" /> },
  { name: "círculo", el: <circle cx="12" cy="12" r="9" /> },
  { name: "cuadrado", el: <rect x="4" y="4" width="16" height="16" rx="1" /> },
  { name: "rombo", el: <polygon points="12,2 21,12 12,22 3,12" /> },
  { name: "luna", el: <path d="M16 3 A9 9 0 1 0 16 21 A7 7 0 1 1 16 3 Z" /> },
  { name: "estrella", el: <polygon points="12,2 14.6,8.8 22,9.2 16.3,13.8 18.2,21 12,16.9 5.8,21 7.7,13.8 2,9.2 9.4,8.8" /> },
];
const N = SHAPES.length; // 6
const shapeAt = (i: number) => SHAPES[((i % N) + N) % N].el; // forma en el índice (con wrap)

const CELL_W = 70; // ancho de celda (px); DEBE coincidir con .geolock-cell en geometrylock.css
const RENDER = 3; // celdas a cada lado del centro (las de fuera las recorta la ventana)

// Una FILA carrusel horizontal: arrastras y la forma centrada queda seleccionada (wrap 0..N-1). Snap al soltar.
function Row({ value, onChange, tick }: { value: number; onChange: (v: number) => void; tick: () => void }) {
  const [drag, setDrag] = useState(0);
  const [anim, setAnim] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);
  const settling = useRef(false);
  const lastC = useRef(value);

  const onDown = (e: ReactPointerEvent) => {
    if (settling.current) return;
    active.current = true;
    startX.current = e.clientX;
    lastC.current = value;
    setAnim(false);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!active.current) return;
    const nd = e.clientX - startX.current;
    const nc = Math.round(value - nd / CELL_W);
    if (nc !== lastC.current) { lastC.current = nc; tick(); } // "click" al cruzar cada forma
    setDrag(nd);
  };
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    const steps = Math.round(drag / CELL_W);
    if (steps === 0) { setAnim(true); setDrag(0); return; }
    settling.current = true;
    setAnim(true);
    setDrag(steps * CELL_W);
    window.setTimeout(() => {
      onChange(((value - steps) % N + N) % N); // arrastrar a la derecha (steps>0) = forma anterior
      setAnim(false);
      setDrag(0);
      settling.current = false;
    }, 190);
  };
  const step = (dir: number) => { if (settling.current) return; tick(); onChange(((value + dir) % N + N) % N); };

  const posX = value - drag / CELL_W; // posición continua del centro (en índice)
  const c = Math.round(posX);
  const tr = anim ? "transform .19s ease-out" : "none";
  return (
    <div className="geolock-row">
      <button type="button" className="geolock-arrow geolock-prev" aria-label="Anterior" onClick={() => step(-1)} />
      <div className="geolock-track" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
        {Array.from({ length: RENDER * 2 + 1 }, (_, i) => c - RENDER + i).map((j) => {
          const d = Math.abs(j - posX);
          const op = Math.max(0.3, 1 - d * 0.7); // centro nítido, laterales atenuados
          const sc = Math.max(0.55, 1 - d * 0.45);
          return (
            <div className="geolock-cell" key={j} style={{ transform: `translateX(${(j - posX) * CELL_W}px)`, transition: tr }}>
              <svg className="geolock-shape" viewBox="0 0 24 24" aria-hidden="true"
                style={{ opacity: op, transform: `scale(${sc})`, transition: anim ? "opacity .19s ease-out, transform .19s ease-out" : "none" }}>
                {shapeAt(j)}
              </svg>
            </div>
          );
        })}
      </div>
      <button type="button" className="geolock-arrow geolock-next" aria-label="Siguiente" onClick={() => step(1)} />
    </div>
  );
}

export type GeometryLockProps = {
  combo: number[]; // combinación correcta (un índice de forma 0..5 por fila); la longitud = nº de filas
  playSfx: (src: string, vol?: number) => void;
  onSolved: () => void; // combinación correcta → resolver el puzzle + cerrar
  onClose: () => void; // (sin uso todavía; se añadirá al estilarlo)
};

export default function GeometryLock({ combo, playSfx, onSolved, onClose }: GeometryLockProps) {
  const [values, setValues] = useState<number[]>(() => combo.map(() => 0));
  const [verified, setVerified] = useState(false);
  const key = values.join("-"); // clave para comparar (índices)
  const target = combo.join("-");
  const tick = () => playSfx("/audio/mouse-click.mp3", 0.5);

  // MARCO compartido con el resto de candados (mismo patrón): panel que sube + paper-slide + botones + slide-out.
  const slideRef = useRef<HTMLDivElement>(null);
  const geoRef = useRef<HTMLDivElement>(null); // el candado en sí (para el shake si falla)
  const closing = useRef(false);
  const EASE_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

  const setVal = (i: number, v: number) => setValues((vs) => vs.map((x, j) => (j === i ? v : x)));

  useEffect(() => { setVerified(key === target); }, [key, target]); // el estado UNLOCKED/LOCKED es en vivo

  // al aparecer: la placa entra deslizándose desde abajo (+ paper-slide), como el resto de candados
  useEffect(() => {
    if (slideRef.current) {
      playSfx("/audio/paper-slide.mp3", 1);
      animate(slideRef.current, { y: [window.innerHeight, 0] }, { type: "spring", bounce: 0, visualDuration: 0.55 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // salir: animación inversa (baja) + paper-slide, y al terminar ejecuta el cierre
  const slideOut = (cb: () => void) => {
    if (closing.current) return;
    closing.current = true;
    playSfx("/audio/paper-slide.mp3", 1);
    const el = slideRef.current;
    if (el) animate(el, { y: [0, window.innerHeight] }, { type: "spring", bounce: 0, visualDuration: 0.55 }).finished.then(cb);
    else cb();
  };
  const onResolve = () => {
    if (closing.current) return;
    if (key === target) slideOut(onSolved); // correcto → resolver + cerrar
    else if (geoRef.current) animate(geoRef.current, { x: [0, 10, -10, 10, 0] }, { duration: 0.4, ease: EASE_OUT }); // incorrecto → shake
  };

  return (
    <div className="geolock-slide" ref={slideRef} style={{ transform: "translateY(100vh)" }}>
      <div className={"geolock" + (verified ? " verified" : "")} ref={geoRef}>
        <div className="geolock-lock">
          <div className="geolock-screen">
            <div className="geolock-code">
              {values.map((v, i) => (
                <svg className="geolock-mini" viewBox="0 0 24 24" key={i} aria-hidden="true">{shapeAt(v)}</svg>
              ))}
            </div>
            <div className="geolock-status">{verified ? "UNLOCKED" : "LOCKED"}</div>
            <div className="geolock-scanlines" />
          </div>
          <div className="geolock-rows">
            {values.map((v, i) => (
              <Row key={i} value={v} onChange={(nv) => setVal(i, nv)} tick={tick} />
            ))}
          </div>
        </div>
      </div>

      {/* botones Win98 (mismo marco que el resto de candados) */}
      <div className="geolock-actions win98">
        <button type="button" onClick={onResolve}>Resolver</button>
        <button type="button" onClick={() => slideOut(onClose)}>Cancelar</button>
      </div>
    </div>
  );
}
