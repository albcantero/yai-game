import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import RoomPanel from "./RoomPanel";

// Minimapa del edificio, DATA-DRIVEN: las salas y las conexiones son datos, y esta MISMA estructura es
// la que el motor del juego leerá para la topología (qué sala conecta con cuál = grafo del backtracking).
// Coordenadas en un viewBox 0..100, calcadas del plano PNG (pendiente de afinar a mano con Alberto).
// name = nombre amable (barra de título del panel); puzzles = nº de puzzles de la sala (contador del panel).
type Room = { id: string; x: number; y: number; w: number; h: number; discovered: boolean; num?: number; name?: string; puzzles?: number; description?: string };
// Estado inicial del juego: TODO en niebla menos el Almacén (sala de inicio). Se irá descubriendo al jugar.
const ROOMS: Room[] = [
  { id: "r3", x: 52.4, y: 6.4, w: 20.0, h: 23.1, discovered: false, num: 5 },
  { id: "r4", x: 19.0, y: 6.3, w: 11.7, h: 20.1, discovered: false, num: 3 },
  { id: "r6", x: 79.9, y: 6.3, w: 15.0, h: 17.0, discovered: false, num: 8 },
  { id: "r5", x: 5.3, y: 31.1, w: 13.0, h: 15.0, discovered: false, num: 4 },
  { id: "r7", x: 80.9, y: 29.4, w: 13.0, h: 19.0, discovered: false, num: 9 },
  { id: "hub-almacen", x: 39.9, y: 41.6, w: 13.0, h: 26.2, discovered: true, num: 2, name: "Almacén", puzzles: 1 }, // sala de inicio (nº 2); la ÚNICA despejada
  { id: "r2", x: 56.1, y: 45.7, w: 18.9, h: 12.2, discovered: false, num: 6, puzzles: 3 }, // sala central: 3 puzzles, 2 salidas (r6/r3)
  { id: "r1", x: 57.7, y: 63.0, w: 19.8, h: 25.5, discovered: false, num: 7, name: "Sala de Máquinas", puzzles: 2 },
  { id: "r8", x: 81.3, y: 54.7, w: 15.0, h: 21.9, discovered: false, num: 10 },
  { id: "libreria", x: 5.0, y: 52.5, w: 29.6, h: 41.0, discovered: false, num: 1, name: "Librería", puzzles: 1 }, // = la TIENDA (pegada al Almacén), 3 llaves
];
// Cada conexión guarda su ruta (pts, con esquinas) para pintar el corredor tal cual, y el par de salas
// que une (from/to) para la lógica de niebla. Ruta calcada del SVG de Affinity.
// keys = llaves necesarias para cruzar esa puerta (alimentará los candados; 0/undefined = puerta libre).
// offFrom/offTo = offset de la marca POR LADO (sobreescribe MARK_ROOM_OFFSET): offFrom cuando estás en
// `from`, offTo cuando estás en `to`. Así puedes afinar cada flecha por separado (-2, -1, 0, lo que sea).
// reveals = nodos EXTRA que se descubren al desbloquear esta puerta (además del destino). Ej.: abrir
// Almacén→Intersección abre también R3 (la intersección es de paso: "Almacén→R3 directo").
type Link = { from: string; to: string; pts: [number, number][]; keys?: number; offFrom?: number; offTo?: number; reveals?: string[] };
const LINKS: Link[] = [
  { from: "libreria", to: "hub-almacen", pts: [[26, 56], [26, 44.5], [41.8, 44.5]], keys: 3, offFrom: 1, offTo: 6 }, // puerta a la Tienda (Librería): 3 llaves. Librería→Almacén: +1; Almacén→Librería: +6
  { from: "r5", to: "r4", pts: [[10.1, 35.0], [10.1, 21.5], [20.1, 17.9]], offFrom: 1, offTo: 6 }, // R5→R4: +1, R4→R5: +6
  // CRUZ del norte: un JUNCTION (posición) en (44,15) une Almacén (abajo), r3 (derecha) y r4 (izquierda).
  // Tres tramos que salen del MISMO punto; estar en el junction da tres flechas. El dibujo es idéntico a la
  // cruz de antes (vertical 44,44→44,15 + horizontal 24,15↔58,15); solo cambia la topología.
  { from: "hub-almacen", to: "cross-north", pts: [[44, 44], [44, 15]], keys: 1, offFrom: 6, offTo: 2, reveals: ["r3"] }, // camino 2: 1 llave. offsets +6/+2. Al abrir descubre también R3 (Almacén→R3 directo)
  { from: "cross-north", to: "r3", pts: [[44, 15], [58, 15]], offFrom: 2, offTo: 5 }, // Intersección→R3: +2; R3→Intersección: +5
  { from: "cross-north", to: "r4", pts: [[44, 15], [24, 15]], offFrom: 2, offTo: 3 }, // Intersección→R4: +2; R4→Intersección: +3
  { from: "r6", to: "r7", pts: [[88.9, 21.9], [88.9, 31.1]], offFrom: 3, offTo: 3 }, // R6→R7: +3; R7→R6: +3
  { from: "r7", to: "r8", pts: [[86.1, 47.9], [86.1, 57.1]], offFrom: 3, offTo: 3 }, // R7→R8: +3; R8→R7: +3
  { from: "r2", to: "r6", pts: [[68.5, 48.9], [77.2, 24.4], [91.4, 15.8]], keys: 1, offFrom: 6, offTo: 0 }, // R2→R6: +6; R6→R2: 0
  { from: "r2", to: "r3", pts: [[62.8, 49.0], [62.6, 28.3]], keys: 1, offFrom: 5, offTo: 5 }, // R2→R3: +5; R3→R2: +5
  { from: "r1", to: "r2", pts: [[74.0, 64.2], [67.2, 56.2]], offFrom: 4, offTo: 3 }, // Sala de Máquinas→R2: +4; R2→S.Máquinas: +3
  { from: "r1", to: "hub-almacen", pts: [[60.8, 84.9], [44, 77], [44, 64]], keys: 1, offFrom: 2, offTo: 6 }, // Sala de Máquinas→Almacén: +2; Almacén→S.Máquinas: +6
];
const START_ROOM = "hub-almacen"; // sala donde EMPIEZA el grupo: el almacén (sala 1). La actual es estado (te mueves con las flechas)

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const cx = (r: Room) => r.x + r.w / 2;
const cy = (r: Room) => r.y + r.h / 2;

