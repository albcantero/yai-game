import { forwardRef, useImperativeHandle, useState } from "react";
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
type Link = { from: string; to: string; pts: [number, number][] };
const LINKS: Link[] = [
  { from: "libreria", to: "hub-almacen", pts: [[26, 56], [26, 44.5], [41.8, 44.5]] }, // L limpia de 90° (antes un codo muy abierto que parecía diagonal)
  { from: "r5", to: "r4", pts: [[10.1, 35.0], [10.1, 21.5], [20.1, 17.9]] },
  // "Cruz" del almacén partida por estado: L sólida almacén↔r3 (ambas descubiertas) + ramal a r4
  // (bloqueada) que sale en dashed. Al descubrir r4, el ramal pasa a sólido solo y reforma la cruz.
  { from: "hub-almacen", to: "r3", pts: [[44, 44], [44, 15], [58, 15]] },
  { from: "r4", to: "r3", pts: [[24, 15], [44, 15]] },
  { from: "r6", to: "r7", pts: [[88.9, 21.9], [88.9, 31.1]] },
  { from: "r7", to: "r8", pts: [[86.1, 47.9], [86.1, 57.1]] },
  { from: "r2", to: "r6", pts: [[68.5, 48.9], [77.2, 24.4], [91.4, 15.8]] },
  { from: "r2", to: "r3", pts: [[62.8, 49.0], [62.6, 28.3]] },
  { from: "r1", to: "r2", pts: [[71.5, 64.2], [67.2, 56.2]] },
  { from: "r1", to: "hub-almacen", pts: [[58.3, 84.9], [44, 77], [44, 64]] }, // curva original (codo diagonal+vertical); final metido en el almacén (y=64) para que abra la puerta
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
const linkD = (lk: Link) => "M" + lk.pts.map((p) => p.join(",")).join("L");
const shown = (lk: Link) => !!byId[lk.from]?.discovered && !!byId[lk.to]?.discovered;
// coloca el pin (icono 24×24) centrado en la sala, escalado a su tamaño
// Insignia de cada sala: bandera azul (info, tocable en toda la sala) + contador de puzzles [?] 0/2 debajo.
// En la sala ACTUAL la marca central es el pin rojo en vez de la bandera (para no solaparse).
const FLAG = "#1971c2", FLAG_D = "M6 4h14v2h-2v2h-2v2h2v2h2v2H6v8H4V2h2v2Z";
const PUZZLE_D = "M9 22H7V20H9V22ZM13 22H11V20H13V22ZM17 22H15V20H17V22ZM6 20H4V18H6V20ZM20 20H18V18H20V20ZM13 18H11V16H13V18ZM4 17H2V15H4V17ZM22 17H20V15H22V17ZM15 13H13V15H11V11H15V13ZM4 13H2V11H4V13ZM22 13H20V11H22V13ZM17 11H15V8H17V11ZM9 10H7V8H9V10ZM4 9H2V7H4V9ZM22 9H20V7H22V9ZM15 8H9V6H15V8ZM6 6H4V4H6V6ZM20 6H18V4H20V6ZM9 4H7V2H9V4ZM13 4H11V2H13V4ZM17 4H15V2H17V4Z";
const BADGE_DARK = "#3a4038";

const Minimap = forwardRef<ScreenHandle, ScreenServices>(function Minimap(_props, ref) {
  const [selected, setSelected] = useState<string | null>(null); // sala con el panel de info abierto
  useImperativeHandle(ref, () => ({ handleKey: () => {}, isLoading: () => false, setPaused: () => {} }), []);
  return (
    <div className="minimap-screen">
      <svg className="minimap-svg" viewBox="-3 -3 106 106" preserveAspectRatio="xMidYMid meet">
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
        {/* 3. salas: TOCABLES (abren su panel de info). por descubrir = oscura con "?"; descubierta = suelo claro */}
        {ROOMS.map((r) => {
          if (!r.discovered) {
            return (
              <g key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: "pointer" }}>
                <rect className="minimap-fog-room" x={r.x} y={r.y} width={r.w} height={r.h} fill={FOG_FILL}
                  stroke={FOG_EDGE} strokeWidth={0.8} strokeDasharray="1.4 1.4" />
                <text x={cx(r)} y={cy(r)} fill={FOG_Q} fontSize={Math.min(r.w, r.h) * 0.5}
                  fontFamily="'Courier Pixel',monospace" textAnchor="middle" dominantBaseline="central" pointerEvents="none">?</text>
              </g>
            );
          }
          return <rect key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: "pointer" }}
            x={r.x} y={r.y} width={r.w} height={r.h} fill={FLOOR} stroke={EDGE} strokeWidth={1.2} />;
        })}
        {/* 4. RELLENO claro de los pasillos ENCIMA de las salas: abre la puerta en la unión */}
        {LINKS.map((lk, i) =>
          shown(lk) ? (
            <path key={"fil" + i} d={linkD(lk)} fill="none" stroke={FLOOR} strokeWidth={2.6}
              strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} pointerEvents="none" />
          ) : null,
        )}
        {/* 5. insignia por sala: marca centrada (pin rojo si es la actual, si no bandera azul) + contador de puzzles [?] 0/2 debajo */}
        {ROOMS.map((r) => {
          const cur = r.id === CURRENT;
          return (
            <g key={"badge" + r.id} transform={`translate(${cx(r).toFixed(2)},${cy(r).toFixed(2)})`} pointerEvents="none">
              {cur ? (
                <g transform="translate(-2.7,-7.5) scale(0.26)">
                  <path d={MARKER_D} fill={MARKER} stroke={MARKER_EDGE} strokeWidth={1.4} strokeLinejoin="miter" />
                </g>
              ) : (
                <g transform="translate(-2.6,-6.8) scale(0.22)"><path d={FLAG_D} fill={FLAG} /></g>
              )}
              <g transform="translate(-4.6,0.4) scale(0.13)"><path d={PUZZLE_D} fill={BADGE_DARK} /></g>
              <text x={-0.9} y={2.1} fontSize={4} fill={BADGE_DARK}
                fontFamily="'Determination Sans','Courier New',monospace" dominantBaseline="central">0/2</text>
            </g>
          );
        })}
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
      {selected && (
        <div className="minimap-info win98">
          <div className="window">
            <div className="title-bar">
              <div className="title-bar-text">Información</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" onClick={() => setSelected(null)}></button>
              </div>
            </div>
            <div className="window-body">
              <p>{selected}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Minimap;
