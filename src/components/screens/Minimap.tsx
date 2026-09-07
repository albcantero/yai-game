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
const LINKS: [string, string][] = [
  ["r9", "vthin"], ["r4", "r3"], ["r3", "r1"], ["r2", "r6"], ["r6", "r8"],
  ["hub", "r2"], ["hub", "r1"], ["big", "hub"], ["big", "vthin"],
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
        {/* conexiones: en gris si ambas salas están descubiertas, apagadas si no */}
        {LINKS.map(([a, b], i) => {
          const ra = byId[a], rb = byId[b];
          if (!ra || !rb) return null;
          const shown = ra.discovered && rb.discovered;
          return (
            <line key={i} x1={cx(ra)} y1={cy(ra)} x2={cx(rb)} y2={cy(rb)}
              stroke={shown ? "#8a938a" : "#26302a"} strokeWidth={2.4} shapeRendering="crispEdges" />
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
