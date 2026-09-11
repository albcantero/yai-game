import { forwardRef, useImperativeHandle, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState } from "../../lib/gameState";
import { unlockedNotes, type Note } from "../../game/notas";

// NOTAS (pantalla `notas`): el archivador. Lista de notas DESBLOQUEADAS (según los triggers sobre el
// game_state compartido). Al tocar una, se abre en un POPUP Win98 (franja de título + X) sobre la lista.
// Sin estado en DB: se deriva de game_state. Estilos en styles/notas.css.
const Notas = forwardRef<ScreenHandle, ScreenServices>(function Notas(_props, ref) {
  const gs = useGameState();
  const [openId, setOpenId] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ handleKey: () => {}, setPaused: () => {} }), []);

  const notes: Note[] = unlockedNotes(gs);
  const open = openId ? notes.find((n) => n.id === openId) ?? null : null;

  return (
    <div className="notas win98">
      <div className="notas-list sunken-panel">
        {notes.length === 0 ? (
          <p className="notas-empty">Aún no hay notas.</p>
        ) : (
          notes.map((n) => (
            <button type="button" key={n.id} className="notas-item" onClick={() => setOpenId(n.id)}>
              <span className="notas-item-title">{n.titulo}</span>
              {n.fuente && <span className="notas-item-src">{n.fuente}</span>}
            </button>
          ))
        )}
      </div>

      {/* la nota se abre en un POPUP Win98 (franja de título + X), sobre la lista. Clic en el fondo = cerrar. */}
      {open && (
        <div className="notas-overlay win98" onClick={() => setOpenId(null)}>
          <div className="window notas-popup" onClick={(e) => e.stopPropagation()}>
            <div className="title-bar">
              <img className="title-icon" src="/icons/notepad-sm.png" alt="" />
              <div className="title-bar-text">{open.titulo}</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" onClick={() => setOpenId(null)}></button>
              </div>
            </div>
            <div className="window-body notas-popup-body">
              {open.fuente && <p className="notas-doc-src">{open.fuente}</p>}
              <div className="notas-doc-body">{open.cuerpo}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Notas;
