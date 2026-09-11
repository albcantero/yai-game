// NOTAS (el "archivador"): los documentos/pistas que se van reuniendo. Cada nota tiene un TRIGGER (el mismo
// sistema declarativo que los bloques del Fax: condición sobre el game_state) que decide cuándo aparece. NO
// persiste nada nuevo en la DB: qué notas están desbloqueadas se calcula en vivo con los triggers sobre el
// game_state compartido. El reparto del lore se hace, sobre todo, por el ORDEN en que se desbloquean estas notas.
//
// CÓMO EDITAR (para Alberto):
//   - Añade objetos a NOTES. `id` único. `trigger` = cuándo aparece (ver GameTrigger en game/fax.ts):
//       { type:"start" } · { type:"solved", puzzle:"r1#0" } · { type:"item", item:"tarjeta" }
//       { type:"reached", node:"r7" } · { type:"keys", min:5 } · { type:"started" }
//   - `titulo`: cómo aparece en la lista. `fuente` (opcional): etiqueta corta de origen.
//   - `cuerpo`: el texto del documento (admite saltos de línea).
import { triggerMet, type FaxTrigger as GameTrigger } from "./fax";
import type { GameState } from "../lib/gameState";

export type Note = {
  id: string;
  trigger: GameTrigger;
  titulo: string;
  fuente?: string;
  cuerpo: string;
};

export const NOTES: Note[] = [
  // ── PRIMERA NOTA (borrador de arranque, disponible desde el principio) ──
  {
    id: "situacion",
    trigger: { type: "start" },
    titulo: "Dónde estamos",
    fuente: "Nota rápida",
    cuerpo:
      "Nos han encerrado en el almacén y se han llevado a la encargada. Dijeron que volverían.\n\n" +
      "Una voz por el altavoz dice que no lo harán, y que puede sacarnos de aquí a cambio de un libro. " +
      "Que la única salida son las salas ocultas de la librería.\n\n" +
      "De momento, solo tenemos su palabra.",
  },
];

// Notas desbloqueadas con el estado actual (en el orden de este array).
export const unlockedNotes = (gs: GameState | null): Note[] =>
  gs ? NOTES.filter((n) => triggerMet(n.trigger, gs)) : [];
