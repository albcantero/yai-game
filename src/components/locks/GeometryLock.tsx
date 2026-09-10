// CANDADO DE FIGURAS (geometrylock, especial #1). Carrusel HORIZONTAL de SÍMBOLOS que gira SOLO con las flechas
// prev/next (sin arrastre); cada paso desliza el strip con un muelle (Motion, un pelín de rebote). El centrado es
// el seleccionado. La pantalla muestra la combinación (mini-formas) + BLOQUEADO/ABIERTO. Al coincidir con `combo`
// (índices de forma) → resuelve. Clases namespaced (geolock-*) en geometrylock.css. Sonido de engranajes por gesto.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { animate } from "motion";
import LockPanel, { type LockPanelHandle } from "./LockPanel";
import { E_OUT, SHAKE } from "./lockAnim";

// Los símbolos (índices 0..N-1): pixel-art en viewBox 0 0 24 24; el fill lo pone el CSS (.geolock-shape).
// Cambiar el set o el orden es trivial (solo SVG). Orden y nombres definidos por Alberto.
export const SHAPES: { name: string; el: ReactNode }[] = [
  { name: "estrella", el: <path d="M13 3h2v4h8v4h-2v2h-2v3h2v6h-5v-2h-2v-2h-4v2H8v2H3v-6h2v-3H3v-2H1V7h8V3h2V1h2v2Z" /> },
  { name: "luna", el: <path d="M14 4h-2v2h-2v6h2v2h6v-2h2v-2h2v8h-2v2h-2v2H8v-2H6v-2H4v-2H2V6h2V4h2V2h8v2Z" /> },
  { name: "chispa", el: <path d="M13 9h2v2h7v2h-7v2h-2v7h-2v-7H9v-2H2v-2h7V9h2V2h2v7Zm-4 8H7v-2h2v2Zm8 0h-2v-2h2v2Zm-6-4h2v-2h-2v2ZM9 9H7V7h2v2Zm8 0h-2V7h2v2Z" /> },
  { name: "triángulo", el: <path d="M13 4h2v4h2v4h2v4h2v6H3v-6h2v-4h2V8h2V4h2V2h2v2Z" /> },
  { name: "cuadrado", el: <path d="M22 22H2V2h20v20Z" /> },
  { name: "número", el: <path d="M18 4h2v2h2v12h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2V2h12v2ZM8 7v2h2v8h2V9h2v6h2V9h2V7H8Zm8 8v2h2v-2h-2ZM6 9v2h2V9H6Z" /> },
  { name: "sol", el: <path d="M13 22h-2v-3h2v3Zm-6-3H5v-2h2v2Zm12 0h-2v-2h2v2ZM15 9h2v6h-2v2H9v-2H7V9h2V7h6v2ZM5 13H2v-2h3v2Zm17 0h-3v-2h3v2ZM7 7H5V5h2v2Zm12 0h-2V5h2v2Zm-6-2h-2V2h2v3Z" /> },
  { name: "nube", el: <path d="M16 6h2v2h2v2h2v2h2v6h-2v2H2v-2H0v-6h2v-2h2V8h4V6h2V4h6v2Z" /> },
  { name: "espacio", el: null }, // hueco (último): no dibuja nada; significa "espacio" en la combinación
];
const N = SHAPES.length; // 9 (8 figuras + el hueco)
const shapeAt = (i: number) => SHAPES[((i % N) + N) % N].el; // forma en el índice (con wrap)

const CELL_W = 70; // ancho de celda (px); DEBE coincidir con .geolock-cell en geometrylock.css
const RENDER = 3; // celdas a cada lado del centro (las de fuera las recorta la ventana)

