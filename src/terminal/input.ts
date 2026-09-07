// Primitivas de entrada compartidas entre pantallas y el armazón (evita reescribir el mismo manejo de
// teclas en cada sitio: línea de comandos, compose de chat, campos de formulario, y navegación de menús).

// Aplica una tecla de EDICIÓN de texto y devuelve el nuevo valor, o null si `k` no es de edición.
// El caller decide dónde escribirlo (setLine / campo del form) y cuándo consumir el shift de un toque.
export function editText(cur: string, k: string, shift: boolean): string | null {
  if (k === "Backspace") return cur.slice(0, -1);
  if (k.length === 1) return cur + (shift ? k.toUpperCase() : k);
  return null;
}

// Nuevo índice activo tras una flecha, con BUCLE (wrap): del último baja al primero y del primero sube
// al último. Devuelve el mismo índice si `k` no es ArrowUp/ArrowDown (el caller trata Enter/otras aparte).
export function menuNav(active: number, count: number, k: string): number {
  if (count <= 0) return active;
  if (k === "ArrowUp") return (active - 1 + count) % count;
  if (k === "ArrowDown") return (active + 1) % count;
  return active;
}
