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
//       next:     (opcional, para un nodo SIN a/b) auto-avanza a ese nodo tras sus mensajes, SIN botones. Encadena mensajes.
//     Un nodo sin a/b y sin `next` es TERMINAL (fin del bloque). Un nodo de decisión debe tener SIEMPRE a y b.
import type { GameState } from "../lib/gameState";

export type FaxChoice = { text: string; next: string | null };
export type FaxNode = { incoming: string[]; a?: FaxChoice; b?: FaxChoice; next?: string };

// Trigger declarativo: condición sobre el game_state que DESBLOQUEA un bloque.
export type FaxTrigger =
  | { type: "start" }                    // disponible desde el principio
  | { type: "started" }                  // tras la llamada inicial (flag started)
  | { type: "solved"; puzzle: string }   // resuelto un puzzle ("r1#0")
  | { type: "item"; item: string }       // conseguido un item ("tarjeta", "llave-maestra")
  | { type: "reached"; node: string }    // LLEGADO a una sala/nodo (open_paths, acumulativo)
  | { type: "reachedAny"; nodes: string[] } // llegado a CUALQUIERA de estos nodos (OR)
  | { type: "faxDone"; block: string }   // COMPLETADO (jugado hasta su nodo final) un bloque del Fax (por su id)
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
    case "reachedAny": return t.nodes.some((n) => (gs.open_paths ?? []).includes(n));
    case "faxDone": return isFaxBlockDone(t.block, gs);
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
        a: { text: "Te recibimos. Gracias por ayudarnos.", next: "recibido" },
        b: { text: "¿Quién eres?", next: "quien" },
      },
      recibido: { incoming: ["¡Menos mal!", "Yo también recibo vuestros mensajes."], next: "trato" },
      quien: {
        incoming: ["Eso ahora no importa.", "Sobre lo del libro..."],
        a: { text: "Está bien. ¿Qué hacemos?", next: "trato" },
        b: { text: "No me fío de ti.", next: "desconfianza" },
      },
      trato:{
        incoming: ["¿Ya habéis pensado en lo que os dije sobre hacer un trato? Un libro a cambio de sacaros de ahí."],
        a: { text: "Sí. Aceptamos. Trato hecho.", next: "fin" },
        b: { text: "¿Qué libro?", next: "libro" },
      },
      desconfianza: {
        incoming: ["Ahora mismo soy lo único que tenéis ahí dentro.", "Esperaré hasta que os decidáis."],
        a: { text: "De acuerdo. Ayúdanos.", next: "trato" },
        b: { text: "...", next: "trato" },
      },
      libro: { incoming: ["Os lo diré en su momento."],
        a: { text: "Está bien. Aceptamos.", next: "fin" },
        b: { text: "Vale, pero primero sácanos de aquí.", next: "fin" },
      },
      fin: { incoming: ["Perfecto.", "Detrás de la columna vais a encontrar el cuadro eléctrico. Quitad el precinto y abrid la puerta. Veréis que es falso..., que no hay nada parecido a un interruptor$#@, 3drta", "Perdonad por eso último. He de cortar la comunicación en seguida.", "Seguid informándome de lo que encontréis."] }, // terminal
    },
  },

  // ── BLOQUE 2: reacción al SALIR del Almacén (2ª sala: Biblioteca r3 o Sala de Máquinas r1). Terminal: dos
  //    mensajes y ya, SIN respuesta nuestra (nodo sin a/b). {sala-elegida} = el nombre de la sala a la que fueron. ──
  {
    id: "segunda-sala",
    trigger: { type: "reachedAny", nodes: ["r3", "r1"] },
    start: "s0",
    nodes: {
      s0: { incoming: ["Hm, veo que habéis decidido ir por {sala-elegida}. Yo habría ido por el otro sitio.", "Seguid avanzando e investigando. Estamos en contacto."],
        a: { text: "Hemos encontrado en el almacén un parte de horas del año 2023.", next: "puzzle" },
        b: { text: "¿De qué va todo esto? ¿Cada habitación guarda un acertijo?", next: "misterio"},
      },
      puzzle: { incoming: ["Hm, eso es interesante. ¿Lo habéis leído con atención?", "Todas las salas están llenas de objetos antiguos. Os iréis encontrando más.", "Guardadlo el parte de horas de momento. Quizá os sea útil más adelante."],
        a: { text: "Respecto a las salas... ¿en todas hay puzzles que tenemos que resolver?", next: "misterio" },
        b: { text: "¿Iremos... encontrando más?", next: "misterio" }, 
      },
      misterio: { incoming: ["Toda la librería es un sistema lógico construido hace mucho tiempo. Para salir de aquí tenéis que descifrarlo entero.", "Hallaréis rarezas de... muchas épocas. Algunas de ellas son notas o comentarios de otros que han pasado por aquí antes."],
        a: { text: "¿Y qué hacemos ahora?", next: "fin" },
        b: { text: "Vale. Seguimos", next: "fin" },
      },
      fin: { incoming: ["Seguid."] },
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

// ── COMPLETADO de un bloque (para el trigger `faxDone` de notas / otros bloques) ──
// ¿está COMPLETO (llegado a un nodo terminal) un bloque dado sus picks? (puro; sigue las cadenas `next`).
function blockComplete(block: FaxBlock, picks: number[]): boolean {
  let id: string | null = block.start;
  let p = 0, guard = 0;
  while (id !== null && guard++ < 500) {
    const node: FaxNode | undefined = block.nodes[id];
    if (!node) return true;
    if (node.a || node.b) {                     // nodo de decisión
      if (p >= picks.length) return false;      // decisión pendiente: aún NO completo
      const sel = picks[p] === 1 ? 1 : 0; p++;
      id = (sel === 0 ? node.a?.next : node.b?.next) ?? null;
      continue;
    }
    if (node.next) { id = node.next; continue; } // auto-avance
    return true;                                // nodo terminal alcanzado = completo
  }
  return true;
}
// ¿se ha TERMINADO ese bloque del Fax? = desbloqueado (su trigger se cumple) Y jugado hasta su final.
// (No usar un `faxDone` que apunte al PROPIO bloque: sería recursivo).
export function isFaxBlockDone(blockId: string, gs: GameState): boolean {
  const block = BLOCKS.find((b) => b.id === blockId);
  if (!block) return false;
  if (!triggerMet(block.trigger, gs)) return false; // ni siquiera desbloqueado
  const picks = ((gs.fax_progress ?? {}) as Record<string, number[]>)[blockId] ?? [];
  return blockComplete(block, picks);
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

// Nombre de la SEGUNDA sala (la 1ª ruta elegida desde el Almacén), para el token {sala2}. open_paths guarda el
// orden de desbloqueo, así que el que aparezca ANTES es el que se alcanzó primero (aunque luego se abran las dos).
export function secondRoomName(gs: GameState | null): string {
  const open = gs?.open_paths ?? [];
  const iBiblio = open.indexOf("r3");    // Biblioteca (ruta norte)
  const iMaquinas = open.indexOf("r1");  // Sala de Máquinas (ruta sur)
  if (iBiblio === -1 && iMaquinas === -1) return "";
  if (iMaquinas === -1) return "la Biblioteca";
  if (iBiblio === -1) return "la Sala de Máquinas";
  return iBiblio < iMaquinas ? "la Biblioteca" : "la Sala de Máquinas";
}

// Sustituye los tokens de un texto (mensajes del Fax, notas): {contacto} -> "???"/Miquela ; {sala-elegida} -> 2ª sala.
export function resolveTokens(text: string, gs: GameState | null): string {
  return text
    .replace(/\{contacto\}/g, contactName(gs))
    .replace(/\{sala-elegida\}/g, secondRoomName(gs));
}
