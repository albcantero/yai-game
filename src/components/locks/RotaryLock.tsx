// CANDADO ROTATORIO (dial de combinación tipo taquilla). Montaje adaptado del original (jQuery + GSAP Draggable +
// Howl) SIN esas librerías: la rueda gira con nuestro drag rotatorio (ángulo del puntero respecto al centro), los
// sonidos con playSfx, y el marco (entrada/salida/paper-slide) es LockPanel. Se alinean los números de `combo` con
// la flecha roja EN ORDEN: al soltar sobre el número correcto, avanza (verde); con el último, se abre el arco.
// Provisional (estética del original); luego lo pasamos a nuestro retro.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import LockPanel, { type LockPanelHandle } from "./LockPanel";

const TICKS = 40;
const TICK_ANGLE = 360 / TICKS; // 9° por marca
// número que queda bajo la flecha (arriba) según la rotación del dial: la marca i está a i*9°; tras girar `rot`,
// la marca bajo la flecha (0°) cumple i*9 + rot ≡ 0 → i ≡ -rot/9 (mod 40).
const numberAtArrow = (rot: number) => ((Math.round(-rot / TICK_ANGLE) % TICKS) + TICKS) % TICKS;

export type RotaryLockProps = {
  combo: number[]; // secuencia de números (0..39) a alinear EN ORDEN
  playSfx: (src: string, vol?: number) => void;
  onSolved: () => void; // combinación completa → resolver el puzzle + cerrar
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function RotaryLock({ combo, playSfx, onSolved, onClose }: RotaryLockProps) {
  const [rot, setRot] = useState(0); // rotación del dial (deg)
  const [found, setFound] = useState(0); // nº de la combinación acertados EN ORDEN
  const [unlocked, setUnlocked] = useState(false); // el arco se ha abierto
  const [exit, setExit] = useState(false); // tras abrir: aparece "Salir"

  const dialRef = useRef<HTMLDivElement>(null); // para el centro (ángulo del puntero)
  const panelRef = useRef<LockPanelHandle>(null);
  const rotRef = useRef(0); // rotación en vivo (fuente de verdad durante el arrastre)
  const lastAngleRef = useRef(0); // último ángulo del puntero (delta incremental)
  const activeRef = useRef(false);
  const lastTickRef = useRef(0); // última marca cruzada (para el tic)
  const foundRef = useRef(0); // espejo de found (sin closures obsoletas en el check)
  const unlockedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current); }, []);

  const setRotation = (v: number) => { rotRef.current = v; setRot(v); };
  // ángulo (deg) del puntero respecto al centro del dial
  const angleOf = (e: ReactPointerEvent) => {
    const el = dialRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  const norm180 = (a: number) => ((a + 180) % 360 + 360) % 360 - 180; // delta a rango -180..180 (evita saltos al cruzar ±180)

  const onDown = (e: ReactPointerEvent) => {
    if (unlockedRef.current) return; // abierto: no se gira
    activeRef.current = true;
    lastAngleRef.current = angleOf(e);
    lastTickRef.current = Math.round(rotRef.current / TICK_ANGLE);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!activeRef.current) return;
    const cur = angleOf(e);
    const next = rotRef.current + norm180(cur - lastAngleRef.current);
    lastAngleRef.current = cur;
    setRotation(next);
    const t = Math.round(next / TICK_ANGLE);
    if (t !== lastTickRef.current) { lastTickRef.current = t; playSfx("/audio/lock-button-1.mp3", 0.4); } // tic al cruzar cada marca
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* no capturado */ }
    const snapped = Math.round(rotRef.current / TICK_ANGLE) * TICK_ANGLE; // encaja en la marca más cercana
    setRotation(snapped);
    check(snapped);
  };

  // al soltar: si bajo la flecha está el SIGUIENTE número de la combinación, avanza; con el último, abre el arco.
  const check = (r: number) => {
    if (unlockedRef.current) return;
    if (numberAtArrow(r) !== combo[foundRef.current]) return; // no es el siguiente: no avanza (sin castigo)
    const nf = foundRef.current + 1;
    foundRef.current = nf;
    setFound(nf);
    if (nf === combo.length) {
      unlockedRef.current = true;
      setUnlocked(true);
      playSfx("/audio/lock-online-1.mp3", 0.6); // ¡abierto!
      timerRef.current = window.setTimeout(() => setExit(true), 1300); // tras abrirse el arco, aparece "Salir"
    } else {
      playSfx("/audio/lock-button-4.mp3", 0.6); // número correcto (aún no el último)
    }
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      <div className="rotary">
        <div className="rotary-lock">
          <div className={"rotary-shackle" + (unlocked ? " open" : "")} aria-hidden="true" />
          <div className="rotary-body" aria-hidden="true" />
          <div className="rotary-arrow" aria-hidden="true" />
          <div className="rotary-dial" ref={dialRef}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ transform: `rotate(${rot}deg)` }}>
            {Array.from({ length: TICKS }, (_, i) => (
              <div key={i} className={"rotary-tick" + (i % 5 === 0 ? " major" : "")} style={{ transform: `rotate(${i * TICK_ANGLE}deg)` }}>
                {i % 5 === 0 && <span>{i}</span>}
              </div>
            ))}
            <div className="rotary-knob" />
          </div>
        </div>
        {/* combinación (visible como en el original; verde al acertar en orden). Luego la ocultamos para el juego */}
        <div className="rotary-combo">
          {combo.map((n, i) => <span key={i} className={"rotary-num" + (i < found ? " found" : "")}>{n}</span>)}
        </div>
      </div>

      <div className="lock-actions win98">
        <button type="button" onClick={() => panelRef.current?.close(onClose)}>Cancelar</button>
      </div>
      {exit && (
        <div className="lock-exit win98">
          <button type="button" onClick={() => { onSolved(); panelRef.current?.close(onClose); }}>Salir</button>
        </div>
      )}
    </LockPanel>
  );
}
