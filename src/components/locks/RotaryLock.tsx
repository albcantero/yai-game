// CANDADO ROTATORIO (dial de combinación). Cuerpo/dial/arco 1:1 del original (markup en el JSX, medidas en
// rotarylock.css), incluida la animación de apertura del arco. La INTERACCIÓN es propia (sin jQuery/GSAP/Howl):
// la combinación se muestra como un OTP-input (un hueco por número); el dial fija el número del hueco ACTIVO (el que
// lleva el "ring" de foco), los carets < > mueven el foco entre huecos, y "Resolver" comprueba la combinación.
// Resolver correcto/incorrecto REPLICA a geometryLock (mismos valores): incorrecto = agita + fallo y reactiva los
// botones al acabar la música; correcto = agita + acierto, pausa 0,5s, caen Resolver/Cancelar y aparece "Salir".
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { animate } from "motion";
import LockPanel, { type LockPanelHandle } from "./LockPanel";
import { E_OUT, E_INOUT, BTN_OUT, SHAKE } from "./lockAnim";

const TICKS = 40;
const TICK_ANGLE = 360 / TICKS; // 9° por marca
// número bajo la flecha (arriba) según la rotación del dial (misma fórmula que el findCombo original: angle/9)
const numberAtArrow = (rot: number) => ((Math.round(-rot / TICK_ANGLE) % TICKS) + TICKS) % TICKS;
// caret pixelado (apunta a la derecha); el de la izquierda es el mismo espejado por CSS (.prev)
const CARET = "M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z";

export type RotaryLockProps = {
  combo: number[]; // secuencia de números (0..39) que abre el candado, EN ORDEN
  playSfx: (src: string, vol?: number) => number; // devuelve la duración del sonido (para reactivar al acabar la música)
  onSolved: () => void; // combinación correcta → resolver el puzzle + cerrar
  onClose: () => void; // cancelar (botón Cancelar): cerrar sin resolver
};

