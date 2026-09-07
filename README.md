# Santas Ochova · EL libro PERDIDO

Escape room narrativo colaborativo ambientado en la librería Santas Ochova (mercado negro de
libros). Este repo contiene la app web: un terminal CRT retro que las jugadoras usan desde el móvil.

## Stack

- **Astro 5** (single-page, estático) + **isla de React 19** (TypeScript) para toda la interacción.
- **Supabase** para el estado multijugador: identidad anónima, login contra tabla propia (RPC) y
  chat en tiempo real (DMs 1-a-1 + sala común).
- **Courier Pixel** como fuente del terminal; CRT (scanlines, flicker, aberración, warp SVG opcional)
  y chrome **Windows 98** (98.css scopeado) para header, menú y diálogos.
- Deploy en **Vercel** con `git push origin main` (host `yai-game.vercel.app`).

## Arquitectura

Una sola página monta **un** componente-armazón que persiste toda la sesión; cada pantalla se monta
encima como un componente que se puede desmontar (montar/desmontar = reinicio limpio, sin tokens).
El armazón permanente mantiene el **AudioContext** vivo entre pantallas (recrearlo por navegación era
lo que congelaba React en iOS).

```
public/           fonts/, audio/, icons/
src/
  pages/index.astro          monta <Computer client:load />
  components/
    Computer.tsx             ARMAZÓN: monitor, teclado, audio, warp, vista home
    screens/
      Terminal.tsx           pantalla del terminal (login, comandos, chat, boot)
                             (futuras: Shop, Lobby...)
  terminal/
    types.ts                 tipos del motor de comandos
    commands.ts              registro de comandos (añadir uno = añadir un objeto)
    banner.txt               logo ASCII del splash
  lib/
    supabase.ts              cliente + login/chat (RPC + realtime)
    rlog.ts                  log remoto de diagnóstico
  styles/
    crt.css                  CRT + estilos del terminal
    98.scoped.css            98.css scopeado bajo .win98 (no toca el terminal)
```

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # genera dist/
```

Config de Supabase por `.env` (no versionado): `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`
(clave publicable, protegida por RLS).

## Añadir un comando

Los comandos se escriben **sin barra** (`help`, no `/help`). Edita `src/terminal/commands.ts` y
añade un objeto al array `commands`:

```ts
{
  names: ["estante"],
  usage: "estante <n>",
  desc: "inspeccionar un estante",
  run: ({ print, arg }) => print("estante " + arg + ": vacío", "muted"),
}
```

`hidden: true` lo oculta de `help` (comandos secretos por rol).

## Reglas de texto del terminal

Las frases del terminal **nunca terminan en punto** (el punto solo va en medio, para separar dos
proposiciones); los `...` de los spinners sí se dejan. Detalle en `CLAUDE.md`.

## Ajustes rápidos

- Intensidad del parpadeo: variable CSS `--flicker-alpha` en `.crt` (`src/styles/crt.css`).
- Tamaño de fuente del terminal: `font-size` de `.crt`.
- Warp CRT: `WARP_ENABLED` en `Computer.tsx`.

## Pendiente

- Las otras dos webs: sitio de la librería y lobby de audios.
- Diseño narrativo: roles, ramas de puzzles, revelación final (6 jugadoras).