// Junctions: puntos-POSICIÓN donde se cruzan varios pasillos. NO son salas (sin rect, sin bandera, sin
// panel): solo un sitio donde estar. Estar en un junction = flechas hacia cada sala que conecta. Ej.: la
// CRUZ del norte, un punto en (44,15) que une Almacén (abajo), r3 (derecha) y r4 (izquierda).
const JUNCTIONS = [{ id: "cross-north", x: 44, y: 15, discovered: false }]; // cruz N: en niebla como todo lo que no es el Almacén
// Nodo unificado (sala o junction): centro + estado de niebla. marksFor / shown / el pin usan ESTO, así el
// grafo mezcla salas y junctions sin casos especiales.
const NODE: Record<string, { x: number; y: number; discovered: boolean }> = {
  ...Object.fromEntries(ROOMS.map((r) => [r.id, { x: cx(r), y: cy(r), discovered: r.discovered }])),
  ...Object.fromEntries(JUNCTIONS.map((j) => [j.id, { x: j.x, y: j.y, discovered: j.discovered }])),
};

// Paleta del mapa: suelo claro con borde oscuro; niebla oscura con "?"; pin rojo = grupo
const EDGE = "#5f685f", FLOOR = "#cfd6cf";
const FOG_FILL = "#141a16", FOG_EDGE = "#333b34", FOG_Q = "#5a675e";
const MARKER = "#e03131", MARKER_EDGE = "#000"; // "estáis aquí": pin de ubicación rojo con borde negro
const FLAG = "#3a4038", FLAG_ACTIVE = "#00008a"; // bandera: gris normal / navy = sala abierta (activa)
const linkD = (lk: Link) => "M" + lk.pts.map((p) => p.join(",")).join("L");
const shown = (lk: Link, disc: Set<string>) => disc.has(lk.from) && disc.has(lk.to); // pasillo sólido si sus dos extremos están descubiertos (estado en vivo)

