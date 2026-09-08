import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// Minimapa del edificio, DATA-DRIVEN: las salas y las conexiones son datos, y esta MISMA estructura es
// la que el motor del juego leerá para la topología (qué sala conecta con cuál = grafo del backtracking).
// Coordenadas en un viewBox 0..100, calcadas del plano PNG (pendiente de afinar a mano con Alberto).
type Room = { id: string; x: number; y: number; w: number; h: number; discovered: boolean };
// NOTA TEMP (desarrollo): todas las salas están discovered:true = mapa ENTERO desbloqueado.
// Revertir (poner el fog real) cuando cableemos el estado del juego.
const ROOMS: Room[] = [
  { id: "r3", x: 52.4, y: 6.4, w: 20.0, h: 23.1, discovered: true },
  { id: "r4", x: 19.0, y: 6.3, w: 11.7, h: 20.1, discovered: true },
  { id: "r6", x: 79.9, y: 6.3, w: 15.0, h: 17.0, discovered: true },
  { id: "r5", x: 5.3, y: 31.1, w: 13.0, h: 15.0, discovered: true },
  { id: "r7", x: 80.9, y: 29.4, w: 13.0, h: 19.0, discovered: true },
  { id: "hub-almacen", x: 39.9, y: 41.6, w: 8.0, h: 26.2, discovered: true },
  { id: "r2", x: 56.1, y: 45.7, w: 18.9, h: 12.2, discovered: true },
  { id: "r1", x: 55.2, y: 63.0, w: 19.8, h: 25.5, discovered: true },
  { id: "r8", x: 81.3, y: 54.7, w: 15.0, h: 21.9, discovered: true },
  { id: "libreria", x: 5.0, y: 52.5, w: 29.6, h: 41.0, discovered: true },
];
// Cada conexión guarda su ruta (pts, con esquinas) para pintar el corredor tal cual, y el par de salas
// que une (from/to) para la lógica de niebla. Ruta calcada del SVG de Affinity.
type Link = { from: string; to: string; pts?: [number, number][]; subpaths?: [number, number][][] };
const LINKS: Link[] = [
  { from: "libreria", to: "hub-almacen", pts: [[26, 56], [26, 44.5], [41.8, 44.5]] }, // L limpia de 90° (antes un codo muy abierto que parecía diagonal)
  { from: "r5", to: "r4", pts: [[10.1, 35.0], [10.1, 21.5], [20.1, 17.9]] },
  // corredor en CRUZ r4·r3·hub-almacen, unificado en UN solo elemento (dos ramas en un mismo path)
  // "Cruz" del almacén partida por estado: L sólida almacén↔r3 (ambas descubiertas) + ramal a r4
  // (bloqueada) que sale en dashed. Al descubrir r4, el ramal pasa a sólido solo y reforma la cruz.
  { from: "hub-almacen", to: "r3", pts: [[44, 44], [44, 15], [58, 15]] },
  { from: "r4", to: "r3", pts: [[24, 15], [44, 15]] },
  { from: "r6", to: "r7", pts: [[88.9, 21.9], [88.9, 31.1]] },
  { from: "r7", to: "r8", pts: [[86.1, 47.9], [86.1, 57.1]] },
  { from: "r2", to: "r6", pts: [[68.5, 48.9], [77.2, 24.4], [91.4, 15.8]] },
  { from: "r2", to: "r3", pts: [[62.8, 49.0], [62.6, 28.3]] },
  { from: "r1", to: "r2", pts: [[71.5, 64.2], [67.2, 56.2]] },
  { from: "r1", to: "hub-almacen", pts: [[57, 72], [45, 64]] }, // diagonal almacén ↔ r1 (entra poco en r1 para no cortar su borde)
];
const CURRENT = "hub-almacen"; // sala donde empieza / está el grupo: el almacén (sala 1)

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const cx = (r: Room) => r.x + r.w / 2;
const cy = (r: Room) => r.y + r.h / 2;

