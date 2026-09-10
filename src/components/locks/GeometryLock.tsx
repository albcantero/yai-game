// CANDADO DE FIGURAS (geometrylock, especial #1). Carrusel HORIZONTAL de SÍMBOLOS que gira SOLO con las flechas
// prev/next (sin arrastre); cada paso desliza el strip con un muelle (Motion, un pelín de rebote). El centrado es
// el seleccionado. La pantalla muestra la combinación (mini-formas) + BLOQUEADO/ABIERTO. Al coincidir con `combo`
// (índices de forma) → resuelve. Clases namespaced (geolock-*) en geometrylock.css. Sonido de engranajes por gesto.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { animate } from "motion";
import LockPanel, { type LockPanelHandle } from "./LockPanel";
import { E_OUT, E_INOUT, BTN_OUT, SHAKE } from "./lockAnim";

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
const RENDER = 3; // celdas a cada lado del centro (las de fuera las recorta la ventana / se ponen de canto)
const ITEM_ANGLE = 30; // grados por celda en el cilindro HORIZONTAL (a más grados, más curvado)
const RADIUS = Math.round((CELL_W / 2) / Math.tan((ITEM_ANGLE / 2) * Math.PI / 180)); // radio del cilindro (px)

// Una FILA: RUEDA 3D horizontal que gira SOLO con las flechas (sin arrastre). Cada celda se coloca en un cilindro
// (rotateY + translateZ); la centrada mira de frente y las de los lados giran de canto y se desvanecen. Al cambiar
// de figura, el cilindro rota con un MUELLE (Motion, un pelín de rebote): offset = desplazamiento en px durante la
// animación; el muelle lo lleva a 0 (confirmamos el valor al instante y compensamos con el offset para no saltar).
// `turn()` reproduce los engranajes y bloquea todos los botones hasta que acaba; si devuelve false, se ignora.
function Row({ value, onChange, turn, release, disabled }: { value: number; onChange: (v: number) => void; turn: () => boolean; release: () => void; disabled: boolean }) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const controls = useRef<{ stop: () => void } | null>(null);
  const setOff = (v: number) => { offsetRef.current = v; setOffset(v); };
  useEffect(() => () => controls.current?.stop(), []); // corta el muelle al desmontar

  const step = (dir: number) => {
    if (!turn()) return; // bloqueado hasta que acabe el sonido de engranajes
    controls.current?.stop();
    onChange(((value + dir) % N + N) % N); // confirma el nuevo valor ya
    const from = offsetRef.current + dir * CELL_W; // desde la posición visual actual + un paso (así no salta)
    setOff(from);
    controls.current = animate(from, 0, { type: "spring", bounce: 0.3, visualDuration: 0.34, onUpdate: setOff, onComplete: release }); // al terminar el muelle: libera los botones
  };

  const pos = value - offset / CELL_W; // posición continua del centro (en índice)
  const c = Math.round(pos);
  return (
    <div className="geolock-row">
      <button type="button" className="geolock-arrow geolock-prev" aria-label="Anterior" onClick={() => step(-1)} disabled={disabled} />
      <div className="geolock-track">              {/* ventana (overflow) */}
        <div className="geolock-wheel">            {/* perspectiva SOLA (separada del overflow: si no, se aplana el 3D) */}
          <div className="geolock-cyl" style={{ transform: `translateZ(${-RADIUS}px)` }}>   {/* preserve-3d, empujado atrás para que la celda central quede en el plano (sin agrandarse) */}
            {Array.from({ length: RENDER * 2 + 1 }, (_, i) => c - RENDER + i).map((j) => {
              const angle = -(j - pos) * ITEM_ANGLE; // ángulo de la celda j en el cilindro (fracción incluida)
              const opacity = Math.max(0, Math.cos((angle * Math.PI) / 180)); // las que giran hacia atrás se desvanecen
              return (
                <div className={"geolock-cell" + (j === c ? " geolock-center" : "")} key={j} style={{ transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`, opacity }}>
                  <svg className="geolock-shape" viewBox="0 0 24 24" aria-hidden="true">{shapeAt(j)}</svg>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button type="button" className="geolock-arrow geolock-next" aria-label="Siguiente" onClick={() => step(1)} disabled={disabled} />
    </div>
  );
}

export type GeometryLockProps = {
  combo: number[]; // combinación correcta (un índice de forma 0..N-1 por fila); la longitud = nº de filas
  playSfx: (src: string, vol?: number) => number; // devuelve la duración del sonido (para bloquear hasta que acabe)
  onSolved: () => void; // combinación correcta → resolver el puzzle + cerrar
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function GeometryLock({ combo, playSfx, onSolved, onClose }: GeometryLockProps) {
  const [values, setValues] = useState<number[]>(() => {
    const v = combo.map(() => Math.floor(Math.random() * N)); // arranque ALEATORIO (no siempre en la primera figura)
    if (v.join("-") === combo.join("-")) v[0] = (v[0] + 1) % N; // nunca arrancar ya resuelto por casualidad
    return v;
  });
  const key = values.join("-"); // clave para comparar (índices)
  const target = combo.join("-");
  const isCorrect = key === target; // ¿coincide ya la combinación? (para decidir en Resolver; NO pinta verde en vivo)
  const [solved, setSolved] = useState(false); // verde "ABIERTO": SOLO tras pulsar Resolver con la combinación correcta
  const [shaking, setShaking] = useState(false); // agitándose por error: deshabilita Resolver/Cancelar hasta que acaba
  const shakingRef = useRef(false);
  const [exit, setExit] = useState(false); // tras acertar: los botones caen y aparece "Salir"

  // MARCO compartido con el resto de candados: LockPanel (sube + paper-slide al aparecer, slide-out al cerrar).
  const geoRef = useRef<HTMLDivElement>(null); // el candado en sí (para el shake)
  const panelRef = useRef<LockPanelHandle>(null); // marco compartido: expone close(cb)
  const actionsRef = useRef<HTMLDivElement>(null); // botones Resolver/Cancelar (caen al acertar, 1:1 con pad/letterlock)
  const exitRef = useRef<HTMLDivElement>(null); // botón "Salir" (aparece tras acertar)
  const dropTimer = useRef<number | null>(null); // pausa (0,5s) tras el agitado antes de que caigan los botones
  useEffect(() => () => { if (dropTimer.current !== null) clearTimeout(dropTimer.current); }, []);
  useEffect(() => { if (exit && exitRef.current) animate(exitRef.current, { opacity: [0, 1] }, { duration: 0.5, ease: E_OUT }); }, [exit]); // "Salir" con fade-in

  // Guard: al girar una fila suenan los engranajes y TODOS los botones quedan disabled (pista visual). Se liberan
  // al terminar la ANIMACIÓN del muelle (la fila llama a release en su onComplete), no al acabar el sonido.
  // `busy` (estado) deshabilita los botones; `busyRef` corta reentradas síncronas.
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const turn = (): boolean => {
    if (busyRef.current) return false; // gesto en curso: no gira
    busyRef.current = true;
    setBusy(true);
    playSfx("/audio/gears.mp3", 0.6); // engranajes (el guard se libera al acabar el muelle, ver release)
    return true;
  };
  const release = () => { busyRef.current = false; setBusy(false); }; // fin de la animación del muelle: botones de vuelta

  const setVal = (i: number, v: number) => setValues((vs) => vs.map((x, j) => (j === i ? v : x)));

  // Resolver: SOLO aquí se pinta verde (no en vivo). Correcto → verde (ABIERTO + combinación + figuras centrales),
  // congela, deja ver el verde un momento y desliza el candado hacia fuera. Incorrecto → shake.
  const onResolve = () => {
    if (busyRef.current || solved || shakingRef.current) return; // sonido en curso, resuelto o agitándose
    if (isCorrect) {
      setSolved(true); // verde: ABIERTO + combinación (fila) + figuras centrales
      setBusy(true); // las flechas de avanzar el dial quedan (y PERMANECEN) disabled
      busyRef.current = true;
      // en DOS tiempos: 1º se agita TODO (en verde, igual que el incorrecto); 2º al acabar, caen Resolver/Cancelar
      // (misma animación que pad/letterlock) y luego aparece "Salir" (que cierra + resuelve).
      const dropButtons = () => {
        if (!actionsRef.current) return;
        animate(actionsRef.current, { y: BTN_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT }).finished.then(() => setExit(true));
      };
      // al acabar el agitado, los botones PERMANECEN 0,5s disabled y LUEGO caen + aparece "Salir"
      const afterShake = () => { dropTimer.current = window.setTimeout(dropButtons, 500); };
      if (geoRef.current) animate(geoRef.current, { x: SHAKE }, { duration: 0.4, ease: E_OUT }).finished.then(afterShake);
      else afterShake();
    } else if (geoRef.current) {
      shakingRef.current = true;
      setShaking(true); // incorrecto: agita + deshabilita Resolver/Cancelar; vuelven al acabar
      animate(geoRef.current, { x: SHAKE }, { duration: 0.4, ease: E_OUT }).finished.then(() => { shakingRef.current = false; setShaking(false); });
    }
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      <div className={"geolock" + (solved ? " verified" : "")} ref={geoRef}>
        <div className="geolock-lock">
          <div className="geolock-screen">
            <div className="geolock-code">
              {values.map((v, i) => (
                <svg className="geolock-mini" viewBox="0 0 24 24" key={i} aria-hidden="true">{shapeAt(v)}</svg>
              ))}
            </div>
            <div className="geolock-status">{solved ? "ABIERTO" : "BLOQUEADO"}</div>
            <div className="geolock-scanlines" />
          </div>
          <div className="geolock-rows">
            {values.map((v, i) => (
              <Row key={i} value={v} onChange={(nv) => setVal(i, nv)} turn={turn} release={release} disabled={busy} />
            ))}
          </div>
        </div>
      </div>

      {/* botones Win98 (mismo marco que el resto de candados). disabled mientras suena (pista visual) */}
      <div className="lock-actions win98" ref={actionsRef}>
        <button type="button" onClick={onResolve} disabled={busy || shaking}>Resolver</button>
        <button type="button" onClick={() => panelRef.current?.close(onClose)} disabled={busy || shaking}>Cancelar</button>
      </div>

      {/* tras acertar: los botones caen y aparece "Salir" (fade-in), que cierra + resuelve el puzzle */}
      {exit && (
        <div className="lock-exit win98" ref={exitRef} style={{ opacity: 0 }}>
          <button type="button" onClick={() => panelRef.current?.close(onSolved)}>Salir</button>
        </div>
      )}
    </LockPanel>
  );
}
