import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState } from "../../lib/gameState";
import { unlockedNotes } from "../../game/notas";

// NOTAS (pantalla `notas`): un bloc de notas estilo Win98. Lista NUMERADA de líneas desbloqueadas (según los
// triggers sobre el game_state compartido) que va creciendo. Sin estado en DB: se deriva de game_state.
const Notas = forwardRef<ScreenHandle, ScreenServices>(function Notas(_props, ref) {
  const gs = useGameState();
  useImperativeHandle(ref, () => ({ handleKey: () => {}, setPaused: () => {} }), []);

  const notes = unlockedNotes(gs);
  return (
    <div className="notas win98">
      <div className="notas-pad sunken-panel">
        {notes.length === 0 ? (
          <p className="notas-empty">Aún no hay notas.</p>
        ) : (
          <ol className="notas-lines">
            {notes.map((n) => (
              <li key={n.id}>{n.texto}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
});

export default Notas;
