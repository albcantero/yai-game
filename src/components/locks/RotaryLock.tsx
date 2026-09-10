// CANDADO ROTATORIO (dial de combinación). Markup 1:1 del pug original y estilos 1:1 del SCSS (en rotarylock.css),
// incluida la animación de apertura (arco: unlocked/pivot1/pivot2/moveLeft/moveRight). Lo ÚNICO reimplementado (no
// improvisado): la interacción, para no depender de jQuery/GSAP Draggable/Howl: la rueda gira con nuestro drag
// rotatorio (ángulo del puntero al centro) y encaja en la marca al soltar; al soltar sobre el siguiente número de
// `combo` (en orden) avanza, y con el último se abre el arco. Sonidos con playSfx. Marco = LockPanel.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import LockPanel, { type LockPanelHandle } from "./LockPanel";

const TICKS = 40;
const TICK_ANGLE = 360 / TICKS; // 9° por marca
// número bajo la flecha (arriba) según la rotación del dial (misma fórmula que el findCombo original: angle/9)
const numberAtArrow = (rot: number) => ((Math.round(-rot / TICK_ANGLE) % TICKS) + TICKS) % TICKS;

export type RotaryLockProps = {
  combo: number[]; // secuencia de números (0..39) a alinear EN ORDEN
  playSfx: (src: string, vol?: number) => void;
  onSolved: () => void; // combinación completa → resolver el puzzle + cerrar
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function RotaryLock({ combo, playSfx, onSolved, onClose }: RotaryLockProps) {
  const nums = combo.map((n) => ((n % TICKS) + TICKS) % TICKS); // 0..39 (como el original: >=40 → 0)
  const [rot, setRot] = useState(0); // rotación del dial (deg)
  const [found, setFound] = useState(0); // nº de la combinación acertados EN ORDEN
  const [open, setOpen] = useState(false); // arco abierto → dispara la animación 1:1
  const [exit, setExit] = useState(false); // tras abrir: aparece "Salir"

  const dialRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<LockPanelHandle>(null);
  const rotRef = useRef(0); // rotación en vivo (fuente de verdad durante el arrastre)
  const lastAngleRef = useRef(0);
  const activeRef = useRef(false);
  const lastTickRef = useRef(0);
  const foundRef = useRef(0);
  const openRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current); }, []);

  const setRotation = (v: number) => { rotRef.current = v; setRot(v); };
  const angleOf = (e: ReactPointerEvent) => {
    const el = dialRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  const norm180 = (a: number) => ((a + 180) % 360 + 360) % 360 - 180;

  const onDown = (e: ReactPointerEvent) => {
    if (openRef.current) return; // abierto: no se gira
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
    const snapped = Math.round(rotRef.current / TICK_ANGLE) * TICK_ANGLE; // encaja en la marca
    setRotation(snapped);
    check(snapped);
  };

  const check = (r: number) => {
    if (openRef.current) return;
    if (numberAtArrow(r) !== nums[foundRef.current]) return; // no es el siguiente número: no avanza
    const nf = foundRef.current + 1;
    foundRef.current = nf;
    setFound(nf);
    if (nf === nums.length) {
      openRef.current = true;
      setOpen(true); // arco: unlocked + pivot1 + pivot2 + moveLeft + moveRight (animación 1:1)
      playSfx("/audio/lock-online-1.mp3", 0.6); // ¡abierto!
      timerRef.current = window.setTimeout(() => setExit(true), 2400); // tras la animación de apertura, "Salir"
    } else {
      playSfx("/audio/lock-button-4.mp3", 0.6); // número correcto (aún no el último)
    }
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      <div className="rotary">
        <div className="rotary-container">
          <div className="rotary-lock">
            <div className={"rotary-shackle" + (open ? " unlocked" : "")}>
              <div className={"rotary-top" + (open ? " pivot1" : "")}>
                <div className={"rotary-inner" + (open ? " pivot2" : "")} />
              </div>
              <div className={"rotary-left" + (open ? " moveRight" : "")}>
                <div className={"rotary-dent-l" + (open ? " moveLeft" : "")} />
                <div className={"rotary-dent-r" + (open ? " moveLeft" : "")} />
              </div>
              <div className="rotary-right" />
            </div>
            <div className="rotary-arrow" />
          </div>
          <div className="rotary-dial" ref={dialRef}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ transform: `rotate(${rot}deg)` }}>
            {Array.from({ length: TICKS }, (_, j) => {
              const major = j % 5 === 0;
              return (
                <div key={j} className={"rotary-tick" + (major ? " major" : "")}
                  style={{ transform: `translateY(${major ? 54 : 63}px) rotate(${9 * j + 180}deg)` }}>
                  {major && <span>{j}</span>}
                </div>
              );
            })}
          </div>
        </div>
        {/* combinación (visible como en el original; verde al acertar en orden) */}
        <div className="rotary-combo">
          {nums.map((n, i) => <span key={i} className={"rotary-num" + (i < found ? " found" : "")}>{n}</span>)}
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
