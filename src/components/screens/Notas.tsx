import { forwardRef, useImperativeHandle, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState } from "../../lib/gameState";
import { unlockedNotes, type Note } from "../../game/notas";

// NOTAS (pantalla `notas`): el archivador. Lista de notas DESBLOQUEADAS (según los triggers sobre el
// game_state compartido) + lector. Sin estado en DB: se deriva de game_state. Tocar una nota la abre; "Volver"
// regresa a la lista. Estilos en styles/notas.css.
const Notas = forwardRef<ScreenHandle, ScreenServices>(function Notas(_props, ref) {
  const gs = useGameState();
  const [openId, setOpenId] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ handleKey: () => {}, setPaused: () => {} }), []);

  const notes: Note[] = unlockedNotes(gs);
  const open = openId ? notes.find((n) => n.id === openId) ?? null : null;

  return (
    <div className="notas win98">
      {open ? (
        <>
          <div className="notas-bar">
            <button type="button" className="notas-back" onClick={() => setOpenId(null)}>‹ Volver</button>
          </div>
          <article className="notas-doc sunken-panel">
            <h2 className="notas-doc-title">{open.titulo}</h2>
            {open.fuente && <p className="notas-doc-src">{open.fuente}</p>}
            <div className="notas-doc-body">{open.cuerpo}</div>
          </article>
        </>
      ) : (
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
      )}
    </div>
  );
});

export default Notas;
