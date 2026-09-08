import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// Minimapa del edificio, DATA-DRIVEN: las salas y las conexiones son datos, y esta MISMA estructura es
// la que el motor del juego leerá para la topología (qué sala conecta con cuál = grafo del backtracking).
// Coordenadas en un viewBox 0..100, calcadas del plano PNG (pendiente de afinar a mano con Alberto).
// name = nombre amable (barra de título del panel); puzzles = nº de puzzles de la sala (contador del panel).
type Room = { id: string; x: number; y: number; w: number; h: number; discovered: boolean; name?: string; puzzles?: number };
// NOTA TEMP (desarrollo): todas las salas están discovered:true = mapa ENTERO desbloqueado.
// Revertir (poner el fog real) cuando cableemos el estado del juego.
const ROOMS: Room[] = [
  { id: "r3", x: 52.4, y: 6.4, w: 20.0, h: 23.1, discovered: true },
  { id: "r4", x: 19.0, y: 6.3, w: 11.7, h: 20.1, discovered: true },
  { id: "r6", x: 79.9, y: 6.3, w: 15.0, h: 17.0, discovered: true },
  { id: "r5", x: 5.3, y: 31.1, w: 13.0, h: 15.0, discovered: true },
  { id: "r7", x: 80.9, y: 29.4, w: 13.0, h: 19.0, discovered: true },
  { id: "hub-almacen", x: 39.9, y: 41.6, w: 8.0, h: 26.2, discovered: true, name: "Almacén", puzzles: 1 }, // sala 1 (inicio)
  { id: "r2", x: 56.1, y: 45.7, w: 18.9, h: 12.2, discovered: true, puzzles: 3 }, // sala central: 3 puzzles, 2 salidas (r6/r3)
  { id: "r1", x: 55.2, y: 63.0, w: 19.8, h: 25.5, discovered: true, name: "Sala de Máquinas", puzzles: 1 },
  { id: "r8", x: 81.3, y: 54.7, w: 15.0, h: 21.9, discovered: true },
  { id: "libreria", x: 5.0, y: 52.5, w: 29.6, h: 41.0, discovered: true },
];
// Cada conexión guarda su ruta (pts, con esquinas) para pintar el corredor tal cual, y el par de salas
// que une (from/to) para la lógica de niebla. Ruta calcada del SVG de Affinity.
// keys = llaves necesarias para cruzar esa puerta (alimentará los candados; 0/undefined = puerta libre).
type Link = { from: string; to: string; pts: [number, number][]; keys?: number };
const LINKS: Link[] = [
  { from: "libreria", to: "hub-almacen", pts: [[26, 56], [26, 44.5], [41.8, 44.5]] }, // L limpia de 90° (antes un codo muy abierto que parecía diagonal)
  { from: "r5", to: "r4", pts: [[10.1, 35.0], [10.1, 21.5], [20.1, 17.9]] },
  // "Cruz" del almacén partida por estado: L sólida almacén↔r3 (ambas descubiertas) + ramal a r4
  // (bloqueada) que sale en dashed. Al descubrir r4, el ramal pasa a sólido solo y reforma la cruz.
  { from: "hub-almacen", to: "r3", pts: [[44, 44], [44, 15], [58, 15]] },
  { from: "r4", to: "r3", pts: [[24, 15], [44, 15]] },
  { from: "r6", to: "r7", pts: [[88.9, 21.9], [88.9, 31.1]] },
  { from: "r7", to: "r8", pts: [[86.1, 47.9], [86.1, 57.1]] },
  { from: "r2", to: "r6", pts: [[68.5, 48.9], [77.2, 24.4], [91.4, 15.8]], keys: 1 }, // salida 1 de la sala central
  { from: "r2", to: "r3", pts: [[62.8, 49.0], [62.6, 28.3]], keys: 1 }, // salida 2 de la sala central
  { from: "r1", to: "r2", pts: [[71.5, 64.2], [67.2, 56.2]] }, // Sala de Máquinas → sala central (sin llave)
  { from: "r1", to: "hub-almacen", pts: [[58.3, 84.9], [44, 77], [44, 64]], keys: 1 }, // Almacén ↓ Sala de Máquinas: 1 llave
];
const KEYS_TO_TIENDA = 3; // la Tienda (¿sala del mapa o el programa del menú?) necesita 3 llaves. Pendiente ubicarla
void KEYS_TO_TIENDA;

