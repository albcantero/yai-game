// CANDADOS FINALES (la "segunda oleada"): 5 geometryLock especiales que NO cuentan en el contador "N/21" del
// juego normal. Son una capa aparte, con su propia lógica de revelado y recompensa.
//
// CADENA:
//   1. El candado del DESPACHO es el TRIGGER: siempre visible. Resolverlo revela los otros cuatro
//      (+ la nota "hay cuatro mecanismos en las salas X, Y, Z..." + el aviso "Han aparecido nuevos puzzles").
//   2. Los otros cuatro son los MECANISMOS (Sala de Máquinas, Almacén, Librería, La Cámara). Ocultos hasta
//      resolver el Despacho.
//   3. Resueltos los CUATRO mecanismos, en CUALQUIER orden -> +1 Llave Roja (Copia de la Llave Maestra).
//      El Despacho NO cuenta para eso: solo abre la puerta a los mecanismos.
//
// Los combos son índices de figura del GeometryLock (ver SHAPES en components/locks/GeometryLock.tsx):
//   estrella=0, luna=1, chispa=2, triángulo=3, cuadrado=4, número=5, sol=6, nube=7, espacio(=space)=8.
// La pista física dibuja algunas figuras DESCENTRADAS: "asoma a la izquierda" = figura-1, "asoma a la
// derecha" = figura+1, "centrada" = la figura tal cual (así el combo esconde la figura de la pista).
import { triggerMet, type FaxTrigger as GameTrigger } from "./fax";
import type { GameState } from "../lib/gameState";

export type FinalLock = {
  id: string;             // id de puzzle ("<room>#final"), para game_state.solved[] y la RPC solve
  room: string;           // sala donde vive (id del minimap: r1, hub-almacen, libreria, r6, r8)
  salaNum: number;        // "Sala N" que ve la jugadora (el num del minimap); solo para textos/notas
  salaName: string;       // nombre legible de la sala (para la nota del Despacho)
  titulo: string;         // nombre en el desplegable de "Llaves"
  combo: number[];        // solución (índices de figura del GeometryLock)
  mecanismo: boolean;     // true = cuenta para la Llave Roja; false = SOLO trigger (el Despacho)
  revelaSi?: GameTrigger; // condición para ser VISIBLE. Sin esto = siempre visible (el Despacho)
};

// id del candado del Despacho (el trigger que revela los mecanismos)
export const DESPACHO_LOCK_ID = "r6#final";
// trigger de revelado de los mecanismos: haber resuelto el candado del Despacho
const REVEAL: GameTrigger = { type: "solved", puzzle: DESPACHO_LOCK_ID };

export const FINAL_LOCKS: FinalLock[] = [
  // ── TRIGGER: Despacho (siempre visible). Resolverlo revela los cuatro mecanismos. NO cuenta para la llave. ──
  // Pista: Informe con estrellas en rejilla (izq, izq, dcha, izq) -> estrella±offset.
  { id: DESPACHO_LOCK_ID, room: "r6", salaNum: 8, salaName: "el Despacho", titulo: "Mecanismo",
    combo: [8, 8, 1, 8], mecanismo: false },

  // ── MECANISMOS (los cuatro que dan la Llave Roja). Ocultos hasta resolver el Despacho. ──
  // Sala 7 = Sala de Máquinas. Pista (reverso Almacén): triángulo asoma izq / centro luna, número / triángulo asoma dcha.
  { id: "r1#final", room: "r1", salaNum: 7, salaName: "la Sala de Máquinas", titulo: "Mecanismo",
    combo: [2, 1, 5, 4], mecanismo: true, revelaSi: REVEAL },
  // Sala 2 = Almacén. Pista (frontal Índice): triángulo, triángulo, space (la "✗"), triángulo.
  { id: "hub-almacen#final", room: "hub-almacen", salaNum: 2, salaName: "el Almacén", titulo: "Mecanismo",
    combo: [3, 3, 8, 3], mecanismo: true, revelaSi: REVEAL },
  // Sala 1 = Librería. Pista (Resumen del libro): 3-2=1 + cuatro ⊘ (null) -> todo space.
  { id: "libreria#final", room: "libreria", salaNum: 1, salaName: "la Librería", titulo: "Mecanismo",
    combo: [8, 8, 8, 8], mecanismo: true, revelaSi: REVEAL },
  // Sala 10 = La Cámara. Pista (clave de la Cámara): II=rayo(chispa), III=cuadrado, con offset -> luna, chispa, número, cuadrado.
  { id: "r8#final", room: "r8", salaNum: 10, salaName: "la Cámara", titulo: "Mecanismo",
    combo: [1, 2, 5, 4], mecanismo: true, revelaSi: REVEAL },
];

// FLAG DE TESTING: en true, TODOS los candados finales se ven ya (ignora `revelaSi`). En producción -> false.
export const SHOW_FINAL_LOCKS = true;

// los cuatro MECANISMOS (el Despacho no cuenta)
export const MECHANISMS = FINAL_LOCKS.filter((l) => l.mecanismo);
// item que otorga completar los cuatro mecanismos (Copia de la Llave Maestra; en el HUD, la llave ROJA)
export const RED_KEY_ITEM = "llave-maestra";

// ¿es visible este candado con el estado actual? (Despacho siempre; mecanismos según revelaSi, o todos en testing)
export function finalLockVisible(lock: FinalLock, gs: GameState | null): boolean {
  if (!lock.revelaSi) return true;   // el Despacho (trigger): siempre visible
  if (SHOW_FINAL_LOCKS) return true; // testing: forzar todos visibles
  return gs ? triggerMet(lock.revelaSi, gs) : false;
}

// candados finales de una sala, visibles con el estado actual (para añadirlos al panel de esa sala)
export function finalLocksInRoom(room: string, gs: GameState | null): FinalLock[] {
  return FINAL_LOCKS.filter((l) => l.room === room && finalLockVisible(l, gs));
}

// nº de mecanismos ya resueltos (para textos / aviso de progreso)
export function mechanismsSolvedCount(gs: GameState | null): number {
  const solved = new Set(gs?.solved ?? []);
  return MECHANISMS.filter((m) => solved.has(m.id)).length;
}

// ¿están resueltos los CUATRO mecanismos? -> se otorga la Llave Roja
export function allMechanismsSolved(gs: GameState | null): boolean {
  return mechanismsSolvedCount(gs) === MECHANISMS.length;
}

// Al resolver `id`, ¿se completan con eso los cuatro mecanismos? (los otros tres ya resueltos). Sirve para,
// en ese mismo `solve`, otorgar la Llave Roja de una vez (independiente del orden en que se resuelvan).
export function solvingCompletesMechanisms(id: string, gs: GameState | null): boolean {
  const lock = FINAL_LOCKS.find((l) => l.id === id);
  if (!lock || !lock.mecanismo) return false;
  const solved = new Set(gs?.solved ?? []);
  return MECHANISMS.every((m) => m.id === id || solved.has(m.id));
}

// ¿el Despacho (trigger) ya está resuelto? (para la nota + el aviso "Han aparecido nuevos puzzles")
export function despachoSolved(gs: GameState | null): boolean {
  return new Set(gs?.solved ?? []).has(DESPACHO_LOCK_ID);
}
