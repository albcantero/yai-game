// Panel de info de una sala (overlay Win98 con pestañas). IDÉNTICO para todas las banderas: recibe por
// props el título, el nº de puzzles y el estado del juego (puzzles resueltos + callbacks). Así el Minimap
// (o cualquier pantalla) lo reutiliza sin duplicar markup. Los estilos viven en styles/minimap.css.
import Win98Select from "./Win98Select";

const TABS = ["Información", "Llaves"];
// Icono GRANDE del hueco derecho, por pestaña. Cambia al cambiar de tab.
const TAB_BIG: (string | null)[] = ["/icons/help_question_mark-0.png", "/icons/keys-5.png"];

export type RoomPanelProps = {
  title: string; // nombre de la sala (campo "Nombre:" de la pestaña Información)
  num?: number; // número de habitación (barra de título: "Habitación X")
  roomId: string; // para los ids de puzzle ("sala#índice")
  puzzles: number; // nº de puzzles de la sala
  description?: string; // texto de la descripción (si no hay, se usa un lorem de relleno)
  tab: number;
  onTab: (i: number) => void;
  solved: Set<string>; // puzzles resueltos del juego
  onSolve: (id: string) => void; // resolver un puzzle (+1 llave)
  onClose: () => void;
};

export default function RoomPanel({ title, num, roomId, puzzles, description, tab, onTab, solved, onSolve, onClose }: RoomPanelProps) {
  const bigIcon = TAB_BIG[tab];
  // "Resolver" del aside: resuelve el siguiente puzzle sin resolver de la sala (+1 llave). Provisional
  // hasta que haya datos/navegación de puzzles; mantiene la economía jugable.
  const solveNext = () => {
    for (let i = 0; i < puzzles; i++) {
      const id = roomId + "#" + i;
      if (!solved.has(id)) { onSolve(id); return; }
    }
  };
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
                    {/* fila Win98: etiqueta "Sala:" + campo hundido con el nombre, en la MISMA línea */}
                    <div className="field-row room-sala">
                      <span>Nombre:</span>
                      <div className="sunken-panel room-name">{title}</div>
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
                      <Win98Select
                        ariaLabel="Puzzle"
                        options={["Caja de madera", "Cerradura de latón", "Libro cifrado", "Cajón con doble fondo"]}
                      />
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
                <button type="button" onClick={solveNext}>Resolver</button>
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
