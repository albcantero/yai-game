import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { useGameState } from "../../lib/gameState";
import { unlockedNotes } from "../../game/notas";
import { resolveTokens } from "../../game/fax";

// NOTAS (pantalla `notas`): un bloc de notas estilo Win98. Lista NUMERADA de líneas desbloqueadas (según los
// triggers sobre el game_state compartido) que va creciendo. Sin estado en DB: se deriva de game_state.
const Notas = forwardRef<ScreenHandle, ScreenServices>(function Notas(_props, ref) {
  const gs = useGameState();
  useImperativeHandle(ref, () => ({ handleKey: () => {}, setPaused: () => {} }), []);

  const notes = unlockedNotes(gs);
  // sustituye los tokens ({contacto} ???→Miquela, {hf} H. F.→Higgins, {sala-elegida}) según las flags de revelación
  const fill = (t: string) => resolveTokens(t, gs);
  return (
    <div className="notas win98">
      <div className="notas-pad sunken-panel">
        {notes.length === 0 ? (
          <p className="notas-empty">Aún no hay notas.</p>
        ) : (
          <ol className="notas-lines">
            {notes.map((n) => (
              <li key={n.id}>{fill(n.texto)}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
});

export default Notas;
