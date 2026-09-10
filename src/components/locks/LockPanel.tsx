// MARCO compartido de TODOS los candados: panel que llena la pantalla interna, entra deslizándose desde abajo
// (+ paper-slide) al aparecer y sale igual (hacia abajo) al cerrar. Expone close(cb) para que cada candado lo
// cierre (Cancelar / Salir / al resolver). El CONTENIDO (el candado en sí + botones) va como children; cada
// candado mantiene su propio flujo. Estilos: .lockpanel en locks.css.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ReactNode } from "react";
import { animate } from "motion";

export type LockPanelHandle = { close: (cb: () => void) => void };

const LockPanel = forwardRef<LockPanelHandle, { playSfx: (src: string, vol?: number) => void; children: ReactNode }>(
  function LockPanel({ playSfx, children }, ref) {
    const slideRef = useRef<HTMLDivElement>(null);
    const closing = useRef(false);

    // aparecer: entra deslizándose desde abajo (fuera del viewport → su sitio), sin opacidad, spring bounce 0
    useEffect(() => {
      if (slideRef.current) {
        playSfx("/audio/paper-slide.mp3", 1);
        animate(slideRef.current, { y: [window.innerHeight, 0] }, { type: "spring", bounce: 0, visualDuration: 0.55 });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // cerrar: animación inversa (baja fuera del viewport) + paper-slide, y al terminar ejecuta cb (una sola vez)
    useImperativeHandle(ref, () => ({
      close: (cb: () => void) => {
        if (closing.current) return;
        closing.current = true;
        playSfx("/audio/paper-slide.mp3", 1);
        const el = slideRef.current;
        if (el) animate(el, { y: [0, window.innerHeight] }, { type: "spring", bounce: 0, visualDuration: 0.55 }).finished.then(cb);
        else cb();
      },
    }));

    return (
      <div className="lockpanel" ref={slideRef} style={{ transform: "translateY(100vh)" }}>
        {children}
      </div>
    );
  },
);
export default LockPanel;
