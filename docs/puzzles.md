# Puzzles: "EL libro PERDIDO" (Santas Ochova)

> Dos tablas relacionadas (como en una BD), porque **objeto físico ≠ puzzle** (no es 1:1: un puzzle puede usar
> varias piezas, y una pieza puede servir a varios puzzles):
>
> - **Tabla 1 — Puzzles**: el reto digital del minimapa (enunciado, solución OTP, sala, qué da, dependencia).
> - **Tabla 2 — Objetos / pistas / herramientas**: las piezas físicas (qué son, dónde/sobre, tipo).
>
> El enlace vive en **una sola** columna: en la Tabla 1, "Objetos que usa" lista los ids de la Tabla 2.
>
> Alimenta al minimapa ("Leer" → popup; **Solución** → OTP; "Descripción" → panel; **Nota** → programa Notas).
> **1ª mitad = 14 puzzles** (números de Alberto, ya cableados). **2ª mitad = POR DEFINIR** (provisional 3 c/u).
> Pre-rellenado solo lo estructural; el resto en blanco (`—`). El **mapa de info** (columna "Depende de") es lo
> que hay que clavar para que la economía no se ahogue.

## Tabla 1 — Puzzles (reto digital)

| Puzzle | Sala | "Leer" (enunciado) | "Descripción" (panel) | Solución (OTP) | Objetos que usa | Da (info/item/llave) | Nota (→ Notas) | Depende de |
|---|---|---|---|---|---|---|---|---|
| Puzzle 1 | Almacén de tienda | — | — | — | — | +1 llave (con ella eliges norte/sur) | — | — |
| Puzzle 2 | Biblioteca privada | — | — | — | — | +1 llave | — | — |
| Puzzle 3 | Biblioteca privada | — | — | — | — | +1 llave | — | — |
| Puzzle 4 | Depósito | — | — | — | — | +1 llave | — | **info de otra sala** (por definir) |
| Puzzle 5 | Depósito | — | — | — | — | +1 llave | — | **info de otra sala** (por definir) |
| Puzzle 6 | Depósito | — | — | — | — | +1 llave | — | **info de otra sala** (por definir) |
| Puzzle 7 | Proyecto de sala de lectura | — | — | — | — | +1 llave | — | — |
| Puzzle 8 | Proyecto de sala de lectura | — | — | — | — | +1 llave | — | — |
| Puzzle 9 | Proyecto de sala de lectura | — | — | — | — | +1 llave | — | — |
| Puzzle 10 | Proyecto de sala de lectura | — | — | — | — | +1 llave | — | **info de otra sala** (por definir) |
| Puzzle 11 | Sala de Máquinas | — | — | **rotary** · sol. = Habitación 7 (cuadernillo) | Sobre 2 | +1 llave | — | — |
| Puzzle 12 | Sala de Máquinas | — | — | — | — | +1 llave | — | — |
| Puzzle 13 | Despacho | — | — | **rotary** · sol. = Habitación 8 (cuadernillo) | Sobre 2 | +1 llave | — | — |
| Puzzle 14 | Despacho | — | — | — | — | +1 llave | — | **info del Sótano** (revela la puerta secreta a la Antesala) |
| Puzzle 15 | Sótano | — | — | **rotary** · sol. = Habitación 4 (cuadernillo) | Sobre 2 | +1 llave + **ITEM Tarjeta de seguridad** + info para el Despacho | — | — |
| Puzzle 16 | Librería | — | — | — | — | +1 llave + **info** para puzzles bloqueados | — | Librería por ITEM Tarjeta |
| Puzzle 17 | Librería | — | — | — | — | +1 llave + **info** | — | — |
| Puzzle 18 | Librería | — | — | — | — | +1 llave + **info** | — | — |
| Puzzle 19 | Antesala | — | — | — | — | +1 llave | — | — |
| Puzzle 20 | Antesala | — | — | — | — | +1 llave | — | **info de la Librería** |
| Puzzle 21 | La Cámara | — | — | — | — | +1 llave + **Copia de la Llave Maestra** | — | **info de la Librería** |

**Candado FINAL** (entre la Librería y el FIN): coste = **llaves libres** (Σ llaves − Σ candados ≈ 5) + la **Copia
de la Llave Maestra**. Fuerza a resolver los 21 puzzles antes de acabar → voto. La puerta **Despacho→Antesala** es
SECRETA: se revela al resolver el último puzzle del Despacho.