// Paleta del mapa: suelo claro con borde oscuro; niebla oscura con "?"; pin rojo = grupo
const EDGE = "#5f685f", FLOOR = "#cfd6cf";
const FOG_FILL = "#141a16", FOG_EDGE = "#333b34", FOG_Q = "#5a675e";
const MARKER = "#e03131", MARKER_EDGE = "#000"; // "estáis aquí": pin de ubicación rojo con borde negro
const MARKER_D = "M20 12V16H18V18H16V20H14V22H10V20H8V18H6V16H4V12H20ZM14 4H16V8H14V10H10V8H8V4H10V2H14V4Z";
const linkD = (lk: Link) => (lk.subpaths ?? [lk.pts!]).map((sp) => "M" + sp.map((p) => p.join(",")).join("L")).join(" ");
const shown = (lk: Link) => !!byId[lk.from]?.discovered && !!byId[lk.to]?.discovered;
// coloca el pin (icono 24×24) centrado en la sala, escalado a su tamaño
const markerTf = (r: Room) => {
  const s = Math.min(9.5, Math.min(r.w, r.h)) / 24;
  return `translate(${(cx(r) - 12 * s).toFixed(2)},${(cy(r) - 12 * s).toFixed(2)}) scale(${s.toFixed(3)})`;
};

const Minimap = forwardRef<ScreenHandle, ScreenServices>(function Minimap(_props, ref) {
  useImperativeHandle(ref, () => ({ handleKey: () => {}, isLoading: () => false, setPaused: () => {} }), []);
  return (
    <div className="minimap-screen">
      <svg className="minimap-svg" viewBox="-3 -3 106 106" preserveAspectRatio="xMidYMid meet">
        {/* 1. corredores por descubrir: trazo tenue punteado, debajo */}
        {LINKS.map((lk, i) =>
          shown(lk) ? null : (
            <path key={"fog" + i} className="minimap-fog-link" d={linkD(lk)} fill="none"
              stroke={FOG_EDGE} strokeWidth={0.8} strokeLinecap="butt" strokeLinejoin="miter" />
          ),
        )}
        {/* 2. CONTORNO oscuro de los pasillos descubiertos, DEBAJO de las salas (esquinas en pico) */}
        {LINKS.map((lk, i) =>
          shown(lk) ? (
            <path key={"out" + i} d={linkD(lk)} fill="none" stroke={EDGE} strokeWidth={4.6}
              strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
          ) : null,
        )}
        {/* 3. salas: por descubrir = oscura punteada con "?"; descubierta = suelo claro con borde */}
        {ROOMS.map((r) => {
          if (!r.discovered) {
            return (
              <g key={r.id}>
                <rect className="minimap-fog-room" x={r.x} y={r.y} width={r.w} height={r.h} fill={FOG_FILL}
                  stroke={FOG_EDGE} strokeWidth={0.8} strokeDasharray="1.4 1.4" />
                <text x={cx(r)} y={cy(r)} fill={FOG_Q} fontSize={Math.min(r.w, r.h) * 0.5}
                  fontFamily="'Courier Pixel',monospace" textAnchor="middle" dominantBaseline="central">?</text>
              </g>
            );
          }
          return <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={FLOOR} stroke={EDGE} strokeWidth={1.2} />;
        })}
        {/* 4. RELLENO claro de los pasillos ENCIMA de las salas: tapa el borde en la unión = todo unido, sin muro */}
        {LINKS.map((lk, i) =>
          shown(lk) ? (
            <path key={"fil" + i} d={linkD(lk)} fill="none" stroke={FLOOR} strokeWidth={2.6}
              strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
          ) : null,
        )}
        {/* 5. pin de la sala actual (estáis aquí), arriba del todo */}
        {byId[CURRENT]?.discovered && (
          <g transform={markerTf(byId[CURRENT])}>
            <path d={MARKER_D} fill={MARKER} stroke={MARKER_EDGE} strokeWidth={1.4} strokeLinejoin="miter" />
          </g>
        )}
      </svg>
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
    </div>
  );
});

export default Minimap;
