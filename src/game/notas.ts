// NOTAS (el bloc de notas): una LISTA numerada que va creciendo. Cada línea tiene un TRIGGER (el mismo sistema
// declarativo que los bloques del Fax: condición sobre el game_state) que decide cuándo aparece. NO persiste
// nada nuevo en la DB: qué líneas están visibles se calcula en vivo con los triggers sobre el game_state.
// El reparto del lore se hace, sobre todo, por el ORDEN en que aparecen estas líneas.
//
// CÓMO EDITAR (para Alberto):
//   - Añade objetos a NOTES (el ORDEN del array = orden en la lista). `id` único.
//   - `trigger` = cuándo aparece la línea (ver GameTrigger en game/fax.ts):
//       { type:"start" } · { type:"solved", puzzle:"r1#0" } · { type:"item", item:"tarjeta" }
//       { type:"reached", node:"r7" } · { type:"keys", min:5 } · { type:"started" }
//   - `texto`: la línea de la nota (frase breve).
import { triggerMet, type FaxTrigger as GameTrigger } from "./fax";
import type { GameState } from "../lib/gameState";

export type Note = { id: string; trigger: GameTrigger; texto: string };

// El token {contacto} se sustituye al pintar por "???" o "Miquela Quirós" según la flag de revelación (ver fax.ts).
export const NOTES: Note[] = [
  // ── ÍNDICE de notas: cada objeto es UNA nota (una entrada). Se irán añadiendo más con sus triggers. ──
  { id: "encierro", trigger: { type: "start" },
    texto: "Nos han encerrado en el almacén. {contacto} nos ha llamado: puede sacarnos a cambio de un libro, y dice que la única salida son las salas ocultas de la librería." },

  // Aparece al resolver el mecanismo del Despacho (r6#final): destapa los cuatro mecanismos ocultos y sus salas.
  { id: "mecanismos", trigger: { type: "solved", puzzle: "r6#final" },
    texto: "El mecanismo del Despacho escondía una nota: los otros cuatro están en la Sala de Máquinas, el Almacén, la Librería y la Cámara. Con los cuatro activados se abre la cámara acorazada." },
];

// Líneas visibles con el estado actual (en el orden de este array).
export const unlockedNotes = (gs: GameState | null): Note[] =>
  gs ? NOTES.filter((n) => triggerMet(n.trigger, gs)) : [];
