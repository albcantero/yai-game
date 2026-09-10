import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Estado + gesto de ARRASTRE de un dial cilindro por posición: se arrastra y el símbolo centrado queda elegido
// (wrap 0..count-1), con snap al soltar. Lo usa el dial del Padlock (números/letras). Devuelve `pos` (posición
// continua del centro, en índice), `drag`/`anim` para pintar y los handlers de puntero. Mantiene el timer del
// snap y lo cancela al desmontar. (El candado de figuras NO lo usa: gira con flechas + muelle, en GeometryLock.)
export function useCarousel({ axis, size, count, value, onCommit, onTick, disabled }: {
  axis: "x" | "y";
  size: number;          // px por símbolo (ROW en el dial)
  count: number;         // nº de símbolos (para el wrap)
  value: number;         // índice actual (controlado por el padre)
  onCommit: (v: number) => void; // nuevo índice ya envuelto, al terminar el snap
  onTick?: () => void;   // "tick" al cruzar CADA símbolo
  disabled?: boolean;    // bloquea el gesto (p. ej. mientras el candado anima)
}) {
  const [drag, setDrag] = useState(0); // desplazamiento en vivo del arrastre (px)
  const [anim, setAnim] = useState(false); // transición al soltar (snap)
  const start = useRef(0);
  const active = useRef(false);
  const settling = useRef(false); // en el snap post-soltar: ignora nuevos gestos
  const lastC = useRef(value); // último símbolo en el centro (para el tick al cruzar)
  const timer = useRef<number | null>(null); // timeout del snap: se cancela al desmontar (evita setState en desmontado)

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  const coord = (e: ReactPointerEvent) => (axis === "y" ? e.clientY : e.clientX);

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || settling.current) return;
    active.current = true;
    start.current = coord(e);
    lastC.current = value;
    setAnim(false);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!active.current) return;
    const nd = coord(e) - start.current;
    const nc = Math.round(value - nd / size); // símbolo que pasa por el centro ahora
    if (nc !== lastC.current) { lastC.current = nc; onTick?.(); } // tick por cada símbolo cruzado
    setDrag(nd);
  };
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    const steps = Math.round(drag / size); // nº de símbolos movidos (sin límite: scroll largo válido)
    if (steps === 0) { setAnim(true); setDrag(0); return; } // no llega: vuelve al centro
    settling.current = true;
    setAnim(true);
    setDrag(steps * size); // rueda hasta encajar en el símbolo destino (solo anima la fracción)
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onCommit(((value - steps) % count + count) % count); // arrastrar en positivo (steps>0) = símbolo anterior
      setAnim(false);
      setDrag(0); // el re-render ya centra el nuevo valor: sin salto visual
      settling.current = false;
    }, 190);
  };

  const pos = value - drag / size; // posición continua del centro, en índice
  return { drag, anim, pos, onDown, onMove, finish };
}
