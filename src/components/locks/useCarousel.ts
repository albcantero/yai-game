import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Estado + gestos COMPARTIDOS de un carrusel por posición: se arrastra y el símbolo centrado queda elegido
// (wrap 0..count-1), con snap al soltar. Lo usan el dial vertical del Padlock (axis "y") y la fila horizontal
// del GeometryLock (axis "x"); solo cambian el eje y el paso (`size`). Mantiene el timer del snap y lo cancela
// al desmontar. Devuelve `pos` (posición continua del centro, en índice), `drag`/`anim` para pintar, los
// handlers de puntero y `step(dir)` para las flechas prev/next (animado igual que el snap del arrastre).
export function useCarousel({ axis, size, count, value, onCommit, onTick, disabled }: {
  axis: "x" | "y";
  size: number;          // px por símbolo (ROW en el dial, CELL_W en la fila)
  count: number;         // nº de símbolos (para el wrap)
  value: number;         // índice actual (controlado por el padre)
  onCommit: (v: number) => void; // nuevo índice ya envuelto, al terminar el snap
  onTick: () => void;    // "tick" al cruzar cada símbolo
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

  // rueda hasta encajar `steps` posiciones (solo anima la fracción) y confirma el nuevo valor tras 190 ms
  const settle = (steps: number) => {
    settling.current = true;
    setAnim(true);
    setDrag(steps * size);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onCommit(((value - steps) % count + count) % count); // arrastrar en positivo (steps>0) = símbolo anterior
      setAnim(false);
      setDrag(0); // el re-render ya centra el nuevo valor: sin salto visual
      settling.current = false;
    }, 190);
  };

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
    if (nc !== lastC.current) { lastC.current = nc; onTick(); }
    setDrag(nd);
  };
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    const steps = Math.round(drag / size); // nº de símbolos movidos (sin límite: scroll largo válido)
    if (steps === 0) { setAnim(true); setDrag(0); return; } // no llega: vuelve al centro
    settle(steps);
  };
  // flechas prev/next: desliza UNA celda animando (como el snap). dir +1 = siguiente, -1 = anterior.
  const step = (dir: number) => {
    if (settling.current) return;
    onTick();
    settle(-dir);
  };

  const pos = value - drag / size; // posición continua del centro, en índice
  return { drag, anim, pos, onDown, onMove, finish, step };
}
