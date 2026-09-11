// GUION del Fax Electrónico (chat con el informante "???", aún sin revelar que es Miquela Quirós).
// RAMIFICADO: es un GRAFO de nodos. Cada respuesta (a/b) apunta con `next` al id del siguiente nodo, así
// cada elección puede llevar a mensajes distintos. La partida solo guarda la SECUENCIA de elecciones
// (game_state.fax_picks, 0/1 por paso), que basta para reconstruir el camino recorrido por el grafo.
//
// CÓMO EDITAR (para Alberto):
//   - Añade nodos al objeto DIALOG con un id único (la clave).
//   - `incoming`: los mensajes que ELLA envía al llegar a ese nodo, en orden.
//   - `a` / `b`: las dos respuestas. `text` = lo que decimos; `next` = id del siguiente nodo (o `null` para
//      terminar la conversación tras esa respuesta).
//   - Un nodo SIN `a`/`b` es TERMINAL: solo muestra sus mensajes y la conversación acaba ahí.
//   - El nodo inicial es FAX_START ("start").
// (De momento, un nodo de decisión debe tener SIEMPRE a y b: son los dos recuadros de respuesta.)

export type FaxChoice = { text: string; next: string | null };
export type FaxNode = { incoming: string[]; a?: FaxChoice; b?: FaxChoice };

export const FAX_START = "start";

export const DIALOG: Record<string, FaxNode> = {
  start: {
    incoming: ["A ver, hmm. ¡Probando!", "¿Hola...? ¿Hay alguien ahí?", "Espero que funcione este cacharro."],
    a: { text: "Te recibimos, ¿y tú a nosotras? Gracias por ayudarnos.", next: "recibido" },
    b: { text: "Funciona. Pero ¿quién eres?", next: "quien" },
  },

  // ── ramas de RELLENO (placeholder): sustitúyelas/expándelas con el guion real ──
  recibido: {
    incoming: ["¡Menos mal!", "Os leo perfectamente."],
    a: { text: "¿Quién eres?", next: "quien" },
    b: { text: "¿Qué hacemos ahora?", next: "instrucciones" },
  },
  quien: {
    incoming: ["Eso ahora no importa.", "Alguien que quiere sacaros de ahí."],
    a: { text: "Está bien. ¿Qué hacemos?", next: "instrucciones" },
    b: { text: "No me fío de ti.", next: "desconfianza" },
  },
  desconfianza: {
    incoming: ["Hacéis bien en no fiaros.", "Pero soy lo único que tenéis ahí dentro."],
    a: { text: "De acuerdo. Ayúdanos.", next: "instrucciones" },
    b: { text: "...", next: "instrucciones" },
  },
  instrucciones: {
    incoming: ["El cuadro de luces del fondo es un señuelo.", "Detrás hay una puerta que no deberíais poder abrir."],
    // nodo terminal de momento: aquí sigue el guion cuando lo tengas
  },
};
