// Panel de info de una sala (overlay Win98 con pestañas). IDÉNTICO para todas las banderas: recibe por
// props el título, el nº de puzzles y el estado del juego (puzzles resueltos + callbacks). Así el Minimap
// (o cualquier pantalla) lo reutiliza sin duplicar markup. Los estilos viven en styles/minimap.css.
import { useEffect, useState } from "react";
import Win98Select from "./Win98Select";

const TABS = ["Información", "Llaves"];
// Icono GRANDE del hueco derecho, por pestaña. Cambia al cambiar de tab.
const TAB_BIG: (string | null)[] = ["/icons/help_question_mark-0.png", "/icons/keys-5.png"];
// Nombres de puzzle de RELLENO (hasta tener los reales). El desplegable de la pestaña "Llaves" muestra
// tantas opciones como puzzles tenga la sala; con 1 sola opción el <select> sale desactivado.
const PUZZLE_PLACEHOLDER = ["Caja de madera", "Cerradura de latón", "Libro cifrado", "Cajón con doble fondo"];

export type RoomPanelProps = {
  title: string; // nombre de la sala (campo "Nombre:" de la pestaña Información)
  num?: number; // número de habitación (barra de título: "Habitación X")
  roomId: string; // para los ids de puzzle ("sala#índice")
  isCurrent: boolean; // el grupo está EN esta sala (si no, la pestaña "Llaves" va desactivada)
  puzzles: number; // nº de puzzles de la sala
  description?: string; // texto de la descripción (si no hay, se usa un lorem de relleno)
  tab: number;
  onTab: (i: number) => void;
  solved: Set<string>; // puzzles resueltos del juego
  onSolve: (id: string) => void; // resolver un puzzle (+1 llave)
  onClose: () => void;
};

export default function RoomPanel({ title, num, roomId, isCurrent, puzzles, description, tab, onTab, solved, onSolve, onClose }: RoomPanelProps) {
  const bigIcon = TAB_BIG[tab];
  // una opción por puzzle de la sala (placeholder hasta tener los nombres reales)
  const puzzleOptions = Array.from({ length: puzzles }, (_, i) => PUZZLE_PLACEHOLDER[i] ?? `Puzzle ${i + 1}`);
  // puzzle SELECCIONADO en el desplegable (índice). Se reinicia al primero al cambiar de sala.
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  useEffect(() => { setPuzzleIdx(0); }, [roomId]);
  const idx = puzzleIdx < puzzleOptions.length ? puzzleIdx : 0; // índice válido (por si el reinicio va un frame por detrás)
  const puzzleId = roomId + "#" + idx;
  const puzzleSolved = solved.has(puzzleId);
  // "Resolver": resuelve el puzzle seleccionado (+1 llave). Luego queda resuelto y el botón se desactiva.
  const resolveSelected = () => { if (!puzzleSolved && puzzleOptions.length > 0) onSolve(puzzleId); };
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
              {TABS.map((t, i) => {
                const tabDisabled = i === 1 && !isCurrent; // "Llaves" solo si el grupo está en la sala
                return (
                  <li key={t} role="tab" aria-selected={tab === i} aria-disabled={tabDisabled || undefined}
                    data-disabled={tabDisabled || undefined} onClick={() => { if (!tabDisabled) onTab(i); }}>
                    <a href="#" onClick={(e) => e.preventDefault()}>{t}</a>
                  </li>
                );
              })}
            </menu>
            <div className="window" role="tabpanel">
              <div className="window-body">
                {tab === 0 && (
                  <>
                    {/* fila Win98: etiqueta "Nombre:" + el MISMO Select con una sola opción (el nombre de la
                        sala). Al ser una única opción sale desactivado: caja Win98 idéntica, sin desplegar. */}
                    <div className="field-row room-sala">
                      <span>Nombre:</span>
                      <Win98Select ariaLabel="Nombre" options={[title]} hideArrow />
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
                    <div className="field-row room-sala">
                      <span>Puzzle:</span>
                      <Win98Select ariaLabel="Puzzle" options={puzzleOptions}
                        value={puzzleOptions[idx] ?? ""} onChange={(_, i) => setPuzzleIdx(i)} />
                    </div>
                    <p className="room-field-label">Descripción:</p>
                    <div className="sunken-panel room-info" />
                  </>
                )}
              </div>
            </div>
          <div className="minimap-panel-aside">
            {tab === 1 && (
              <div className="aside-actions">
                <button type="button" onClick={resolveSelected} disabled={puzzleSolved || puzzleOptions.length === 0}>Resolver</button>
                <button type="button">Leer</button>
              </div>
            )}
            {bigIcon && <img src={bigIcon} alt="" />}
          </div>
        </div>
      </div>
    </div>
  );
}
