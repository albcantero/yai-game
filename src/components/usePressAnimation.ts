import { useEffect } from "react";

// Animación de pulsado POR BOTÓN (no global) para `.chin-btn` y `.keyboard button`: cada botón completa
// su animación entera (baja y sube, con un mínimo garantizado) aunque lo pulses rapidísimo. Se pueden
// pulsar varias teclas a la vez sin ahogo: cada pointer va por su cuenta. Solo se ignora re-pulsar EL
// MISMO botón mientras aún anima (evita el doble-fire que motivó el guard). Multitáctil: por pointerId.
// Coordina con el CSS por el atributo `data-pressing`.
export function usePressAnimation() {
  useEffect(() => {
    const presses = new Map<number, { btn: HTMLElement; at: number }>(); // pointerId -> pulsación viva
    const timers = new Map<HTMLElement, number>(); // botón -> timer de "levantar"
    const down = (e: PointerEvent) => {
      const now = performance.now();
      // Red de seguridad: libera pulsaciones fantasma (nunca llegó pointerup/cancel, p. ej. un gesto del
      // sistema iOS secuestró el toque) para que ese botón no quede bloqueado el resto de la sesión.
      // 8s es más largo que cualquier mantener-pulsado real, así que no interfiere con el hold-to-repeat.
      for (const [pid, p] of presses) {
        if (now - p.at > 8000) {
          presses.delete(pid);
          const st = timers.get(p.btn);
          if (st) {
            clearTimeout(st);
            timers.delete(p.btn);
          }
          p.btn.removeAttribute("data-pressing");
        }
      }
      const btn = (e.target as HTMLElement)?.closest?.(".chin-btn, .keyboard button") as HTMLElement | null;
      if (!btn) return;
      if (btn.hasAttribute("data-pressing")) {
        e.stopPropagation(); // MISMO botón aún animando: corta el handler de React (ni acción ni sonido)
        return; // (re-pulsar la misma tecla dentro de su ventana de animación se descarta a propósito)
      }
      presses.set(e.pointerId, { btn, at: now });
      btn.setAttribute("data-pressing", "");
    };
    const up = (e: PointerEvent) => {
      const p = presses.get(e.pointerId);
      if (!p) return;
      presses.delete(e.pointerId);
      const min = p.btn.classList.contains("chin-kb") ? 200 : 130;
      const wait = Math.max(0, min - (performance.now() - p.at)); // deja que la animación baje+suba entera
      const timer = window.setTimeout(() => {
        p.btn.removeAttribute("data-pressing");
        timers.delete(p.btn);
      }, wait);
      timers.set(p.btn, timer);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);
}
