// FUENTE DE VERDAD del contenido del juego "EL libro PERDIDO" (Santas Ochova): los 21 puzzles + los 2 items
// especiales. Pensado para que el minimap, los candados y (pronto) el programa Notas LEAN de aquí, en vez de
// tener los combos/tipos repartidos en mapas sueltos.
//
// ESTADO (día 4): ESQUELETO. Pre-rellenado solo lo ESTRUCTURAL que ya está clavado en los docs (sala, qué da,
// dependencias conocidas). El CONTENIDO se rellena puzzle a puzzle (día 5, recorriendo las rutas desde el
// Almacén): el `kind` real del candado, el `combo` (solución), `leer` (enunciado), `descripcion` y la `nota`
// de lore. Lo que falta queda en "" / [] o anotado como "(por definir)".
//
// La numeración `n` (1..21) y el `room` CASAN con la topología del minimap (Minimap.tsx):
//   PUZZLE_ORDER = [hub-almacen, r3, r4, r2, r1, r6, r5, libreria, r7, r8]  → Puzzle N = base(sala) + índice.
// Referencias de diseño: docs/hoja-de-ruta.md (§3-5, contratos y economía) y docs/puzzles.md (Tabla 1/2).

export type LockKind = "number" | "letters" | "geometry" | "rotary";

// combo = solución que abre el candado, según el tipo:
//   number   → un dígito por rueda (p. ej. [8,7,5,9,0] = "87590")
//   letters  → palabra en MAYÚSCULAS (p. ej. "HELLO")
//   geometry → índices de forma 0..8 (ver SHAPES en GeometryLock.tsx)
//   rotary   → números 0..39 a alinear EN ORDEN (p. ej. [20,5,30])
export type Combo = number[] | string;

export type Puzzle = {
  n: number;            // nº global 1..21 (= "Puzzle N" del minimap)
  room: string;         // id de sala (casa con Minimap ROOMS: hub-almacen, r1..r8, libreria)
  roomName: string;     // nombre legible (solo referencia; el canónico está en Minimap ROOMS)
  titulo?: string;      // nombre visible del puzzle en el desplegable de "Llaves" (si no, "Puzzle N")
  kind: LockKind;       // tipo de candado. DEFAULT "number"; se ajusta al diseñar cada puzzle
  combo: Combo;         // solución. POR RELLENAR ([] / "")
  leer: string;         // enunciado del botón "Leer" (popup). POR RELLENAR
  descripcion: string;  // texto del panel "Descripción". POR RELLENAR
  da: string;           // qué suelta al resolverse (+1 llave / ITEM / INFO)
  dependeDe?: string;   // info/item de OTRA sala que necesita (capa-2: fuerza la ruta única)
  nota?: string;        // fragmento de lore que se añade al programa "Notas". POR RELLENAR
  objetos?: string[];   // ids de piezas físicas que usa (ver ITEMS y Tabla 2 de puzzles.md)
};

export type Item = {
  id: string;
  nombre: string;
  da: string;           // qué desbloquea
  seConsigueEn: string; // sala/puzzle donde se obtiene
};

// Items especiales (SOLO 2, ver hoja-de-ruta.md §5).
export const ITEMS: Item[] = [
  { id: "tarjeta-seguridad", nombre: "Tarjeta de seguridad del Almacén", da: "abre la puerta Almacén → Librería", seConsigueEn: "Sótano (Puzzle 15)" },
  { id: "llave-maestra", nombre: "Copia de la Llave Maestra", da: "abre la salida final → voto grupal", seConsigueEn: "La Cámara (Puzzle 21)" },
];

// Fábrica: fija los campos "por rellenar" (combo/leer/descripcion/nota) para no repetirlos en cada puzzle.
const p = (n: number, room: string, roomName: string, da: string, dependeDe?: string, objetos?: string[]): Puzzle =>
  ({ n, room, roomName, kind: "number", combo: [] as number[], leer: "", descripcion: "", da, dependeDe, nota: "", objetos });

