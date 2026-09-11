// PANEL DE LECTURA compartido (botón "Leer" de CUALQUIER puzzle). Usa el MISMO marco que los candados
// (LockPanel: entra deslizándose desde abajo + paper-slide al aparecer, y baja igual al cerrar). De momento
// el cuerpo va VACÍO: solo el marco + el botón "Salir" abajo del todo (igual que los candados, .lock-exit).
// El texto (prop `text`) se pintará en la siguiente iteración. Estilos compartidos en locks.css.
import { useRef } from "react";
import LockPanel, { type LockPanelHandle } from "./LockPanel";

export type ReadPanelProps = {
  text: string; // texto a mostrar (la nota/enunciado del puzzle). De momento NO se pinta (pantalla vacía)
  playSfx: (src: string, vol?: number) => void;
  onClose: () => void; // cerrar el panel (el armazón quita el overlay)
};

export default function ReadPanel({ text, playSfx, onClose }: ReadPanelProps) {
  const panelRef = useRef<LockPanelHandle>(null);
  return (
    <LockPanel ref={panelRef} playSfx={playSfx}>
      {/* el texto del puzzle, en Pixelated Times New Roman blanco (la misma fuente del CORRECTO de los candados).
          Div con scroll PROPIO: si el texto es largo, se desplaza DENTRO de la caja (no crece el panel). */}
      <div className="read-text">{text}</div>

      {/* botón "Salir" abajo del todo, idéntico a los candados: cierra con la animación inversa (baja + paper-slide) */}
      <div className="lock-exit win98">
        <button type="button" onClick={() => panelRef.current?.close(onClose)}>Salir</button>
      </div>
    </LockPanel>
  );
}
