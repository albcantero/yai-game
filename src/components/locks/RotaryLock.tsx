// CANDADO ROTATORIO (dial de combinación). Cuerpo/dial/arco 1:1 del original (markup en el JSX, medidas en
// rotarylock.css), incluida la animación de apertura del arco. La INTERACCIÓN es propia (sin jQuery/GSAP/Howl):
// la combinación se muestra como un OTP-input (un hueco por número); el dial fija el número del hueco ACTIVO (el que
// lleva el "ring" de foco), los carets < > mueven el foco entre huecos, y "Resolver" comprueba la combinación
// (como en pad/letter/geometry). Sonidos con playSfx. Marco = LockPanel.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import LockPanel, { type LockPanelHandle } from "./LockPanel";

const TICKS = 40;
const TICK_ANGLE = 360 / TICKS; // 9° por marca
// número bajo la flecha (arriba) según la rotación del dial (misma fórmula que el findCombo original: angle/9)
const numberAtArrow = (rot: number) => ((Math.round(-rot / TICK_ANGLE) % TICKS) + TICKS) % TICKS;
// caret pixelado (apunta a la derecha); el de la izquierda es el mismo espejado por CSS (.prev)
const CARET = "M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z";

export type RotaryLockProps = {
  combo: number[]; // secuencia de números (0..39) que abre el candado, EN ORDEN
  playSfx: (src: string, vol?: number) => void;
  onSolved: () => void; // combinación correcta → resolver el puzzle + cerrar
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function RotaryLock({ combo, playSfx, onSolved, onClose }: RotaryLockProps) {
  const nums = combo.map((n) => ((n % TICKS) + TICKS) % TICKS); // 0..39 (como el original: >=40 → 0)
  const [rot, setRot] = useState(0); // rotación del dial (deg); el hueco activo muestra numberAtArrow(rot)
  const [active, setActive] = useState(0); // índice del hueco con foco (ring)
  const [stored, setStored] = useState<number[]>(() => nums.map(() => 0)); // valor fijado de cada hueco NO activo
  const [open, setOpen] = useState(false); // combinación correcta → el arco se eleva (animación 1:1)
  const [exit, setExit] = useState(false); // tras abrir: aparece "Salir"

  const dialRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<LockPanelHandle>(null);
  const rotRef = useRef(0); // rotación en vivo (fuente de verdad durante el arrastre)
  const lastAngleRef = useRef(0);
  const draggingRef = useRef(false);
  const lastTickRef = useRef(0);
  const activeIdxRef = useRef(0); // índice del hueco activo (para leerlo fuera del render)
  const storedRef = useRef<number[]>(stored);
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
    draggingRef.current = true;
    lastAngleRef.current = angleOf(e);
    lastTickRef.current = Math.round(rotRef.current / TICK_ANGLE);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    const cur = angleOf(e);
    const next = rotRef.current + norm180(cur - lastAngleRef.current);
    lastAngleRef.current = cur;
    setRotation(next); // el hueco activo refleja este giro en vivo
    const t = Math.round(next / TICK_ANGLE);
    if (t !== lastTickRef.current) { lastTickRef.current = t; playSfx("/audio/tick.mp3", 1); } // mismo tic que los otros candados (al cruzar cada marca)
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* no capturado */ }
    setRotation(Math.round(rotRef.current / TICK_ANGLE) * TICK_ANGLE); // encaja en la marca
  };

  // mueve el foco entre huecos: fija el número actual en el hueco que dejamos y lleva el dial al valor del nuevo
  const move = (dir: -1 | 1) => {
    if (openRef.current) return;
    const cur = activeIdxRef.current;
    const ni = Math.max(0, Math.min(nums.length - 1, cur + dir));
    if (ni === cur) return;
    const next = [...storedRef.current];
    next[cur] = numberAtArrow(rotRef.current); // fija lo marcado en el hueco que abandonamos
    storedRef.current = next;
    setStored(next);
    activeIdxRef.current = ni;
    setActive(ni);
    setRotation(-next[ni] * TICK_ANGLE); // el dial salta al valor guardado del nuevo hueco (0 si nunca se tocó)
  };

  const check = () => {
    if (openRef.current) return;
    const vals = [...storedRef.current];
    vals[activeIdxRef.current] = numberAtArrow(rotRef.current); // incluye el hueco activo (aún sin "fijar")
    const ok = nums.length > 0 && vals.every((v, i) => v === nums[i]);
    if (ok) {
      openRef.current = true;
      setOpen(true); // el arco se eleva y se queda arriba
      playSfx("/audio/lock-online-1.mp3", 0.6); // ¡abierto!
      timerRef.current = window.setTimeout(() => setExit(true), 1000); // tras elevarse el arco, aparece "Salir"
    } else {
      playSfx("/audio/lock-fail-1.mp3", 0.6); // combinación incorrecta
    }
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      <div className={"rotary" + (open ? " solved" : "")}>
        <div className="rotary-container">
          <div className="rotary-lock">
            <div className={"rotary-shackle" + (open ? " unlocked" : "")}>
              <div className="rotary-top">
                <div className="rotary-inner" />
              </div>
              <div className="rotary-left">
                <div className="rotary-dent-l" />
                <div className="rotary-dent-r" />
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
        {/* combinación como OTP-input: hueco activo con ring; carets < > para moverse entre huecos */}
        <div className="rotary-combo">
          <button type="button" className="rotary-caret prev" onClick={() => move(-1)} disabled={open || active === 0} aria-label="Hueco anterior">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={CARET} /></svg>
          </button>
          {nums.map((_, i) => (
            <span key={i} className={"rotary-num" + (i === active ? " active" : "")}>
              {i === active ? numberAtArrow(rot) : stored[i]}
            </span>
          ))}
          <button type="button" className="rotary-caret next" onClick={() => move(1)} disabled={open || active === nums.length - 1} aria-label="Hueco siguiente">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={CARET} /></svg>
          </button>
        </div>
      </div>

      <div className="lock-actions win98">
        <button type="button" onClick={check} disabled={open}>Resolver</button>
        <button type="button" onClick={() => panelRef.current?.close(onClose)} disabled={open}>Cancelar</button>
      </div>
      {exit && (
        <div className="lock-exit win98">
          <button type="button" onClick={() => { onSolved(); panelRef.current?.close(onClose); }}>Salir</button>
        </div>
      )}
    </LockPanel>
  );
}