// Iconos de la insignia como {d, bb=[minX,minY,maxX,maxY]}. La colocación (escala + centrado) se calcula
// SOLA desde el bbox: cambiar el icono o su tamaño NO obliga a re-tunear offsets a mano.
// d2 = segundo subpath OPCIONAL. Los iconos con dos trazos (las flechas) se pintan como DOS <path>
// separados, igual que en el SVG original: si se concatenan en un solo `d`, la regla de relleno abre un
// agujero donde el asta y el triángulo se solapan (el "hueco negro" del medio).
type Icon = { d: string; d2?: string; bb: [number, number, number, number] };
const FLAG_ICON: Icon = { d: "M6 4h14v2h-2v2h-2v2h2v2h2v2H6v8H4V2h2v2Z", bb: [4, 2, 20, 22] };
const PIN_ICON: Icon = { d: "M20 12V16H18V18H16V20H14V22H10V20H8V18H6V16H4V12H20ZM14 4H16V8H14V10H10V8H8V4H10V2H14V4Z", bb: [4, 2, 20, 22] };
// transform (translate+scale) que dibuja `icon` con altura `h` y su CENTRO en (px,py); w = ancho dibujado.
const placeIcon = (icon: Icon, h: number, px: number, py: number) => {
  const [x0, y0, x1, y1] = icon.bb;
  const s = h / (y1 - y0);
  return { tf: `translate(${(px - s * (x0 + x1) / 2).toFixed(3)} ${(py - s * (y0 + y1) / 2).toFixed(3)}) scale(${s.toFixed(4)})`, w: s * (x1 - x0) };
};
const FLAG_H = 4.4, PIN_H = 5.2, BADGE_GAP = 0.6; // alturas (unidades de viewBox) + hueco pin↔bandera (~2px)
const PIN_W = placeIcon(PIN_ICON, PIN_H, 0, 0).w, FLAG_W = placeIcon(FLAG_ICON, FLAG_H, 0, 0).w;
const PAIR_W = PIN_W + BADGE_GAP + FLAG_W; // sala actual: pin (izq) + hueco + bandera (der), conjunto centrado en 0
const TF_FLAG_SOLO = placeIcon(FLAG_ICON, FLAG_H, 0, 0).tf;                       // salas normales: bandera sola centrada
const TF_PIN_PAIR = placeIcon(PIN_ICON, PIN_H, -PAIR_W / 2 + PIN_W / 2, 0).tf;    // pin a la izquierda del par
const TF_FLAG_PAIR = placeIcon(FLAG_ICON, FLAG_H, PAIR_W / 2 - FLAG_W / 2, 0).tf; // bandera a la derecha del par