export const PUZZLES: Puzzle[] = [
  // ── Almacén de tienda (inicio; tronco) ──
  { n: 1, room: "hub-almacen", roomName: "Almacén de tienda", titulo: "Cuadro eléctrico", kind: "letters", combo: "OPMEIT", // TIEMPO al revés (la "RESPUESTA" de la tarjeta FÍSICA va en espejo). El acertijo NO va en la app: está en la tarjeta
    leer: "El cuadro de luces es un señuelo: al abrir la portezuela no hay interruptores, sino el frontal de una caja metálica empotrada en la pared, cerrada con un candado. Al lado, clavada con una chincheta en el yeso, hay una pequeña nota.",
    descripcion: "Al fondo, tras una columna, hay un cuadro eléctrico. Una tapa de plástico cerrada, con algo escrito a rotulador en el centro: «Interruptores de la librería · No apagar».",
    da: "+1 llave (con ella se elige ruta norte/sur)", nota: "" },

  // ── Biblioteca privada (norte) ──
  p(2, "r3", "Biblioteca privada", "+1 llave"),
  p(3, "r3", "Biblioteca privada", "+1 llave"),

  // ── Depósito (norte): los 3 dan llave PERO están info-bloqueados hasta después del Sótano (backtracking).
  //    Como conjunto, el Depósito da "lo necesario para abrir el Despacho" (qué puzzle exactamente: por definir). ──
  p(4, "r4", "Depósito", "+1 llave", "info de la Librería (se resuelve en el backtracking)"),
  p(5, "r4", "Depósito", "+1 llave", "info de la Librería (se resuelve en el backtracking)"),
  p(6, "r4", "Depósito", "+1 llave · (conjunto) abre el Despacho", "info de la Librería (backtracking)"),

  // ── Proyecto de sala de lectura (sur; nudo) ──
  p(7, "r2", "Proyecto de sala de lectura", "+1 llave"),
  p(8, "r2", "Proyecto de sala de lectura", "+1 llave"),
  p(9, "r2", "Proyecto de sala de lectura", "+1 llave"),
  p(10, "r2", "Proyecto de sala de lectura", "+1 llave", "≥1 de los del Proyecto necesita info de otra sala (por definir cuál)"),

  // ── Sala de Máquinas (sur) ──
  p(11, "r1", "Sala de Máquinas", "+1 llave"),
  p(12, "r1", "Sala de Máquinas", "+1 llave"),

  // ── Despacho (sur; fin de la 1ª mitad). Además de los 2 puzzles, hay un "cajón": código físico → golpe de
  //    llaves de una vez (mecánica aparte, no puzzle). El último puzzle revela la puerta SECRETA a la Antesala. ──
  p(13, "r6", "Despacho", "+1 llave"),
  p(14, "r6", "Despacho", "+1 llave · revela la puerta SECRETA Despacho→Antesala", "info del Sótano (REVISAR con el checker: posible circularidad, el Sótano es posterior en la ruta)"),

  // ── Sótano (norte; callejón; muro de ~5-6 llaves). Da el primer ITEM. ──
  p(15, "r5", "Sótano", "+1 llave · ITEM Tarjeta de seguridad · info para el Despacho", "5-6 llaves para romper el muro", ["tarjeta-seguridad"]),

  // ── Librería (sala avanzada; se abre con la Tarjeta). Da la INFO que desbloquea los puzzles info-bloqueados. ──
  p(16, "libreria", "Librería", "+1 llave · INFO para puzzles bloqueados de otras salas", "ITEM Tarjeta de seguridad (abre la Librería)"),
  p(17, "libreria", "Librería", "+1 llave · INFO"),
  p(18, "libreria", "Librería", "+1 llave · INFO"),

  // ── Antesala (sur) ──
  p(19, "r7", "Antesala", "+1 llave"),
  p(20, "r7", "Antesala", "+1 llave", "info de la Librería"),

  // ── La Cámara (sur; callejón; meta). Da el ITEM final. ──
  p(21, "r8", "La Cámara", "+1 llave · ITEM Copia de la Llave Maestra + la verdad de Higgins/Ruby", "info de la Librería", ["llave-maestra"]),
];

// Helpers para cuando cablemos el minimap a este modelo (día 5).
export const puzzleByN = (n: number): Puzzle | undefined => PUZZLES.find((x) => x.n === n);
export const puzzlesInRoom = (room: string): Puzzle[] => PUZZLES.filter((x) => x.room === room);
