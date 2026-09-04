export type LineClass = "" | "b" | "muted" | "d";

/** Contexto que recibe cada comando para hablar con la terminal. */
export interface Ctx {
  /** Imprime una línea instantánea. */
  print: (text: string, cls?: LineClass) => void;
  /** Vacía la pantalla. */
  clear: () => void;
  /** Reproduce un diálogo por partes (con chevron de continuar). */
  startDialog: (lines: string[]) => void;
  /** Argumentos tras el nombre del comando ("978" en "/buscar 978"). */
  arg: string;
  /** La línea completa tal cual se escribió. */
  raw: string;
}

export interface Command {
  /** Nombres/alias, con la barra incluida (p. ej. ["/help", "/ayuda"]). */
  names: string[];
  /** Firma que se muestra en /help (por defecto, el primer nombre). */
  usage?: string;
  /** Descripción corta para /help. */
  desc?: string;
  /** Si es true, no aparece en /help (comandos secretos). */
  hidden?: boolean;
  run: (ctx: Ctx) => void;
}
