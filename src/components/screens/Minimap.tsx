import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// Minimapa del edificio, DATA-DRIVEN: las salas y las conexiones son datos, y esta MISMA estructura es
// la que el motor del juego leerá para la topología (qué sala conecta con cuál = grafo del backtracking).
// Coordenadas en un viewBox 0..100, calcadas del plano PNG (pendiente de afinar a mano con Alberto).
type Room = { id: string; x: number; y: number; w: number; h: number; discovered: boolean };
const ROOMS: Room[] = [
  { id: "r3", x: 52.4, y: 6.4, w: 20.0, h: 23.1, discovered: true },
  { id: "r4", x: 19.0, y: 6.3, w: 11.7, h: 20.1, discovered: false },
  { id: "r6", x: 79.9, y: 6.3, w: 15.0, h: 17.0, discovered: false },
  { id: "r5", x: 5.3, y: 31.1, w: 13.0, h: 15.0, discovered: false },
  { id: "r7", x: 80.9, y: 29.4, w: 13.0, h: 19.0, discovered: false },
  { id: "hub-almacen", x: 39.9, y: 41.6, w: 8.0, h: 26.2, discovered: true },
  { id: "r2", x: 56.1, y: 45.7, w: 18.9, h: 12.2, discovered: false },
  { id: "r1", x: 55.2, y: 63.0, w: 19.8, h: 25.5, discovered: true },
  { id: "r8", x: 81.3, y: 54.7, w: 15.0, h: 21.9, discovered: false },
  { id: "libreria", x: 5.0, y: 52.5, w: 29.6, h: 41.0, discovered: true },
];
// Cada conexión guarda su ruta (pts, con esquinas) para pintar el corredor tal cual, y el par de salas
// que une (from/to) para la lógica de niebla. Ruta calcada del SVG de Affinity.
type Link = { from: string; to: string; pts?: [number, number][]; subpaths?: [number, number][][] };
const LINKS: Link[] = [
  { from: "libreria", to: "hub-almacen", pts: [[26, 56], [26, 44.5], [41.8, 44.5]] }, // L limpia de 90° (antes un codo muy abierto que parecía diagonal)
  { from: "r5", to: "r4", pts: [[10.1, 31.1], [10.1, 21.5], [20.1, 17.9]] },
  // corredor en CRUZ r4·r3·hub-almacen, unificado en UN solo elemento (dos ramas en un mismo path)
  { from: "r3", to: "hub-almacen", subpaths: [[[30.0, 9.6], [52.4, 10.2]], [[44.0, 10.2], [43.0, 41.6]]] },
  { from: "r6", to: "r7", pts: [[88.9, 21.9], [88.9, 31.1]] },
  { from: "r7", to: "r8", pts: [[86.1, 47.9], [86.1, 57.1]] },
  { from: "r2", to: "r6", pts: [[68.5, 48.9], [77.2, 24.4], [91.4, 15.8]] },
  { from: "r2", to: "r3", pts: [[62.8, 45.3], [62.6, 28.3]] },
  { from: "r1", to: "r2", pts: [[71.5, 64.2], [67.2, 56.2]] },
  { from: "r1", to: "hub-almacen", pts: [[58.3, 84.9], [44.0, 77.0], [44.0, 68.4]] },
];
const CURRENT = "hub-almacen"; // sala donde empieza / está el grupo: el almacén (sala 1)

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const cx = (r: Room) => r.x + r.w / 2;
const cy = (r: Room) => r.y + r.h / 2;

// Paleta del mapa: suelo claro con borde oscuro; niebla oscura con "?"; estrella = grupo
const EDGE = "#5f685f", FLOOR = "#cfd6cf", STAR = "#f2c94c";
const FOG_FILL = "#141a16", FOG_EDGE = "#333b34", FOG_Q = "#5a675e";
const linkD = (lk: Link) => (lk.subpaths ?? [lk.pts!]).map((sp) => "M" + sp.map((p) => p.join(",")).join("L")).join(" ");
const shown = (lk: Link) => !!byId[lk.from]?.discovered && !!byId[lk.to]?.discovered;
// estrella de 5 puntas centrada en (cxv,cyv), radio exterior R (interior 0.42·R)
const starPoints = (cxv: number, cyv: number, R: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180, rad = i % 2 ? R * 0.42 : R;
    return `${(cxv + rad * Math.cos(a)).toFixed(2)},${(cyv + rad * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

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
        {/* 2. pasillos descubiertos = suelo continuo: contorno oscuro + relleno claro, esquinas en PICO (miter) */}
        {LINKS.map((lk, i) =>
          shown(lk) ? (
            <path key={"out" + i} d={linkD(lk)} fill="none" stroke={EDGE} strokeWidth={4.6}
              strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
          ) : null,
        )}
        {LINKS.map((lk, i) =>
          shown(lk) ? (
            <path key={"fil" + i} d={linkD(lk)} fill="none" stroke={FLOOR} strokeWidth={2.6}
              strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
          ) : null,
        )}
        {/* 3. salas: por descubrir = oscura punteada con "?"; descubierta = suelo claro; actual = verde + punto */}
        {ROOMS.map((r) => {
          const cur = r.id === CURRENT;
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
          return (
            <g key={r.id}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={FLOOR} stroke={EDGE} strokeWidth={1.2} />
              {cur && <polygon points={starPoints(cx(r), cy(r), Math.min(3.6, Math.min(r.w, r.h) * 0.42))} fill={STAR} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

export default Minimap;
