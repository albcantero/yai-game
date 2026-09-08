// Panel de info de una sala (overlay Win98 con pestañas). IDÉNTICO para todas las banderas: recibe por
// props el título, el nº de puzzles y el estado del juego (puzzles resueltos + callbacks). Así el Minimap
// (o cualquier pantalla) lo reutiliza sin duplicar markup. Los estilos viven en styles/minimap.css.
const TABS = ["Descripción", "Puzzles", "Objetos"];
// Icono GRANDE del hueco derecho, por pestaña. Cambia al cambiar de tab (Puzzles/Objetos aún sin icono).
const TAB_BIG: (string | null)[] = ["/icons/help_question_mark-0.png", null, null];

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

export type RoomPanelProps = {
  title: string; // nombre de la sala (barra de título + pestaña Descripción)
  roomId: string; // para los ids de puzzle ("sala#índice")
  puzzles: number; // nº de puzzles de la sala
  description?: string; // texto de la descripción (si no hay, se usa un lorem de relleno)
  tab: number;
  onTab: (i: number) => void;
  solved: Set<string>; // puzzles resueltos del juego
  onSolve: (id: string) => void; // resolver un puzzle (+1 llave)
  onClose: () => void;
};

export default function RoomPanel({ title, roomId, puzzles, description, tab, onTab, solved, onSolve, onClose }: RoomPanelProps) {
  const bigIcon = TAB_BIG[tab];
  return (
    <div className="minimap-info win98">
      <div className="window minimap-panel">
        <div className="title-bar">
          <img className="title-icon" src="/icons/help_question_mark-1.png" alt="" />
          <div className="title-bar-text">{title}</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Close" onClick={onClose}></button>
          </div>
        </div>
        <div className="window-body minimap-panel-body">
          <div className="minimap-panel-tabs">
            <menu role="tablist">
              {TABS.map((t, i) => (
                <li key={t} role="tab" aria-selected={tab === i} onClick={() => onTab(i)}>
                  <a href="#" onClick={(e) => e.preventDefault()}>{t}</a>
                </li>
              ))}
            </menu>
            <div className="window" role="tabpanel">
              <div className="window-body">
                {/* título FUERA, justo encima del recuadro (solo en Descripción) */}
                {tab === 0 && <p className="room-desc-title">{title}</p>}
                {/* recuadro blanco hundido con borde (clase nativa de 98.css) */}
                <div className="sunken-panel">
                  {tab === 0 && <p>{description ?? LOREM}</p>}
                  {tab === 1 && (
                    <div className="puzzle-list">
                      {puzzles === 0 && <p>Sin puzzles</p>}
                      {Array.from({ length: puzzles }, (_, i) => {
                        const id = roomId + "#" + i;
                        const done = solved.has(id);
                        return (
                          <div key={i} className="puzzle-row">
                            <span>Puzzle {i + 1}</span>
                            <button type="button" disabled={done} onClick={() => onSolve(id)}>{done ? "Resuelto" : "Resolver"}</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {tab === 2 && <p>—</p>}
                </div>
              </div>
            </div>
          </div>
          <div className="minimap-panel-aside">{bigIcon && <img src={bigIcon} alt="" />}</div>
        </div>
      </div>
    </div>
  );
}