const CURRENT = "hub-almacen"; // sala donde empieza / está el grupo: el almacén (sala 1)

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const cx = (r: Room) => r.x + r.w / 2;
const cy = (r: Room) => r.y + r.h / 2;

// Paleta del mapa: suelo claro con borde oscuro; niebla oscura con "?"; pin rojo = grupo
const EDGE = "#5f685f", FLOOR = "#cfd6cf";
const FOG_FILL = "#141a16", FOG_EDGE = "#333b34", FOG_Q = "#5a675e";
const MARKER = "#e03131", MARKER_EDGE = "#000"; // "estáis aquí": pin de ubicación rojo con borde negro
const MARKER_D = "M20 12V16H18V18H16V20H14V22H10V20H8V18H6V16H4V12H20ZM14 4H16V8H14V10H10V8H8V4H10V2H14V4Z";
const linkD = (lk: Link) => "M" + lk.pts.map((p) => p.join(",")).join("L");
const shown = (lk: Link) => !!byId[lk.from]?.discovered && !!byId[lk.to]?.discovered;
// Insignia de cada sala: SOLO la bandera gris (tocable vía su propio wrapper con margen, no toda la sala).
// En la sala ACTUAL la marca es el pin rojo en vez de la bandera.
const FLAG = "#3a4038", FLAG_D = "M6 4h14v2h-2v2h-2v2h2v2h2v2H6v8H4V2h2v2Z";

