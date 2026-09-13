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
  // Nota 1: aparece al TERMINAR el bloque intro del Fax (la llamada de Miquela). Ver trigger faxDone en fax.ts.
  { id: "encierro", trigger: { type: "faxDone", block: "intro" },
    texto: "Nos han encerrado en el almacén. {contacto} nos ha llamado: puede sacarnos a cambio de un libro, y dice que la única salida que nos queda son las salas ocultas que tiene la librería. Hemos aceptado." },

  // Nota 2: al resolver la "puerta cerrada" de la Biblioteca (r3#1). Datos del contrato de construcción (Sobre 12).
  { id: "construccion", trigger: { type: "solved", puzzle: "r3#1" },
    texto: "La librería se construyó en 1996 y las obras duraron hasta 1998; se realizó un contrato por 100.000 euros." },

  // Nota 3: al resolver la Caja de herramientas (r2#2, Proyecto). Acta de suspensión de obra (Sobre 8): el acta es FALSA;
  // la obra la canceló el Gobierno y H. F. la firmó "no conforme" (conflicto Higgins vs Gobierno).
  { id: "obra-suspension", trigger: { type: "solved", puzzle: "r2#2" },
    texto: "Las obras de la sala de lectura nunca llegaron a terminarse. En una caja de herramientas encontramos el acta de suspensión de 1998; pero, escrito a bolígrafo, alguien advierte que el acta es falsa y que fue el Gobierno quien canceló las obras. {hf} la firmó como \"no conforme\"." },

  // Aparece al resolver el mecanismo del Despacho (r6#final): destapa los cuatro mecanismos ocultos y sus salas.
  { id: "mecanismos", trigger: { type: "solved", puzzle: "r6#final" },
    texto: "El mecanismo del Despacho escondía una nota: los otros cuatro están en la Sala de Máquinas, el Almacén, la Librería y la Cámara. Con los cuatro activados se abre la cámara acorazada." },
];

// Líneas visibles con el estado actual (en el orden de este array).
export const unlockedNotes = (gs: GameState | null): Note[] =>
  gs ? NOTES.filter((n) => triggerMet(n.trigger, gs)) : [];
