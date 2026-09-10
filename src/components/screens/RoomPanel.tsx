// Panel de info de una sala (overlay Win98 con pestañas). IDÉNTICO para todas las banderas: recibe por
// props el título, el nº de puzzles y el estado del juego (puzzles resueltos + callbacks). Así el Minimap
// (o cualquier pantalla) lo reutiliza sin duplicar markup. Los estilos viven en styles/minimap.css.
import { useEffect, useState } from "react";
import Win98Select from "./Win98Select";

const TABS = ["Información", "Llaves"];
// Icono GRANDE del hueco derecho, por pestaña. Cambia al cambiar de tab.
const TAB_BIG: (string | null)[] = ["/icons/help_question_mark-0.png", "/icons/keys-5.png"];
// El desplegable de la pestaña "Llaves" muestra tantas opciones como puzzles tenga la sala; con 1 sola opción
// el <select> sale desactivado. Placeholder "Puzzle N" con numeración GLOBAL (offset por props: puzzleBase).

export type RoomPanelProps = {
  title: string; // nombre de la sala (campo "Nombre:" de la pestaña Información)
  num?: number; // número de habitación (barra de título: "Habitación X")
  roomId: string; // para los ids de puzzle ("sala#índice")
  isCurrent: boolean; // el grupo está EN esta sala (si no, la pestaña "Llaves" va desactivada)
  puzzles: number; // nº de puzzles de la sala
  puzzleBase?: number; // offset para la numeración global "Puzzle N"
  description?: string; // texto de la descripción (si no hay, se usa un lorem de relleno)
  tab: number;
  onTab: (i: number) => void;
  solved: Set<string>; // puzzles resueltos del juego
  onResolve: (id: string) => void; // pedir abrir el candado de un puzzle (al acertar la combinación: +1 llave)
  onClose: () => void;
};

export default function RoomPanel({ title, num, roomId, isCurrent, puzzles, puzzleBase = 0, description, tab, onTab, solved, onResolve, onClose }: RoomPanelProps) {
  // una opción por puzzle de la sala (placeholder hasta tener los nombres reales)
  const puzzleOptions = Array.from({ length: puzzles }, (_, i) => `Puzzle ${puzzleBase + i + 1}`);
  // puzzle SELECCIONADO en el desplegable (índice). Se reinicia al primero al cambiar de sala.
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  useEffect(() => { setPuzzleIdx(0); }, [roomId]);
  const idx = puzzleIdx < puzzleOptions.length ? puzzleIdx : 0; // índice válido (por si el reinicio va un frame por detrás)
  const puzzleId = roomId + "#" + idx;
  const puzzleSolved = solved.has(puzzleId);
  // icono del hueco derecho: en "Llaves", si el puzzle seleccionado está RESUELTO → check; si no, la llave (TAB_BIG[1])
  const bigIcon = tab === 1 && puzzleSolved ? "/icons/check-0.png" : TAB_BIG[tab];
  // "Resolver": abre el candado del puzzle seleccionado. Si se acierta la combinación, se resuelve (+1 llave)
  // y el botón queda desactivado. Oscurece + pausa la pantalla mientras el candado está abierto.
  const resolveSelected = () => { if (!puzzleSolved && puzzleOptions.length > 0) onResolve(puzzleId); };
  return (
    <div className="minimap-info win98">
      <div className="window minimap-panel">
        <div className="title-bar">
          <img className="title-icon" src="/icons/help_question_mark-1.png" alt="" />
          <div className="title-bar-text">{num ? `Habitación ${num}` : "Habitación"}</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Close" onClick={onClose}></button>
          </div>
        </div>
        <div className="window-body minimap-panel-body">
            <menu role="tablist">
              {TABS.map((t, i) => (
                <li key={t} role="tab" aria-selected={tab === i} onClick={() => onTab(i)}>
                  <a href="#" onClick={(e) => e.preventDefault()}>{t}</a>
                </li>
              ))}
            </menu>
            <div className="window" role="tabpanel">
              <div className="window-body">
                {tab === 0 && (
                  <>
                    {/* fila Win98: etiqueta "Nombre:" + el MISMO Select con una sola opción (el nombre de la
                        sala). Al ser una única opción sale desactivado: caja Win98 idéntica, sin desplegar. */}
                    <div className="field-row room-sala">
                      <span>Nombre:</span>
                      {/* controlado (value=title): al saltar de sala a sala con el panel abierto, muestra
                          SIEMPRE el nombre de la sala actual (si no, un select no controlado se quedaba en el anterior) */}
                      <Win98Select ariaLabel="Nombre" options={[title]} value={title} hideArrow />
                    </div>
                    <p className="room-field-label">Descripción:</p>
                    {/* panel de descripción: ocupa el 100% del espacio restante (aunque esté vacío) */}
                    <div className="sunken-panel room-info">{description && <p>{description}</p>}</div>
                  </>
                )}
                {tab === 1 && (
                  <>
                    {/* mismo layout que Información, pero el campo del puzzle es un DESPLEGABLE propio (Win98Select):
                        aspecto Win98, pero con la lista dentro del CRT (la nativa se escapa del warp/scanlines). */}
                    <div className={"field-row room-sala" + (puzzleSolved ? " puzzle-solved" : "")}>
                      <span>Puzzle:</span>
                      <Win98Select ariaLabel="Puzzle" options={puzzleOptions}
                        value={puzzleOptions[idx] ?? ""} onChange={(_, i) => setPuzzleIdx(i)} />
                    </div>
                    <p className="room-field-label">Descripción:</p>
                    <div className="sunken-panel room-info" />
                    {/* pager entre puzzles: "Atrás" pegado a la izquierda (si no es el primero), "Siguiente" a la derecha (si no es el último) */}
                    {puzzleOptions.length > 1 && (
                      <div className="room-pager">
                        {idx > 0 && <button type="button" onClick={() => setPuzzleIdx(idx - 1)}>Atrás</button>}
                        {idx < puzzleOptions.length - 1 && <button type="button" className="next" onClick={() => setPuzzleIdx(idx + 1)}>Siguiente</button>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          <div className="minimap-panel-aside">
            {/* pestaña "Llaves": en la sala → botones Abrir/Leer; lejos → el aviso SUSTITUYE a los botones (no disabled) */}
            {tab === 1 && (isCurrent ? (
              <div className="aside-actions">
                <button type="button" onClick={resolveSelected} disabled={puzzleSolved || puzzleOptions.length === 0}>Abrir</button>
                <button type="button" disabled={puzzleSolved}>Leer</button>
              </div>
            ) : (
              <p className="aside-note">¡Demasiado lejos para abrir un puzzle!</p>
            ))}
            {bigIcon && <img src={bigIcon} alt="" />}
          </div>
        </div>
      </div>
    </div>
  );
}
