import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// Minimapa del edificio, DATA-DRIVEN: las salas y las conexiones son datos, y esta MISMA estructura es
// la que el motor del juego leerá para la topología (qué sala conecta con cuál = grafo del backtracking).
// Coordenadas en un viewBox 0..100, calcadas del plano PNG (pendiente de afinar a mano con Alberto).
type Room = { id: string; x: number; y: number; w: number; h: number; discovered: boolean };
const ROOMS: Room[] = [
  { id: "r1", x: 41, y: 4, w: 20, h: 36, discovered: true },
  { id: "r3", x: 21, y: 12, w: 9, h: 17, discovered: true },
  { id: "r2", x: 71, y: 8, w: 15, h: 17, discovered: false },
  { id: "r4", x: 8, y: 27, w: 13, h: 15, discovered: false },
  { id: "r5", x: 21, y: 31, w: 10, h: 9, discovered: true },
  { id: "r6", x: 71, y: 31, w: 13, h: 19, discovered: false },
  { id: "vthin", x: 29, y: 41, w: 8, h: 31, discovered: true },
  { id: "hub", x: 40, y: 44, w: 31, h: 16, discovered: true },
  { id: "big", x: 39, y: 63, w: 36, h: 29, discovered: false },
  { id: "r8", x: 79, y: 56, w: 15, h: 30, discovered: false },
  { id: "r9", x: 10, y: 69, w: 13, h: 17, discovered: false },
];
const LINKS: [string, string][] = [
  ["r3", "r5"], ["r5", "r4"], ["r5", "r1"], ["r5", "vthin"], ["r5", "hub"],
  ["r1", "hub"], ["hub", "r6"], ["r6", "r2"], ["hub", "big"], ["hub", "vthin"],
  ["vthin", "r9"], ["big", "r9"], ["big", "r8"], ["r6", "r8"],
];
const CURRENT = "hub"; // sala donde está el grupo ahora

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