> **Sobre 2 (cuadernillo de arquitecto)** → sus 3 problemas grapados son candados **rotary**: *Habitación 7* = Sala de Máquinas (nº 7), *Habitación 8* = Despacho (nº 8), *Habitación 4* = Sótano (nº 4); las jugadoras deducen el match por el número de habitación. En Máquinas y Despacho (2 puzzles c/u) el rotary está **provisionalmente** en el primero (11 y 13): confirmar cuál de los dos. El "123 = 0 1 23" escrito a bolígrafo indica cómo meter la respuesta en el dial.

## Tabla 2 — Objetos / pistas / herramientas (piezas físicas)

| Objeto | Qué es (físico) | Tipo | Cómo se consigue (sobre nº · o "al resolver X") | Sala | Notas |
|---|---|---|---|---|---|
| Tarjeta de seguridad del Almacén | — | item especial | al resolver Puzzle 15 (Sótano) | Sótano | bloquea/desbloquea la compuerta de seguridad: abre Almacén → Librería |
| Copia de la Llave Maestra de la Librería | — | item especial | al resolver Puzzle 21 (La Cámara) | La Cámara | abre la salida final (junto al candado de llaves libres) → voto |
| La jauría humana (1975, "Hawes") | libro físico real (Plaza y Janés, 1975) | objeto/pista clave | en La Cámara | La Cámara | el "libro perdido"; núcleo del lore |
| Cuadernillo de bocetos de arquitecto | fotocopia de los planos de Santas Ochova (portada/planos) + 3 problemas grapados: **Habitación 7, 8 y 4** | objeto/herramienta (sirve a VARIOS puzzles) | Sobre 2 (se entrega pronto) | — | muestra que existe la cámara oculta (La Cámara); cada "Habitación N" resuelve el **rotary de la sala nº N** (7=Máquinas, 8=Despacho, 4=Sótano) |
| Expediente Miquela Quirós 2023: *La jauría humana* | 3 informes OFICIALES (con expediente/caso/firma): Cap. IV pág. 8 ("Calder"+"Ruby"), portada pág. 9 ("no es el ejemplar"), créditos pág. 10 (© Ediciones G. P. 1976) | documento/pista | Sobre 1 | — | prueba que la ed. de **1976 lleva "Calder"**: NO es el ejemplar buscado (el de **1975 con "Hawes"**). Material numérico: ISBN, depósito legal, caso 161720-B |
| Informe Miquela Quirós 2025: portada del *Compendio* (Horace Faulkner) | informe INÉDITO (sin expediente/caso/sujeto), notas a mano: "¿Dónde está H...?", "¿H. F. = H. F.?", "me estoy volviendo loca" | documento/pista | Sobre 3 | — | conexión **Horace Faulkner = Horton Foote = firma H.F. de Higgins** (ver lore §3.1); contrasta con los oficiales de 2023 |
| Informe en blanco: pista de la caja fuerte (geometryLock) | informe SIN rellenar, garabateado a rotulador: tres-en-raya, notas musicales y un **grid con estrellas**; firmado "H. F." | objeto/pista | Sobre 4 | — | la **posición de las estrellas** en el grid = combinación de un **geometryLock** (sala por definir); otra firma H.F. de Higgins |
| — | — | — | — | — | (añadir más piezas según se diseñen los puzzles) |

## Notas de uso

- **Solución (OTP)**: la combinación alfanumérica que valida el puzzle en el minimapa (hoy placeholders; luego
  a los datos del código).
- **Objetos que usa**: ids de la Tabla 2 que hacen falta para resolver ese puzzle (pueden ser varios).
- **Nº sobre**: propiedad del **objeto** (Tabla 2), no del puzzle ("Abre el sobre 21").
- **Nota (→ Notas)**: fragmento numerado de la historia que suelta al resolverse; en orden = la verdad. Los beats
  del lore (§2 del lore: peli 1966 → libro 1975 → 1976 → nota → cámara) se reparten al fijar el mapa de info.
- **Depende de**: qué info/item de otra sala hace falta. **Es lo crítico**: si un puzzle que da llave depende de
  info que está detrás del muro del Sótano, la economía se ahoga. Verificar con el checker.
