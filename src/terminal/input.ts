// Primitivas de entrada compartidas entre pantallas y el armazón (evita reescribir el mismo manejo de
// teclas en cada sitio: línea de comandos, compose de chat, campos de formulario, y navegación de menús).

// Aplica una tecla de EDICIÓN de texto y devuelve el nuevo valor, o null si `k` no es de edición.
// El caller decide dónde escribirlo (setLine / campo del form) y cuándo consumir el shift de un toque.
export function editText(cur: string, k: string, shift: boolean): string | null {
  if (k === "Backspace") return cur.slice(0, -1);
  if (k.length === 1) return cur + (shift ? k.toUpperCase() : k);
  return null;
}

// Nuevo índice activo tras una flecha, con clamp a [0, count-1]. Devuelve el mismo índice si `k` no
// es ArrowUp/ArrowDown (el caller trata Enter/otras por su cuenta).
export function menuNav(active: number, count: number, k: string): number {
  if (k === "ArrowUp") return Math.max(0, active - 1);
  if (k === "ArrowDown") return Math.min(count - 1, active + 1);
  return active;
}