// Flechas de dirección (izq/arriba/der/abajo). Arriba/abajo = las mismas de los botones del mentón.
// Flecha base: apunta a la DERECHA (+x, 0°). Se ROTA al ángulo del pasillo, así respeta rectas y diagonales.
const ARROW: Icon = { d: "M4 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-6V9h2v2z", d2: "M14 15V7h2v8zm-2 2V5h2v12z", bb: [0, 0, 24, 24] };
const LOCK_ICON: Icon = { d: "M17 8h4v14H3V8h4V2h10v6Zm-8 7h2v2h2v-2h2v-2H9v2Zm0-7h6V4H9v4Z", bb: [0, 0, 24, 24] }; // candado (mismo que la Terminal)
const ARROW_H = 6, ARROW_D = 5.5; // alto de la marca (viewBox) + distancia hacia fuera del punto (junctions)
const MARK_ROOM_OFFSET = -1; // salas: offset desde la PUERTA (negativo = hacia dentro): marca cerca de la sala, antes de cualquier codo del pasillo
const MARK_BORDER = 2.9; // grosor del borde negro de las marcas: como es "por fuera" (blanco lleno encima), va al doble del trazo del pin (1.4 a caballo) para que la banda negra se vea igual de gruesa
// Marcas de movimiento de la sala ACTUAL (`current`), una por salida (cada LINK conectado). Se dibujan
// RESPECTO a la sala en la que estás: cada marca nace en la salida de `current` y apunta a la vecina, así
// que se invierte sola al cambiar de sala. REGLA AUTOMÁTICA (por niebla, sin llaves): vecina en niebla
// ("?") = CANDADO; vecina despejada (con bandera) = FLECHA, siempre. `dest` = a dónde te mueve la flecha.
// Punto donde el rayo (end→dir) sale del rect = la PUERTA real. Normaliza la posición de la marca aunque el
// extremo del pasillo entre profundo en la sala (si no, la flecha quedaba "hacia atrás", pegada a la bandera).
function rectExit(r: Room, ex: number, ey: number, dx: number, dy: number) {
  const tx = dx > 0 ? (r.x + r.w - ex) / dx : dx < 0 ? (r.x - ex) / dx : Infinity;
  const ty = dy > 0 ? (r.y + r.h - ey) / dy : dy < 0 ? (r.y - ey) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  return { x: ex + t * dx, y: ey + t * dy };
}
function marksFor(current: string, disc: Set<string>) {
  return LINKS.filter((lk) => lk.from === current || lk.to === current).map((lk) => {
    const atFrom = lk.from === current;
    const end = atFrom ? lk.pts[0] : lk.pts[lk.pts.length - 1];        // punto del pasillo en la posición actual
    const adj = atFrom ? lk.pts[1] : lk.pts[lk.pts.length - 2];        // siguiente punto hacia la vecina
    const dx = adj[0] - end[0], dy = adj[1] - end[1], len = Math.hypot(dx, dy) || 1;
    const dest = atFrom ? lk.to : lk.from;                             // vecina (destino del movimiento)
    const blocked = !disc.has(dest);                                  // vecina en niebla = candado; despejada = flecha
    const room = byId[current];                                       // sala actual (undefined si estás en un junction)
    const base = room ? rectExit(room, end[0], end[1], dx, dy) : { x: end[0], y: end[1] }; // puerta (borde) o el propio punto
    const perOff = atFrom ? lk.offFrom : lk.offTo;                    // offset de ESTA flecha (según el lado)
    const off = room ? (perOff ?? MARK_ROOM_OFFSET) : ARROW_D + (perOff ?? 0); // sala: desde la puerta; junction: desde el punto hacia fuera
    return {
      key: lk.from + "-" + lk.to, dest,
      x: base.x + (dx / len) * off,
      y: base.y + (dy / len) * off,
      icon: blocked ? LOCK_ICON : ARROW,
      angle: blocked ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI, // rota la flecha al ángulo del pasillo (respeta diagonales); el candado no rota
      blocked,
      keys: lk.keys ?? 1, // llaves para cruzar esta puerta (popup del candado); por defecto 1
      reveals: lk.reveals ?? [], // nodos extra que abre esta puerta al desbloquearla
      ax: dx / len, ay: dy / len, // dirección unitaria (para el floating de la flecha)
    };
  });
}
type Mark = ReturnType<typeof marksFor>[number];
const INITIAL_DISCOVERED = Object.keys(NODE).filter((id) => NODE[id].discovered); // nodos despejados al empezar (solo el Almacén)
const TOTAL_PUZZLES = ROOMS.reduce((s, r) => s + (r.puzzles ?? 0), 0); // total de puzzles del juego (contador del HUD)
const START_KEYS = 0; // llaves iniciales del grupo: 0. Se ganan resolviendo puzzles (1 puzzle = 1 llave)

