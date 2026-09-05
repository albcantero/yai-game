import type { Command } from "./types";

/**
 * Registro de comandos de la terminal. Añadir uno nuevo = añadir un objeto aquí.
 * Los comandos se escriben SIN barra: solo la palabra (help, catalogo, buscar...).
 * Los que llevan `hidden: true` no salen en la ayuda (comandos secretos por rol).
 */
export const commands: Command[] = [
  {
    names: ["help", "ayuda"],
    usage: "help",
    desc: "esta ayuda",
    run: ({ print }) => {
      print("Comandos disponibles", "b");
      for (const c of commands.filter((x) => !x.hidden)) {
        const sig = (c.usage ?? c.names[0]).padEnd(16, " ");
        print("  " + sig + (c.desc ?? ""));
      }
      print("");
      print("...y no todos los comandos están en esta lista", "muted");
    },
  },
  {
    names: ["catalogo", "catálogo"],
    usage: "catalogo",
    desc: "catálogo público de la librería",
    run: ({ print }) => {
      print("CATÁLOGO PÚBLICO · LIBRERÍA SANTAS OCHOVA", "b");
      print("  978-84-01   Ficciones .......................  12,00 €");
      print("  978-84-02   Cartas a un joven poeta .........   9,50 €");
      print("  978-84-03   El maestro y Margarita ..........  14,00 €");
      print("  978-84-??   [REF. INTERNA] .....  consultar trastienda", "muted");
    },
  },
  {
    names: ["buscar"],
    usage: "buscar <isbn>",
    desc: "localizar un título",
    run: ({ print, sys, arg }) => {
      if (!arg) {
        print("Uso: buscar <isbn>", "muted");
        return;
      }
      if (/00000000|trastienda/i.test(arg)) {
        sys("OK", "Registro interno localizado", "b");
        print("Estante inferior · no consta en el mostrador", "muted");
        return;
      }
      print('Sin resultados para "' + arg + '" en el catálogo público', "muted");
    },
  },
  {
    names: ["login", "entrar"],
    usage: "login",
    desc: "identificarse con tu usuario y clave",
    run: ({ startLogin }) => startLogin(),
  },
  {
    names: ["contacto", "mensaje"],
    usage: "contacto",
    desc: "reproducir el último mensaje entrante",
    run: ({ startDialog }) =>
      startDialog([
        "Escuchadme. No tengo mucho tiempo.",
        "Sé lo que habéis visto con los pedidos especiales.",
        "Voy a daros un número. Ocho cifras.",
        "Buscadlo en las estanterías de abajo. En la trastienda.",
      ]),
  },
  {
    names: ["limpiar", "clear"],
    usage: "limpiar",
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
