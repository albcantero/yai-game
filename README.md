# Manto Rochoa

Escape room narrativo colaborativo ambientado en la Librería Manto Rochoa (mercado negro de libros). Este repo contiene la parte web.

## Stack

- **Astro** (multipágina, estático) + **islas de React** (TypeScript) para lo interactivo.
- **Courier Pixel** como fuente de la terminal; filtro CRT estilo aleclownes.
- Pensado para desplegar en **Vercel**. El estado compartido multijugador (Supabase) llegará más adelante.

## Estructura

```
public/fonts/           courier-pixel.woff2
src/
  pages/index.astro     monta la terminal
  components/Terminal.tsx  la terminal (isla React, client:load)
  terminal/
    types.ts            tipos del motor de comandos
    commands.ts         registro de comandos (añadir uno = añadir un objeto)
  styles/crt.css        filtro CRT + estilos de la terminal
```

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # genera dist/
```

## Añadir un comando

Edita `src/terminal/commands.ts` y añade un objeto al array `commands`:

```ts
{
  names: ["/estante"],
  usage: "/estante <n>",
  desc: "inspeccionar un estante",
  run: ({ print, arg }) => print("estante " + arg + ": vacío", "muted"),
}
```

`hidden: true` lo oculta de `/help` (comandos secretos por rol).

## Ajustes rápidos

- Intensidad del parpadeo: variable CSS `--flicker-alpha` en `.crt` (`src/styles/crt.css`).
- Tamaño de fuente: `font-size` de `.crt`.

## Pendiente

- Estado compartido con Supabase (multijugador, 8 jugadoras).
- Las otras dos webs: sitio de la librería y lobby de audios.
- Diseño narrativo: roles, ramas de puzzles, revelación final.
