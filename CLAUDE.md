# Escape room "EL libro PERDIDO" — Santas Ochova

App de escape room narrativo (Astro 5 + React island `Terminal.tsx`). Se despliega con
`git push origin main` → Vercel (host `yai-game.vercel.app`).

## Textos del terminal (REGLA FIJA)

- **Las frases del terminal NUNCA terminan en punto ".".** El punto solo puede ir EN MEDIO de una
  frase, para separar dos proposiciones. Nunca punto final.
  - Correcto: `Tu cuenta y/o contraseña son incorrectos. Inténtelo nuevamente` (punto en medio, sin punto final).
  - Incorrecto: `Bienvenido a la librería.` (punto final).
- Excepción: los `...` de los spinners (`Sincronizando...`, `Conectando...`) son indicadores de
  carga, no puntos finales; se dejan tal cual.
- Siguen aplicando las reglas de puntuación española del CLAUDE.md global (no usar "—" como
  separador; ":" para introducir; ";" para proposiciones paralelas).

## Teclado en pantalla

- El teclado (teclas, Mayús, escritura) es **independiente** del estado del terminal: funciona
  siempre, pase lo que pase (incluidos los spinners/loaders). Los botones del monitor (flechas, OK,
  teclado, power) sí respetan el estado (bloqueados durante un loader).