// Una FILA: gira SOLO con las flechas (sin arrastre táctil). Al cambiar de figura, el strip se desliza con un
// MUELLE (Motion, un pelín de rebote): offset = desplazamiento del strip en px durante la animación; el muelle
// lo lleva a 0. Confirmamos el valor al instante y compensamos con el offset para que no dé un salto.
function Row({ value, onChange, tick }: { value: number; onChange: (v: number) => void; tick: () => void }) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const controls = useRef<{ stop: () => void } | null>(null);
  const setOff = (v: number) => { offsetRef.current = v; setOffset(v); };
  useEffect(() => () => controls.current?.stop(), []); // corta el muelle al desmontar

  const step = (dir: number) => {
    tick(); // engranajes: un sonido por gesto (pulsación de flecha)
    controls.current?.stop(); // permite pulsar rápido: interrumpe el muelle en curso
    onChange(((value + dir) % N + N) % N); // confirma el nuevo valor ya
    const from = offsetRef.current + dir * CELL_W; // desde la posición visual actual + un paso (así no salta)
    setOff(from);
    controls.current = animate(from, 0, { type: "spring", bounce: 0.3, visualDuration: 0.34, onUpdate: setOff });
  };

  const pos = value - offset / CELL_W; // posición continua del centro (en índice)
  const c = Math.round(pos);
  return (
    <div className="geolock-row">
      <button type="button" className="geolock-arrow geolock-prev" aria-label="Anterior" onClick={() => step(-1)} />
      <div className="geolock-track">
        {Array.from({ length: RENDER * 2 + 1 }, (_, i) => c - RENDER + i).map((j) => {
          const d = Math.abs(j - pos);
          const op = Math.max(0.3, 1 - d * 0.7); // centro nítido, laterales atenuados
          const sc = Math.max(0.55, 1 - d * 0.45);
          return (
            <div className="geolock-cell" key={j} style={{ transform: `translateX(${(j - pos) * CELL_W}px)` }}>
              <svg className="geolock-shape" viewBox="0 0 24 24" aria-hidden="true" style={{ opacity: op, transform: `scale(${sc})` }}>
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
  combo: number[]; // combinación correcta (un índice de forma 0..N-1 por fila); la longitud = nº de filas
  playSfx: (src: string, vol?: number) => void;
  onSolved: () => void; // combinación correcta → resolver el puzzle + cerrar
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function GeometryLock({ combo, playSfx, onSolved, onClose }: GeometryLockProps) {
  const [values, setValues] = useState<number[]>(() => combo.map(() => 0));
  const key = values.join("-"); // clave para comparar (índices)
  const target = combo.join("-");
  const verified = key === target; // estado UNLOCKED/LOCKED derivado en vivo (sin estado ni efecto: se recalcula solo)
  const tick = () => playSfx("/audio/gears.mp3", 0.6); // engranajes al girar el carrusel (candado mecánico)

  // MARCO compartido con el resto de candados: LockPanel (sube + paper-slide al aparecer, slide-out al cerrar).
  const geoRef = useRef<HTMLDivElement>(null); // el candado en sí (para el shake si falla)
  const panelRef = useRef<LockPanelHandle>(null); // marco compartido: expone close(cb)

  const setVal = (i: number, v: number) => setValues((vs) => vs.map((x, j) => (j === i ? v : x)));

  const onResolve = () => {
    if (key === target) panelRef.current?.close(onSolved); // correcto → resolver + cerrar
    else if (geoRef.current) animate(geoRef.current, { x: SHAKE }, { duration: 0.4, ease: E_OUT }); // incorrecto → shake
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      <div className={"geolock" + (verified ? " verified" : "")} ref={geoRef}>
        <div className="geolock-lock">
          <div className="geolock-screen">
            <div className="geolock-code">
              {values.map((v, i) => (
                <svg className="geolock-mini" viewBox="0 0 24 24" key={i} aria-hidden="true">{shapeAt(v)}</svg>
              ))}
            </div>
            <div className="geolock-status">{verified ? "ABIERTO" : "BLOQUEADO"}</div>
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
      <div className="lock-actions win98">
        <button type="button" onClick={onResolve}>Resolver</button>
        <button type="button" onClick={() => panelRef.current?.close(onClose)}>Cancelar</button>
      </div>
    </LockPanel>
  );
}
