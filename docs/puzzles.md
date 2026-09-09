# Puzzles: "EL libro PERDIDO" (Santas Ochova)

> Dos tablas relacionadas (como en una BD), porque **objeto físico ≠ puzzle** (no es 1:1: un puzzle puede usar
> varias piezas, y una pieza puede servir a varios puzzles):
>
> - **Tabla 1 — Puzzles**: el reto digital del minimapa (enunciado, solución OTP, sala, qué da, dependencia).
> - **Tabla 2 — Objetos / pistas / herramientas**: las piezas físicas (qué son, dónde/sobre, tipo).
>
> El enlace vive en **una sola** columna: en la Tabla 1, "Objetos que usa" lista los ids de la Tabla 2.
>
> Alimenta al minimapa (columna **"Leer"** → popup; **Solución** → OTP; **"Descripción"** → panel; **Nota** →
> programa Notas). Pre-rellenado solo lo **estructural** ya decidido (Sala, Da, Depende de). El resto en blanco
> (`—`). **20 puzzles**, placeholders "Puzzle N" con numeración global; los **5 esenciales** van con ⭐ (cargan
> los beats del lore, orden §2 del lore: peli 1966 → libro 1975 → corrección 1976 → nota → cámara).

## Tabla 1 — Puzzles (reto digital)

| Puzzle | Sala | "Leer" (enunciado) | "Descripción" (panel) | Solución (OTP) | Objetos que usa | Da (info/item/llave) | Nota (→ Notas) | Depende de |
|---|---|---|---|---|---|---|---|---|
| Puzzle 1 | Almacén de tienda | — | — | — | — | +1 llave (con ella eliges norte/sur) | — | — |
| Puzzle 2 | Biblioteca privada | — | — | — | — | +1 llave | — | — |
| ⭐ Puzzle 3 | Depósito | — | — | — | — | +1 llave + **INFO para el Despacho** | — | — |
| Puzzle 4 | Sala de Máquinas | — | — | — | — | +1 llave | — | — |
| Puzzle 5 | Sala de Máquinas | — | — | — | — | +1 llave | — | — |
| Puzzle 6 | Proyecto de sala de lectura | — | — | — | — | +1 llave | — | — |
| Puzzle 7 | Proyecto de sala de lectura | — | — | — | — | +1 llave | — | — |
| ⭐ Puzzle 8 (cajón) | Despacho | — | — | (código) | carta del cajón | **GOLPE de llaves (~+5)** → abre el Sótano | — | **INFO del Depósito** |
| Puzzle 9 | Sótano | — | — | — | — | +1 llave | — | **5 llaves** (golpe del Despacho) |
| Puzzle 10 | Sótano | — | — | — | — | +1 llave | — | — |
| ⭐ Puzzle 11 | Sótano | — | — | — | — | +1 llave + **ITEM Tarjeta de seguridad del Almacén** | — | — |
| Puzzle 12 | Librería | — | — | — | — | +1 llave | — | **ITEM Tarjeta de seguridad** |
| Puzzle 13 | Librería | — | — | — | — | +1 llave | — | — |
| ⭐ Puzzle 14 | Librería | — | — | — | — | +1 llave + **INFO para La Cámara** | — | — |
| Puzzle 15 | Antesala | — | — | — | — | +1 llave | — | **INFO de la Librería** |
| Puzzle 16 | Antesala | — | — | — | — | +1 llave | — | — |
| Puzzle 17 | Antesala | — | — | — | — | +1 llave | — | — |
| Puzzle 18 | La Cámara | — | — | — | — | +1 llave | — | **INFO de la Librería** |
| Puzzle 19 | La Cámara | — | — | — | — | +1 llave | — | — |
| ⭐ Puzzle 20 | La Cámara | — | — | — | La jauría humana (1975) | +1 llave + **ITEM Llave Maestra** → salida + voto | — | — |

## Tabla 2 — Objetos / pistas / herramientas (piezas físicas)

| Objeto | Qué es (físico) | Tipo | Cómo se consigue (sobre nº · o "al resolver X") | Sala | Notas |
|---|---|---|---|---|---|
| Tarjeta de seguridad del Almacén | — | item especial | al resolver Puzzle 11 (Sótano) | Sótano | abre la puerta Almacén → Librería |
| Llave Maestra | — | item especial | al resolver Puzzle 20 (La Cámara) | La Cámara | abre la salida final → voto |
| La jauría humana (1975, "Hawes") | libro físico real (Plaza y Janés, 1975) | objeto/pista clave | en La Cámara (Puzzle 20) | La Cámara | el "libro perdido"; núcleo del lore |
| Carta del cajón | carta impresa + sobre con código | pista | en el Despacho | Despacho | el código suelta el golpe de llaves (Puzzle 8) |
| — | — | — | — | — | (añadir pistas/herramientas/objetos según se diseñen los puzzles) |

## Notas de uso

- **Solución (OTP)**: la combinación alfanumérica que valida el puzzle en el minimapa (hoy placeholders; luego
  a los datos del código).
- **Objetos que usa**: ids de la Tabla 2 que hacen falta para resolver ese puzzle (pueden ser varios).
- **Nº sobre**: propiedad del **objeto** (Tabla 2), no del puzzle ("Abre el sobre 21").
- **Nota (→ Notas)**: fragmento numerado de la historia que suelta al resolverse; en orden = la verdad. Los ⭐
  esenciales cargan los beats del lore; los secundarios, tejido conectivo.
- **Depende de**: qué info/item de otra sala hace falta (lo que fuerza el orden único; ver el grafo de `hoja-de-ruta.md`).
- **Salas avanzadas** (Sótano, Librería, Antesala, La Cámara) tienen 3 puzzles: sus llaves no gatean nada nuevo
  (los muros ya pasaron), valen sobre todo por sus **notas** (densidad de historia en el clímax).
