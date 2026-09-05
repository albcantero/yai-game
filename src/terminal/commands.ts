import type { Command } from "./types";

/**
 * Registro de comandos de la terminal. Añadir uno nuevo = añadir un objeto aquí.
 * Los comandos se escriben SIN barra: solo la palabra (login, clean, help...).
 * Los que llevan `hidden: true` no salen en la ayuda (comandos secretos por rol).
 */
export const commands: Command[] = [
  {
    names: ["help", "ayuda"],
    usage: "help",
    desc: "esta ayuda",
    run: ({ print }) => {
      print("Comandos disponibles");
      for (const c of commands.filter((x) => !x.hidden)) {
        const sig = (c.usage ?? c.names[0]).padEnd(16, " ");
        print("  " + sig + (c.desc ?? ""));
      }
      print("");
      print("...y no todos los comandos están en esta lista", "muted");
    },
  },
  {
    names: ["login", "entrar"],
    usage: "login",
    desc: "identificarse en el sistema",
    run: ({ startLogin }) => startLogin(),
  },
  {
    names: ["clean", "clear", "limpiar"],
    usage: "clean",
    desc: "vaciar la pantalla",
    run: ({ clear }) => clear(),
  },
  {
    names: ["acceso", "admin", "root"],
    hidden: true,
    run: ({ print, sys }) => {
      print("");
      sys("ERROR", "Nivel administrador", "d");
      print("Intento registrado", "muted");
    },
  },
];