// ---------- Cámara del mapa (pan/zoom) ----------
// El contenido va dentro de un <g> con transform="translate(x y) scale(k)" en unidades de viewBox
// (origen 0,0, sin ambigüedad). Un punto de sala P se ve en viewBox en (x + k·P). Los gestos actualizan
// {x,y,k} al instante; abrir el panel recoloca con un tween (mover, NUNCA zoom: k no cambia).
type View = { x: number; y: number; k: number };
const FIT: View = { x: 0, y: 0, k: 1 };
const K_MIN = 0.6, K_MAX = 4;
const clampK = (k: number) => Math.max(K_MIN, Math.min(K_MAX, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const Minimap = forwardRef<ScreenHandle, ScreenServices>(function Minimap(_props, ref) {
  const [selected, setSelected] = useState<string | null>(null); // sala con el panel de info abierto
  const [tab, setTab] = useState(0); // pestaña activa del panel
  const [view, setView] = useState<View>(FIT); // transform de la cámara
  const [frozenH, setFrozenH] = useState<number | null>(null); // alto FIJO del mapa (pantalla sin teclado)
  useImperativeHandle(ref, () => ({ handleKey: () => {}, isLoading: () => false, setPaused: () => {} }), []);

  const rootRef = useRef<HTMLDivElement>(null); // .minimap-screen: viewport que recorta (encoge con el teclado)
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>(FIT); // espejo de view para los handlers de puntero (sin closures obsoletas)
  const beforeOpenRef = useRef<View>(FIT); // view previo a abrir el panel (para restaurar al cerrar)
  const rafRef = useRef<number | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestRef = useRef<{ mode: "none" | "pan" | "pinch"; x: number; y: number; dist: number }>({ mode: "none", x: 0, y: 0, dist: 0 });
  const movedRef = useRef(false); // el gesto se movió = NO es un toque (no abre panel)
  const capturedRef = useRef(false); // ya se capturó el puntero de este arrastre

  const curRoom = byId[CURRENT];
  const selRoom = selected ? byId[selected] : null;

  const setV = (v: View) => { viewRef.current = v; setView(v); };

  // client (px) -> coordenadas de viewBox (pre-cámara), vía la CTM del SVG (respeta viewBox + aspect ratio)
  const toVB = (px: number, py: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: px, y: py };
    const p = new DOMPoint(px, py).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const stopRaf = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };

  // tween suave del view (recolocar al abrir/cerrar el panel). Los gestos NO usan esto: son inmediatos.
  const animateTo = (target: View) => {
    stopRaf();
    const start = viewRef.current, t0 = performance.now(), dur = 380;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = easeOut(p);
      setV({ x: lerp(start.x, target.x, e), y: lerp(start.y, target.y, e), k: lerp(start.k, target.k, e) });
      rafRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // view que deja el pin de la sala ACTUAL en el centro del rectángulo superior libre (mitad de arriba),
  // SIN tocar el zoom. Se calcula con la geometría real (CTM), no con números fijos: robusto al letterbox.
  const recenter = (): View | null => {
    const root = rootRef.current;
    if (!root || !curRoom) return null;
    const r = root.getBoundingClientRect();
    const V = toVB(r.left + r.width * 0.5, r.top + r.height * 0.25); // centro de la mitad superior (chincheta)
    const k = viewRef.current.k;
    return { x: V.x - k * cx(curRoom), y: V.y - k * cy(curRoom), k };
  };

  // al abrir el panel: recolocar el mapa; al cerrar: volver a donde estaba
  useEffect(() => {
    if (selected) { beforeOpenRef.current = viewRef.current; const t = recenter(); if (t) animateTo(t); }
    else if (rootRef.current) { animateTo(beforeOpenRef.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // TAMAÑO FIJO: congelar el alto del mapa al de la pantalla SIN teclado. Al mostrar el teclado la pantalla
  // encoge (flex), pero el mapa mantiene su alto (se recorta por abajo) y el pin queda fijo. El teclado NO
  // dispara resize de ventana, así que solo re-medimos al girar / redimensionar de verdad.
  useEffect(() => {
    const measure = () => { if (rootRef.current) setFrozenH(rootRef.current.clientHeight); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, []);

  useEffect(() => stopRaf, []);

  // ---------- gestos: arrastrar (1 dedo) + pinza (2 dedos) ----------
  const syncGesture = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length === 1) gestRef.current = { mode: "pan", x: pts[0].x, y: pts[0].y, dist: 0 };
    else if (pts.length >= 2) {
      const [a, b] = pts;
      gestRef.current = { mode: "pinch", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    } else gestRef.current = { mode: "none", x: 0, y: 0, dist: 0 };
  };
  const onDown = (e: ReactPointerEvent) => {
    stopRaf();
    if (pointersRef.current.size === 0) { movedRef.current = false; capturedRef.current = false; }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2 && !capturedRef.current) { // pinza: capturar ya (nunca es un toque)
      capturedRef.current = true;
      for (const id of pointersRef.current.keys()) { try { e.currentTarget.setPointerCapture(id); } catch { /* puntero ya inactivo */ } }
    }
    syncGesture();
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestRef.current, v = viewRef.current;
    if (g.mode === "pan") {
      if (!capturedRef.current && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 3) { // pasó de toque a arrastre: capturar
        capturedRef.current = true; movedRef.current = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      const from = toVB(g.x, g.y), to = toVB(e.clientX, e.clientY);
      setV({ x: v.x + (to.x - from.x), y: v.y + (to.y - from.y), k: v.k });
      g.x = e.clientX; g.y = e.clientY;
    } else if (g.mode === "pinch") {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dist = Math.hypot(a.x - b.x, a.y - b.y);
      const k2 = clampK(v.k * (dist / (g.dist || dist)));
      const PM = toVB(g.x, g.y), CM = toVB(mx, my); // punto medio anterior y actual, en viewBox
      // zoom alrededor del punto medio anterior (deja su contenido fijo) + desplazamiento del punto medio
      setV({
        x: PM.x - (k2 / v.k) * (PM.x - v.x) + (CM.x - PM.x),
        y: PM.y - (k2 / v.k) * (PM.y - v.y) + (CM.y - PM.y),
        k: k2,
      });
      movedRef.current = true;
      g.x = mx; g.y = my; g.dist = dist;
    }
  };
  const onUp = (e: ReactPointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* no capturado */ }
    syncGesture();
  };

  return (
    <div className="minimap-screen" ref={rootRef}>
      {/* .minimap-view: alto FIJO (pantalla sin teclado); recibe los gestos (touch-action:none en CSS) */}
      <div className="minimap-view" style={frozenH ? { height: frozenH } : undefined}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <svg ref={svgRef} className="minimap-svg" viewBox="-3 -3 106 106" preserveAspectRatio="xMidYMid meet">
          <g className="minimap-camera" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* 1. corredores por descubrir (no interceptan el toque) */}
            {LINKS.map((lk, i) =>
              shown(lk) ? null : (
                <path key={"fog" + i} className="minimap-fog-link" d={linkD(lk)} fill="none"
                  stroke={FOG_EDGE} strokeWidth={0.8} strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none" />
              ),
            )}
            {/* 2. CONTORNO oscuro de los pasillos, DEBAJO de las salas (esquinas en pico) */}
            {LINKS.map((lk, i) =>
              shown(lk) ? (
                <path key={"out" + i} d={linkD(lk)} fill="none" stroke={EDGE} strokeWidth={4.6}
                  strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} pointerEvents="none" />
              ) : null,
            )}
            {/* 3. salas: NO tocables (el toque vive en la bandera). por descubrir = oscura con "?"; descubierta = suelo claro */}
            {ROOMS.map((r) => {
              if (!r.discovered) {
                return (
                  <g key={r.id} pointerEvents="none">
                    <rect className="minimap-fog-room" x={r.x} y={r.y} width={r.w} height={r.h} fill={FOG_FILL}
                      stroke={FOG_EDGE} strokeWidth={0.8} strokeDasharray="1.4 1.4" />
                    <text x={cx(r)} y={cy(r)} fill={FOG_Q} fontSize={Math.min(r.w, r.h) * 0.5}
                      fontFamily="'Courier Pixel',monospace" textAnchor="middle" dominantBaseline="central">?</text>
                  </g>
                );
              }
              return <rect key={r.id} pointerEvents="none"
                x={r.x} y={r.y} width={r.w} height={r.h} fill={FLOOR} stroke={EDGE} strokeWidth={1.2} />;
            })}
            {/* 4. RELLENO claro de los pasillos ENCIMA de las salas: abre la puerta en la unión */}
            {LINKS.map((lk, i) =>
              shown(lk) ? (
                <path key={"fil" + i} d={linkD(lk)} fill="none" stroke={FLOOR} strokeWidth={2.6}
                  strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} pointerEvents="none" />
              ) : null,
            )}
            {/* 5. insignia por sala: SOLO la marca (pin rojo si es la actual, si no bandera gris), centrada.
                El toque vive en un wrapper con margen (rect transparente) alrededor de la marca, no en la sala.
                movedRef = si el gesto fue un arrastre/pinza, NO se abre panel. */}
            {ROOMS.map((r) => {
              const cur = r.id === CURRENT;
              return (
                <g key={"badge" + r.id} transform={`translate(${cx(r).toFixed(2)},${cy(r).toFixed(2)})`}
                  onClick={() => { if (movedRef.current) return; setSelected(r.id); setTab(0); }} style={{ cursor: "pointer" }}>
                  <rect x={-4.5} y={-8} width={9} height={11} fill="transparent" pointerEvents="all" />
                  {cur ? (
                    <g transform="translate(-2.7,-7.5) scale(0.26)">
                      <path d={MARKER_D} fill={MARKER} stroke={MARKER_EDGE} strokeWidth={1.4} strokeLinejoin="miter" />
                    </g>
                  ) : (
                    <g transform="translate(-2.6,-6.8) scale(0.22)"><path d={FLAG_D} fill={FLAG} /></g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="minimap-hud win98">
        <div className="hud-row">
          <button type="button" tabIndex={-1} className="hud-btn" aria-label="Llaves">
            <svg viewBox="0 0 24 24" fill="#222" aria-hidden="true"><path d="M11 8H13V9H23V14H21V18H19V14H17V16H15V14H13V16H11V18H3V16H1V8H3V6H11V8ZM5 14H9V10H5V14Z" /></svg>
          </button>
          <span className="hud-count">0</span>
        </div>
      </div>
      <div className="minimap-hud-right">
        <span className="hud-count">0/25</span>
        <svg className="hud-icon" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M18 4H20V6H22V18H20V20H18V22H6V20H4V18H2V6H4V4H6V2H18V4ZM11 18H13V16H11V18ZM11 15H13V13H15V11H11V15ZM15 11H17V8H15V11ZM7 10H9V8H7V10ZM9 8H15V6H9V8Z" /></svg>
      </div>
      {/* panel de sala: overlay en la MITAD INFERIOR (no refluye el mapa; el mapa se desplaza por debajo) */}
      {selRoom && (
        <div className="minimap-info win98">
          <div className="window minimap-panel">
            <div className="title-bar">
              <div className="title-bar-text">{selRoom.name ?? selRoom.id}</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" onClick={() => setSelected(null)}></button>
              </div>
            </div>
            <div className="window-body minimap-panel-body">
              <menu role="tablist">
                {["Descripción", "Puzzles", "Objetos"].map((t, i) => (
                  <li key={t} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}>
                    <a href="#" onClick={(e) => e.preventDefault()}>{t}</a>
                  </li>
                ))}
              </menu>
              <div className="window" role="tabpanel">
                <div className="window-body">
                  {tab === 0 && <p>{selRoom.name ?? selRoom.id}</p>}
                  {tab === 1 && <p>0/{selRoom.puzzles ?? 0} resueltos</p>}
                  {tab === 2 && <p>—</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Minimap;
