# Puzzles: "EL libro PERDIDO" (Santas Ochova)

> Hoja tipo Excel de **todas las piezas**. Una fila por puzzle/pieza. Alimenta directamente al minimapa
> (columna **"Leer"** → popup del botón Leer; **Solución** → el OTP alfanumérico; **"Descripción"** → panel de
> Información; **Nota** → el programa Notas) y al montaje físico (sobres numerados).
>
> Pre-rellenado solo lo **estructural** ya decidido (Sala, Dependencia y los items/info que da o pide, de la
> cadena en `hoja-de-ruta.md`). El resto está en blanco (`—`) para que lo completes. `Puzzle` es un id corto
> para poder referirse a cada fila; los **5 esenciales** van marcados con ⭐ (llevan los beats del lore, §2:
> peli 1966 → libro 1975 → corrección 1976 → nota → cámara).

| Puzzle | Qué es (físico) | "Leer" (enunciado) | "Descripción" (panel) | Solución (OTP) | Dónde se encuentra | Nº sobre | Nota (→ Notas) | Sala | Dependencia |
|---|---|---|---|---|---|---|---|---|---|
| Almacén 1 | — | — | — | — | — | — | — | Almacén de tienda | — |
| Máquinas 1 | — | — | — | — | — | — | — | Sala de Máquinas | — |
| Máquinas 2 | — | — | — | — | — | — | — | Sala de Máquinas | — |
| Biblioteca 1 | — | — | — | — | — | — | — | Biblioteca privada | — |
| Proyecto 1 | — | — | — | — | — | — | — | Proyecto de sala de lectura | — |
| Proyecto 2 | — | — | — | — | — | — | — | Proyecto de sala de lectura | — |
| Proyecto 3 | — | — | — | — | — | — | — | Proyecto de sala de lectura | — |
| ⭐ Depósito 1 | — | — | — | — | — | — | — | Depósito | **Da: INFO para el Despacho** |
| ⭐ Despacho (cajón) | carta + sobre con código | — | — | — | — | — | — | Despacho | Requiere **INFO del Depósito** · Da: golpe de llaves (cajón) que abre el Sótano |
| ⭐ Sótano 1 | — | — | — | — | — | — | — | Sótano | Entra con ~5-6 llaves (golpe del Despacho) · Da: **item Tarjeta de seguridad del Almacén** |
| ⭐ Librería 1 | — | — | — | — | — | — | — | Librería | Requiere **item Tarjeta de seguridad del Almacén** · Da: **INFO para La Cámara** |
| Antesala 1 | — | — | — | — | — | — | — | Antesala | Requiere **INFO de la Librería** para pasar a La Cámara (rol concreto por definir) |
| ⭐ Cámara 1 | — | — | — | — | — | — | — | La Cámara | Requiere **INFO de la Librería** · Da: ***La jauría humana* (1975)** + **Llave Maestra** → salida + voto |

## Notas de uso

- **Solución (OTP)**: la combinación alfanumérica que valida el puzzle en el minimapa. Cuando estén, las
  guardaremos también en los datos del código (hoy hay solo placeholders).
- **Nº sobre**: el sobre físico cerrado que abre esa pieza de info ("Abre el sobre 21").
- **Nota (→ Notas)**: fragmento numerado de la historia que suelta al resolverse; leídas en orden = la verdad.
  Los ⭐ esenciales cargan los beats del lore; los secundarios, tejido conectivo.
- **Dependencia**: qué info/item de otra sala hace falta para entender/resolver el puzzle (y, de paso, qué
  entrega). Es lo que fuerza el orden único (ver el grafo de `hoja-de-ruta.md`).