// ---------- Cámara del mapa (pan/zoom) ----------
// El contenido va dentro de un <g> con transform="translate(x y) scale(k)" en unidades de viewBox
// (origen 0,0, sin ambigüedad). Un punto de sala P se ve en viewBox en (x + k·P). Los gestos actualizan
// {x,y,k} al instante; abrir el panel recoloca con un tween (mover, NUNCA zoom: k no cambia).
type View = { x: number; y: number; k: number };
// Vista inicial: zoom 1.5 centrado (ancla en el centro del viewBox 50,50 para que no se descuadre al escalar).
const FIT_K = 1.1;
const FIT: View = { x: 50 - FIT_K * 50, y: 50 - FIT_K * 50, k: FIT_K };
const K_MIN = 0.6, K_MAX = 4;
const ZOOM_OPEN = 1.5; // mini-zoom al abrir una bandera (factor sobre el zoom previo)
const clampK = (k: number) => Math.max(K_MIN, Math.min(K_MAX, k));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const s = 1.5; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }; // rebote suave (overshoot hacia dentro)
// caja del contenido (bbox de las salas) en coords de viewBox: para el guard de "no perder el mapa offscreen"
const BB = ROOMS.reduce(
  (b, r) => ({ minX: Math.min(b.minX, r.x), minY: Math.min(b.minY, r.y), maxX: Math.max(b.maxX, r.x + r.w), maxY: Math.max(b.maxY, r.y + r.h) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
);

const Minimap = forwardRef<ScreenHandle, ScreenServices>(function Minimap(_props, ref) {
  const [selected, setSelected] = useState<string | null>(null); // sala con el panel de info abierto
  const [tab, setTab] = useState(0); // pestaña activa del panel
  const [view, setView] = useState<View>(FIT); // transform de la cámara
  const [frozenH, setFrozenH] = useState<number | null>(null); // alto FIJO del mapa (pantalla sin teclado)
  const [current, setCurrent] = useState(START_ROOM); // sala en la que estás (te mueves tocando las flechas)
  const [locked, setLocked] = useState<Mark | null>(null); // candado con el popup de "camino bloqueado" abierto
  const [keys, setKeys] = useState(START_KEYS); // llaves del grupo
  const [discovered, setDiscovered] = useState<Set<string>>(() => new Set(INITIAL_DISCOVERED)); // nodos descubiertos (se amplía al desbloquear)
  const [solved, setSolved] = useState<Set<string>>(() => new Set()); // puzzles resueltos (id = "sala#índice"); cada uno da +1 llave
  useImperativeHandle(ref, () => ({ handleKey: () => {}, isLoading: () => false, setPaused: () => {} }), []);

  const rootRef = useRef<HTMLDivElement>(null); // .minimap-screen: viewport que recorta (encoge con el teclado)
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>(FIT); // espejo de view para los handlers de puntero (sin closures obsoletas)
  const beforeOpenRef = useRef<View>(FIT); // view previo a abrir el panel (para restaurar al cerrar)
  const rafRef = useRef<number | null>(null);
  const prevSelRef = useRef<string | null>(null); // sala anterior (para no pisar la vista previa al saltar sala→sala)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestRef = useRef<{ mode: "none" | "pan" | "pinch"; x: number; y: number; dist: number }>({ mode: "none", x: 0, y: 0, dist: 0 });
  const movedRef = useRef(false); // el gesto se movió = NO es un toque (no abre panel)
  const capturedRef = useRef(false); // ya se capturó el puntero de este arrastre

  const selRoom = selected ? byId[selected] : null;
  const marks = marksFor(current, discovered); // flechas/candados de la sala actual (se recalculan al moverte / descubrir)
  // resolver un puzzle: +1 llave (una sola vez por puzzle). id = "sala#índice".
  const solvePuzzle = (id: string) => {
    if (solved.has(id)) return;
    setSolved((s) => new Set(s).add(id));
    setKeys((k) => k + 1);
  };
  // desbloquear una puerta: gasta las llaves y descubre la sala vecina (candado → flecha)
  const unlock = (m: Mark) => {
    if (keys < m.keys) return;
    setKeys((k) => k - m.keys);
    setDiscovered((d) => { const n = new Set(d); n.add(m.dest); m.reveals.forEach((id) => n.add(id)); return n; }); // destino + extras (p.ej. R3)
    setLocked(null);
  };

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

  // tween suave del view (recolocar al abrir/cerrar el panel; rebote del guard). Los gestos NO usan esto.
  const animateTo = (target: View, ease: (t: number) => number = easeOut) => {
    stopRaf();
    const start = viewRef.current, t0 = performance.now(), dur = 380;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = ease(p);
      setV({ x: lerp(start.x, target.x, e), y: lerp(start.y, target.y, e), k: lerp(start.k, target.k, e) });
      rafRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // GUARD offscreen: view acotado para que el contenido cubra el viewport visible (si es mayor) o quede
  // centrado (si es menor). El viewport visible en coords de viewBox se saca de las esquinas reales (CTM),
  // así respeta el letterbox del aspect ratio. Se usa para rebotar al soltar (no durante el arrastre).
  const clampView = (v: View): View => {
    const svg = svgRef.current;
    if (!svg) return v;
    const r = svg.getBoundingClientRect();
    const a = toVB(r.left, r.top), b = toVB(r.right, r.bottom);
    const vx0 = Math.min(a.x, b.x), vx1 = Math.max(a.x, b.x);
    const vy0 = Math.min(a.y, b.y), vy1 = Math.max(a.y, b.y);
    const axis = (val: number, bbMin: number, bbMax: number, V0: number, V1: number) => {
      const c0 = v.k * bbMin, c1 = v.k * bbMax; // bordes del contenido sin el translate
      if (c1 - c0 >= V1 - V0) return Math.max(V1 - c1, Math.min(V0 - c0, val)); // mayor que el viewport: no dejar huecos (explorar esquinas)
      const cc = (c0 + c1) / 2; // centro del contenido: movimiento LIBRE, rebota solo si el centro se sale del viewport (pasarse de la mitad)
      return Math.max(V0 - cc, Math.min(V1 - cc, val));
    };
    return { x: axis(v.x, BB.minX, BB.maxX, vx0, vx1), y: axis(v.y, BB.minY, BB.maxY, vy0, vy1), k: v.k };
  };

  // view que deja la sala DADA en el centro del rectángulo superior libre (mitad de arriba), al zoom `k`.
  // Se calcula con la geometría real (CTM), no con números fijos: robusto al letterbox.
  const recenter = (room: Room, k: number): View | null => {
    const root = rootRef.current;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    const V = toVB(r.left + r.width * 0.5, r.top + r.height * 0.25); // centro de la mitad superior
    return { x: V.x - k * cx(room), y: V.y - k * cy(room), k };
  };

  // Abrir/saltar de sala: centrar el mapa en la sala tocada (al cambiar de sala el mapa se desplaza).
  // Primera apertura desde cerrado = mini-zoom (ZOOM_OPEN); sala→sala mantiene el zoom. Cerrar (X) = volver
  // a donde estaba (posición y zoom previos). La vista previa solo se guarda al abrir desde cerrado.
  useEffect(() => {
    const prev = prevSelRef.current;
    prevSelRef.current = selected;
    if (selected) {
      if (!prev) beforeOpenRef.current = viewRef.current;
      const room = byId[selected];
      const k = prev ? viewRef.current.k : clampK(viewRef.current.k * ZOOM_OPEN);
      const t = room ? recenter(room, k) : null;
      if (t) animateTo(t);
    } else if (prev && rootRef.current) {
      animateTo(beforeOpenRef.current);
    }
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
    // gesto terminado con el panel CERRADO: si se pasó de los bordes, rebota (spring) al viewport.
    // Con el panel abierto no acotamos (el encuadre de la sala en la mitad superior manda).
    if (pointersRef.current.size === 0 && !selected) {
      const v = viewRef.current, c = clampView(v);
      if (Math.abs(c.x - v.x) > 0.01 || Math.abs(c.y - v.y) > 0.01) animateTo(c, easeOutBack);
    }
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
              shown(lk, discovered) ? null : (
                <path key={"fog" + i} className="minimap-fog-link" d={linkD(lk)} fill="none"
                  stroke={FOG_EDGE} strokeWidth={0.8} strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none" />
              ),
            )}
            {/* 2. CONTORNO oscuro de los pasillos, DEBAJO de las salas (esquinas en pico) */}
            {LINKS.map((lk, i) =>
              shown(lk, discovered) ? (
                <path key={"out" + i} d={linkD(lk)} fill="none" stroke={EDGE} strokeWidth={4.6}
                  strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} pointerEvents="none" />
              ) : null,
            )}
            {/* 2b. parche de junction (contorno): tapa el hueco del pico donde se juntan varios pasillos
                (el linejoin no une entre <path> distintos). Un cuadrado del ancho del contorno. */}
            {JUNCTIONS.filter((j) => discovered.has(j.id)).map((j) => (
              <rect key={"jout" + j.id} x={j.x - 2.3} y={j.y - 2.3} width={4.6} height={4.6} fill={EDGE} pointerEvents="none" />
            ))}
            {/* 3. salas: NO tocables (el toque vive en la bandera). por descubrir = oscura con "?"; descubierta = suelo claro */}
            {ROOMS.map((r) => {
              if (!discovered.has(r.id)) {
                return (
                  <g key={r.id} pointerEvents="none">
                    <rect className="minimap-fog-room" x={r.x} y={r.y} width={r.w} height={r.h} fill={FOG_FILL}
                      stroke={FOG_EDGE} strokeWidth={0.8} strokeDasharray="1.4 1.4" />
                    <text x={cx(r)} y={cy(r)} fill={FOG_Q} fontSize={6}
                      fontFamily="'Courier Pixel',monospace" textAnchor="middle" dominantBaseline="central">?</text>
                  </g>
                );
              }
              return <rect key={r.id} pointerEvents="none"
                x={r.x} y={r.y} width={r.w} height={r.h} fill={FLOOR} stroke={EDGE} strokeWidth={1.2} />;
            })}
            {/* 4. RELLENO claro de los pasillos ENCIMA de las salas: abre la puerta en la unión */}
            {LINKS.map((lk, i) =>
              shown(lk, discovered) ? (
                <path key={"fil" + i} d={linkD(lk)} fill="none" stroke={FLOOR} strokeWidth={2.6}
                  strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} pointerEvents="none" />
              ) : null,
            )}
            {/* 4b. parche de junction (relleno): mismo cuadrado en color suelo, ENCIMA, para dejar la esquina lisa */}
            {JUNCTIONS.filter((j) => discovered.has(j.id)).map((j) => (
              <rect key={"jfil" + j.id} x={j.x - 1.3} y={j.y - 1.3} width={2.6} height={2.6} fill={FLOOR} pointerEvents="none" />
            ))}
            {/* 5. insignia por sala: la bandera gris centrada (wrapper tocable con margen). En la sala ACTUAL
                se inyecta además el pin rojo "estamos aquí" a la IZQUIERDA de la bandera, en el mismo wrapper.
                movedRef = si el gesto fue un arrastre/pinza, NO se abre panel. */}
            {ROOMS.map((r) => {
              if (!discovered.has(r.id)) return null; // sala en niebla: solo su "?" (pase 3), sin bandera ni toque
              const cur = r.id === current;
              return (
                <g key={"badge" + r.id} transform={`translate(${cx(r).toFixed(2)},${cy(r).toFixed(2)})`}
                  onClick={() => { if (movedRef.current) return; setSelected(r.id); setTab(0); }} style={{ cursor: "pointer" }}>
                  <rect x={-5} y={-5} width={10} height={10} fill="transparent" pointerEvents="all" />
                  {/* colocación por placeIcon (centrado calculado, sin offsets a mano). Sala actual: pin +
                      bandera centrados como conjunto; resto: bandera sola. Azul = sala abierta (activa). */}
                  {cur && (
                    <g transform={TF_PIN_PAIR}>
                      <path d={PIN_ICON.d} fill={MARKER} stroke={MARKER_EDGE} strokeWidth={1.4} strokeLinejoin="miter" />
                    </g>
                  )}
                  <g transform={cur ? TF_FLAG_PAIR : TF_FLAG_SOLO}>
                    <path d={FLAG_ICON.d} fill={r.id === selected ? FLAG_ACTIVE : FLAG} />
                  </g>
                </g>
              );
            })}
            {/* pin "estás aquí" cuando la posición actual es un JUNCTION (una sala lo pinta en su insignia) */}
            {!byId[current] && NODE[current] && (
              <g transform={placeIcon(PIN_ICON, PIN_H, NODE[current].x, NODE[current].y).tf} pointerEvents="none">
                <path d={PIN_ICON.d} fill={MARKER} stroke={MARKER_EDGE} strokeWidth={1.4} strokeLinejoin="miter" />
              </g>
            )}
            {/* 6. marcas de movimiento de la sala ACTUAL, en el pasillo a la salida: flecha si la salida es
                libre, CANDADO si está bloqueada (llave o niebla). Todo BLANCO. Las flechas "flotan" hacia su
                dirección (pixel); los candados no. Los iconos de dos trazos pintan d + d2 (evita el agujero). */}
            {marks.map((m) => (
              <g key={"mk" + m.key}
                onClick={() => { if (movedRef.current) return; if (m.blocked) setLocked(m); else setCurrent(m.dest); }}
                className={m.blocked ? undefined : "minimap-arrow-float"}
                style={m.blocked ? { cursor: "pointer" } : ({ "--ax": m.ax, "--ay": m.ay, cursor: "pointer" } as CSSProperties)}>
                <rect x={m.x - 5} y={m.y - 5} width={10} height={10} fill="transparent" pointerEvents="all" />
                <g transform={`rotate(${m.angle.toFixed(1)} ${m.x.toFixed(2)} ${m.y.toFixed(2)}) ${placeIcon(m.icon, ARROW_H, m.x, m.y).tf}`}>
                  {/* borde negro = capa negra (fill+stroke) DETRÁS, blanco encima: interior 100% blanco (sin
                      asta rellena de negro) y banda negra tan gruesa como el borde del pin. */}
                  <path d={m.icon.d} fill={MARKER_EDGE} stroke={MARKER_EDGE} strokeWidth={MARK_BORDER} strokeLinejoin="round" />
                  {m.icon.d2 && <path d={m.icon.d2} fill={MARKER_EDGE} stroke={MARKER_EDGE} strokeWidth={MARK_BORDER} strokeLinejoin="round" />}
                  <path d={m.icon.d} fill="#fff" />
                  {m.icon.d2 && <path d={m.icon.d2} fill="#fff" />}
                </g>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="minimap-hud win98">
        <div className="hud-row">
          <button type="button" tabIndex={-1} className="hud-btn" aria-label="Llaves">
            <svg viewBox="0 0 24 24" fill="#222" aria-hidden="true"><path d="M11 8H13V9H23V14H21V18H19V14H17V16H15V14H13V16H11V18H3V16H1V8H3V6H11V8ZM5 14H9V10H5V14Z" /></svg>
          </button>
          <span className="hud-count">{keys}</span>
        </div>
      </div>
      <div className="minimap-hud-right">
        <span className="hud-count">{solved.size}/{TOTAL_PUZZLES}</span>
        <svg className="hud-icon" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M18 4H20V6H22V18H20V20H18V22H6V20H4V18H2V6H4V4H6V2H18V4ZM11 18H13V16H11V18ZM11 15H13V13H15V11H11V15ZM15 11H17V8H15V11ZM7 10H9V8H7V10ZM9 8H15V6H9V8Z" /></svg>
      </div>
      {/* panel de sala: overlay en la MITAD INFERIOR (no refluye el mapa; el mapa se desplaza por debajo).
          Extraído a RoomPanel (idéntico para todas las salas); aquí solo se le pasan datos + estado. */}
      {selRoom && (
        <RoomPanel
          title={selRoom.name ?? selRoom.id}
          num={selRoom.num}
          roomId={selRoom.id}
          isCurrent={selected === current}
          puzzles={selRoom.puzzles ?? 0}
          description={selRoom.description}
          tab={tab}
          onTab={setTab}
          solved={solved}
          onSolve={solvePuzzle}
          onClose={() => setSelected(null)}
        />
      )}
      {/* popup del CANDADO: camino bloqueado + coste en llaves. Desbloquear DISABLED si no llegan las llaves. */}
      {locked && (
        <div className="confirm-overlay win98 minimap-lock" onClick={() => setLocked(null)}>
          <div className="window confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="title-bar">
              <img className="title-icon" src="/icons/key_padlock-1.png" alt="" />
              <div className="title-bar-text">Candado</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" onClick={() => setLocked(null)}></button>
              </div>
            </div>
            <div className="window-body">
              <div className="confirm-row">
                <img className="confirm-icon" src="/icons/key_padlock-0.png" alt="" />
                <p>El camino está bloqueado.</p>
              </div>
              <div className="confirm-buttons">
                <button type="button" disabled={keys < locked.keys} onClick={() => unlock(locked)}>Utilizar {locked.keys}<svg className="key-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 8H13V9H23V14H21V18H19V14H17V16H15V14H13V16H11V18H3V16H1V8H3V6H11V8ZM5 14H9V10H5V14Z" /></svg></button>
                <button type="button" onClick={() => setLocked(null)}>Salir</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Minimap;