export default function RotaryLock({ combo, playSfx, onSolved, onClose }: RotaryLockProps) {
  const nums = combo.map((n) => ((n % TICKS) + TICKS) % TICKS); // 0..39 (como el original: >=40 → 0)
  const [dispNum, setDispNum] = useState(0); // número mostrado en el hueco activo. NO se re-renderiza por cada move:
  // el giro del dial se escribe DIRECTO al DOM (ver applyRot) y esto solo cambia al cruzar una marca (1 re-render/marca)
  const [active, setActive] = useState(0); // índice del hueco con foco (ring)
  const [stored, setStored] = useState<number[]>(() => nums.map(() => 0)); // valor fijado de cada hueco NO activo
  const [open, setOpen] = useState(false); // correcto: el arco se eleva (CSS) + OTP verde; disabled permanente
  const [shaking, setShaking] = useState(false); // incorrecto: agita + deshabilita botones hasta que acaba la música
  const [exit, setExit] = useState(false); // tras acertar: los botones caen y aparece "Salir"

  const dialRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null); // el candado en sí (.rotary) para el shake
  const panelRef = useRef<LockPanelHandle>(null); // marco compartido: expone close(cb)
  const actionsRef = useRef<HTMLDivElement>(null); // Resolver/Cancelar (caen al acertar, 1:1 con geometry/pad/letter)
  const exitRef = useRef<HTMLDivElement>(null); // botón "Salir" (aparece tras acertar)
  const rotRef = useRef(0); // rotación en vivo (fuente de verdad durante el arrastre)
  const lastAngleRef = useRef(0);
  const draggingRef = useRef(false);
  const lastTickRef = useRef(0);
  const activeIdxRef = useRef(0); // índice del hueco activo (para leerlo fuera del render)
  const storedRef = useRef<number[]>(stored);
  const openRef = useRef(false);
  const shakingRef = useRef(false);
  const dropTimer = useRef<number | null>(null); // pausa (0,5s) tras el agitado antes de que caigan los botones
  const centerRef = useRef({ x: 0, y: 0 }); // centro del dial, cacheado en pointerdown (evita getBoundingClientRect por move)
  const pendingRef = useRef<{ x: number; y: number } | null>(null); // último puntero pendiente de procesar en el rAF
  const rafRef = useRef<number | null>(null); // rAF en cola: coalesce los moves a 1 por frame (sin backlog en giro rápido)

  useEffect(() => () => {
    if (dropTimer.current !== null) clearTimeout(dropTimer.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);
  useEffect(() => { if (exit && exitRef.current) animate(exitRef.current, { opacity: [0, 1] }, { duration: 0.5, ease: E_OUT }); }, [exit]); // "Salir" con fade-in

  // aplica la rotación DIRECTO al DOM (sin setState → sin re-render): fluido y sin arrastrar el hilo (audio al instante)
  const applyRot = (v: number) => { rotRef.current = v; if (dialRef.current) dialRef.current.style.transform = `rotate(${v}deg)`; };
  // ángulo del puntero respecto al centro CACHEADO del dial (sin getBoundingClientRect en cada move → sin layout thrashing)
  const angleAt = (x: number, y: number) => Math.atan2(y - centerRef.current.y, x - centerRef.current.x) * 180 / Math.PI;
  const norm180 = (a: number) => ((a + 180) % 360 + 360) % 360 - 180;

  // procesa el ÚLTIMO puntero pendiente, 1 vez por frame (rAF): gira, y al cruzar marca suena el tic + refresca número
  const processMove = () => {
    rafRef.current = null;
    const p = pendingRef.current;
    if (!p || !draggingRef.current) return;
    const cur = angleAt(p.x, p.y);
    const next = rotRef.current + norm180(cur - lastAngleRef.current);
    lastAngleRef.current = cur;
    applyRot(next); // giro directo al DOM (sin re-render)
    const t = Math.round(next / TICK_ANGLE);
    if (t !== lastTickRef.current) { // al CRUZAR una marca: tic + número (único re-render, solo cuando cambia)
      lastTickRef.current = t;
      playSfx("/audio/tick.mp3", 1); // mismo tic que los otros candados
      setDispNum(numberAtArrow(next));
    }
  };

  const onDown = (e: ReactPointerEvent) => {
    if (openRef.current || shakingRef.current) return; // abierto o agitándose: no se gira
    const el = dialRef.current;
    if (el) { const r = el.getBoundingClientRect(); centerRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } // centro UNA vez
    draggingRef.current = true;
    lastAngleRef.current = angleAt(e.clientX, e.clientY);
    lastTickRef.current = Math.round(rotRef.current / TICK_ANGLE);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    pendingRef.current = { x: e.clientX, y: e.clientY }; // el handler solo GUARDA; el trabajo va al rAF (1 por frame, sin backlog)
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(processMove);
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    pendingRef.current = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* no capturado */ }
    const snapped = Math.round(rotRef.current / TICK_ANGLE) * TICK_ANGLE; // encaja en la marca
    applyRot(snapped);
    setDispNum(numberAtArrow(snapped));
  };

  // mueve el foco entre huecos: fija el número actual en el hueco que dejamos y lleva el dial al valor del nuevo
  const move = (dir: -1 | 1) => {
    if (openRef.current || shakingRef.current) return;
    const cur = activeIdxRef.current;
    const ni = Math.max(0, Math.min(nums.length - 1, cur + dir));
    if (ni === cur) return;
    playSfx("/audio/lock-button-1.mp3", 0.6); // sonido mecánico del caret (no el click genérico del ratón)
    const next = [...storedRef.current];
    next[cur] = numberAtArrow(rotRef.current); // fija lo marcado en el hueco que abandonamos
    storedRef.current = next;
    setStored(next);
    activeIdxRef.current = ni;
    setActive(ni);
    const target = -next[ni] * TICK_ANGLE; // el dial salta al valor guardado del nuevo hueco (0 si nunca se tocó)
    applyRot(target);
    setDispNum(numberAtArrow(target));
  };

  // Resolver: comprueba la combinación. Correcto/incorrecto REPLICA a geometryLock (mismos valores y efecto).
  const onResolve = () => {
    if (openRef.current || shakingRef.current) return;
    const vals = [...storedRef.current];
    vals[activeIdxRef.current] = numberAtArrow(rotRef.current); // incluye el hueco activo (aún sin "fijar")
    const ok = nums.length > 0 && vals.every((v, i) => v === nums[i]);
    if (ok) {
      openRef.current = true;
      setOpen(true); // el arco se eleva (CSS) + OTP en verde; carets/dial disabled permanente
      playSfx("/audio/lock-online-1.mp3", 0.6); // sonido de ACIERTO (común a los 4 candados)
      // en DOS tiempos (igual que geometry): 1º agita TODO mientras sube el arco; 2º al acabar, PERMANECEN 0,5s
      // disabled y LUEGO caen Resolver/Cancelar (misma animación que pad/letter) y aparece "Salir".
      const dropButtons = () => {
        if (!actionsRef.current) return;
        animate(actionsRef.current, { y: BTN_OUT, opacity: 0 }, { duration: 0.5, ease: E_INOUT }).finished.then(() => setExit(true));
      };
      const afterShake = () => { dropTimer.current = window.setTimeout(dropButtons, 500); };
      if (boxRef.current) animate(boxRef.current, { x: SHAKE }, { duration: 0.4, ease: E_OUT }).finished.then(afterShake);
      else afterShake();
    } else {
      shakingRef.current = true;
      setShaking(true); // incorrecto: agita + Resolver/Cancelar disabled; vuelven al ACABAR el agitado (1:1 geometry)
      playSfx("/audio/lock-fail-1.mp3", 0.6); // sonido de FALLO (común a los 4 candados), durante el shake
      if (boxRef.current) animate(boxRef.current, { x: SHAKE }, { duration: 0.4, ease: E_OUT }).finished.then(() => { shakingRef.current = false; setShaking(false); });
      else { shakingRef.current = false; setShaking(false); }
    }
  };

  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      <div className={"rotary" + (open ? " solved" : "")} ref={boxRef}>
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
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
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
          <button type="button" className="rotary-caret prev" data-no-click-sfx onClick={() => move(-1)} disabled={open || shaking || active === 0} aria-label="Hueco anterior">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={CARET} /></svg>
          </button>
          {nums.map((_, i) => (
            <span key={i} className={"rotary-num" + (i === active ? " active" : "")}>
              {i === active ? dispNum : stored[i]}
            </span>
          ))}
          <button type="button" className="rotary-caret next" data-no-click-sfx onClick={() => move(1)} disabled={open || shaking || active === nums.length - 1} aria-label="Hueco siguiente">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={CARET} /></svg>
          </button>
        </div>
      </div>

      {/* botones Win98 (mismo marco que el resto de candados). disabled al resolver o mientras agita */}
      <div className="lock-actions win98" ref={actionsRef}>
        <button type="button" onClick={onResolve} disabled={open || shaking}>Resolver</button>
        <button type="button" onClick={() => panelRef.current?.close(onClose)} disabled={open || shaking}>Cancelar</button>
      </div>

      {/* tras acertar: los botones caen y aparece "Salir" (fade-in), que cierra + resuelve el puzzle */}
      {exit && (
        <div className="lock-exit win98" ref={exitRef} style={{ opacity: 0 }}>
          <button type="button" onClick={() => { onSolved(); panelRef.current?.close(onClose); }}>Salir</button>
        </div>
      )}
    </LockPanel>
  );
}
