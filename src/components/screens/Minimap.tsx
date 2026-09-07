import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// Minimapa del edificio, DATA-DRIVEN: las salas y las conexiones son datos, y esta MISMA estructura es
// la que el motor del juego leerá para la topología (qué sala conecta con cuál = grafo del backtracking).
// Coordenadas en un viewBox 0..100, calcadas del plano PNG (pendiente de afinar a mano con Alberto).
type Room = { id: string; x: number; y: number; w: number; h: number; discovered: boolean };
const ROOMS: Room[] = [
  { id: "r1", x: 37.8, y: 6.4, w: 28.3, h: 32.6, discovered: true },
  { id: "r3", x: 19.0, y: 6.3, w: 11.7, h: 20.1, discovered: false },
  { id: "r2", x: 79.9, y: 6.3, w: 15.0, h: 17.0, discovered: false },
  { id: "r4", x: 5.3, y: 31.1, w: 13.0, h: 15.0, discovered: false },
  { id: "r6", x: 80.9, y: 29.4, w: 13.0, h: 19.0, discovered: false },
  { id: "vthin", x: 26.0, y: 45.7, w: 8.0, h: 20.2, discovered: true },
  { id: "hub", x: 42.0, y: 45.7, w: 33.0, h: 12.2, discovered: true },
  { id: "big", x: 39.0, y: 63.0, w: 36.0, h: 29.0, discovered: true },
  { id: "r8", x: 81.3, y: 54.7, w: 15.0, h: 30.0, discovered: false },
  { id: "r9", x: 10.0, y: 69.0, w: 13.0, h: 17.0, discovered: false },
];
// Cada conexión guarda su ruta (pts, con esquinas) para pintar el corredor tal cual, y el par de salas
// que une (from/to) para la lógica de niebla. Ruta calcada del SVG de Affinity.
const LINKS: { from: string; to: string; pts: [number, number][] }[] = [
  { from: "r9", to: "vthin", pts: [[16.0, 68.0], [15.9, 58.5], [26.0, 54.9]] },
  { from: "r4", to: "r3", pts: [[10.1, 31.1], [10.1, 21.5], [20.1, 17.9]] },
  { from: "r3", to: "r1", pts: [[30.5, 15.7], [39.6, 15.6]] },
  { from: "r2", to: "r6", pts: [[88.9, 21.9], [88.9, 31.1]] },
  { from: "r6", to: "r8", pts: [[86.1, 48.0], [86.1, 57.1]] },
  { from: "hub", to: "r6", pts: [[73, 49], [81, 49], [81, 40]] }, // corregido a r6 (tu path acababa en r2); L provisional, retócala en Affinity si quieres otra ruta
  { from: "hub", to: "r1", pts: [[52.6, 47.9], [58.8, 39.0]] },
  { from: "big", to: "hub", pts: [[71.5, 64.2], [67.2, 56.2]] },
  { from: "big", to: "vthin", pts: [[39.0, 86.0], [30.0, 76.3], [30.0, 65.8]] },
];
const CURRENT = "hub"; // sala donde está el grupo ahora (demo)

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const cx = (r: Room) => r.x + r.w / 2;
const cy = (r: Room) => r.y + r.h / 2;

const Minimap = forwardRef<ScreenHandle, ScreenServices>(function Minimap(_props, ref) {
  useImperativeHandle(ref, () => ({ handleKey: () => {}, isLoading: () => false, setPaused: () => {} }), []);
  return (
    <div className="minimap-screen">
      <svg className="minimap-svg" viewBox="-2 -2 104 104" preserveAspectRatio="xMidYMid meet">
        {/* corredores: se pintan con sus ESQUINAS (polilínea), en gris si ambas salas están descubiertas */}
        {LINKS.map((lk, i) => {
          const ra = byId[lk.from], rb = byId[lk.to];
          if (!ra || !rb) return null;
          const shown = ra.discovered && rb.discovered;
          return (
            <polyline key={i} points={lk.pts.map((p) => p.join(",")).join(" ")}
              fill="none" stroke={shown ? "#8a938a" : "#26302a"} strokeWidth={2.4}
              strokeLinecap="round" strokeLinejoin="round" />
          );
        })}
        {/* salas: descubierta = clara; no descubierta = oscura con "?"; actual = resaltada + punto del grupo */}
        {ROOMS.map((r) => {
          const cur = r.id === CURRENT;
          return (
            <g key={r.id}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h}
                fill={r.discovered ? (cur ? "#dff4e6" : "#d2d8d2") : "#161d18"}
                stroke={cur ? "#37f07d" : r.discovered ? "#8a938a" : "#343e36"}
                strokeWidth={cur ? 2 : 1.4} shapeRendering="crispEdges" />
              {!r.discovered && (
                <text x={cx(r)} y={cy(r)} fill="#4c5c50" fontSize="9" fontFamily="'Courier Pixel',monospace"
                  textAnchor="middle" dominantBaseline="central">?</text>
              )}
              {cur && <circle cx={cx(r)} cy={cy(r)} r={2.8} fill="#37f07d" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

export default Minimap;
