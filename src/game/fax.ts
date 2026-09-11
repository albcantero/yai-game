// GUION del Fax Electrónico (chat con el informante "???", aún sin revelar que es Miquela Quirós).
// Organizado en BLOQUES de conversación. Cada bloque tiene un TRIGGER (condición sobre el game_state que lo
// desbloquea) y su propio mini-GRAFO ramificado. La partida solo guarda las elecciones POR BLOQUE
// (game_state.fax_progress); qué bloques están desbloqueados se calcula en vivo con los triggers.
//
// FLUJO: los bloques se juegan EN ORDEN (el de este array). Un bloque se juega hasta su nodo terminal; el
// siguiente aparece cuando su trigger se cumple. GUARD: si estás a media conversación y se desbloquea otro
// bloque, primero terminas el actual y luego aparecen los disponibles (en orden). Todo se acumula en el scroll.
//
// CÓMO EDITAR (para Alberto):
//   - Añade objetos a BLOCKS (el ORDEN del array = orden de reproducción).
//   - `id`: identificador único del bloque.
//   - `trigger`: cuándo se desbloquea (ver FaxTrigger abajo).
//   - `start`: id del nodo inicial del bloque (dentro de `nodes`).
//   - `nodes`: el grafo. Cada nodo:
//       incoming: mensajes que ELLA envía al llegar, en orden.
//       a / b:    las dos respuestas; text = lo que decimos, next = id del siguiente nodo (o null para terminar).
//     Un nodo SIN a/b es TERMINAL (fin del bloque). Un nodo de decisión debe tener SIEMPRE a y b.
import type { GameState } from "../lib/gameState";

export type FaxChoice = { text: string; next: string | null };
export type FaxNode = { incoming: string[]; a?: FaxChoice; b?: FaxChoice };

// Trigger declarativo: condición sobre el game_state que DESBLOQUEA un bloque.
export type FaxTrigger =
  | { type: "start" }                    // disponible desde el principio
  | { type: "started" }                  // tras la llamada inicial (flag started)
  | { type: "solved"; puzzle: string }   // resuelto un puzzle ("r1#0")
  | { type: "item"; item: string }       // conseguido un item ("tarjeta", "llave-maestra")
  | { type: "reached"; node: string }    // LLEGADO a una sala/nodo (open_paths, acumulativo)
  | { type: "keys"; min: number };       // llaves >= min

export type FaxBlock = { id: string; trigger: FaxTrigger; start: string; nodes: Record<string, FaxNode> };

// ¿se cumple el trigger con el estado actual? (puro)
export function triggerMet(t: FaxTrigger, gs: GameState): boolean {
  switch (t.type) {
    case "start": return true;
    case "started": return gs.started;
    case "solved": return (gs.solved ?? []).includes(t.puzzle);
    case "item": return (gs.items ?? []).includes(t.item);
    case "reached": return (gs.open_paths ?? []).includes(t.node);
    case "keys": return (gs.keys ?? 0) >= t.min;
  }
}

export const BLOCKS: FaxBlock[] = [
  // ── BLOQUE 1: contacto inicial (disponible desde el principio) ──
  {
    id: "intro",
    trigger: { type: "start" },
    start: "s0",
    nodes: {
      s0: {
        incoming: ["A ver, hmm. ¡Probando!", "¿Hola...? ¿Hay alguien ahí?", "Espero que funcione este cacharro."],
        a: { text: "Te recibimos, ¿y tú a nosotras? Gracias por ayudarnos.", next: "recibido" },
        b: { text: "Funciona. Pero ¿quién eres?", next: "quien" },
      },
      recibido: {
        incoming: ["¡Menos mal!", "Os leo perfectamente."],
        a: { text: "¿Quién eres?", next: "quien" },
        b: { text: "¿Qué hacemos ahora?", next: "fin" },
      },
      quien: {
        incoming: ["Eso ahora no importa.", "Alguien que quiere sacaros de ahí."],
        a: { text: "Está bien. ¿Qué hacemos?", next: "fin" },
        b: { text: "No me fío de ti.", next: "desconfianza" },
      },
      desconfianza: {
        incoming: ["Hacéis bien en no fiaros.", "Pero ahora mismo soy lo único que tenéis ahí dentro."],
        a: { text: "De acuerdo. Ayúdanos.", next: "fin" },
        b: { text: "...", next: "fin" },
      },
      fin: { incoming: ["Id explorando el almacén.", "Seguid informándome de lo que encontréis."] }, // terminal
    },
  },

  // ── BLOQUE 2 (RELLENO/placeholder): se desbloquea al LLEGAR a una sala. Sustituir sala y contenido. ──
  {
    id: "primera-sala",
    trigger: { type: "reached", node: "r3" },
    start: "s0",
    nodes: {
      s0: {
        incoming: ["¿Ya estáis dentro de una de las salas?", "Contadme qué veis."],
        a: { text: "Estanterías y libros hasta el techo.", next: "fin" },
        b: { text: "Todavía no sabemos qué buscar.", next: "fin" },
      },
      fin: { incoming: ["Cada sala esconde una llave.", "Id sumándolas. Yo os guío desde aquí."] }, // terminal
    },
  },
];

// nº de bloques desbloqueados con el estado actual (sus triggers cumplidos)
export function unlockedCount(gs: GameState): number {
  return BLOCKS.filter((b) => triggerMet(b.trigger, gs)).length;
}
// ¿hay bloques disponibles que aún no se han "visto" (abierto el Fax)? = aviso de "mensajes nuevos"
export function faxUnread(gs: GameState): boolean {
  return unlockedCount(gs) > (gs.fax_seen ?? 0);
}

// ── IDENTIDAD DEL INFORMANTE ────────────────────────────────────────────────────────────────────────────
// El contacto se muestra como "???" hasta que las jugadoras descubran (por los informes) que es Miquela Quirós.
// La revelación es un TRIGGER sobre el game_state (compartido): al cumplirse, "???" pasa a "Miquela Quirós" en
// todas partes (cabecera del Fax, notas con el token {contacto}...). PLACEHOLDER: cambia MIQUELA_REVEAL por el
// trigger real cuando exista el puzzle/nota de los informes que destapa su identidad.
export const CONTACT_ALIAS = "???";
export const CONTACT_NAME = "Miquela Quirós";
export const MIQUELA_REVEAL: FaxTrigger = { type: "solved", puzzle: "___reveal-miquela___" };
export const isMiquelaRevealed = (gs: GameState): boolean => triggerMet(MIQUELA_REVEAL, gs);
export const contactName = (gs: GameState | null): string =>
  gs && isMiquelaRevealed(gs) ? CONTACT_NAME : CONTACT_ALIAS;
