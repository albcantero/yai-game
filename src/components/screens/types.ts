import type { MutableRefObject } from "react";

// Servicios que el ARMAZÓN (Computer) da a cada pantalla montada encima (entradas: audio + shift).
export interface ScreenServices {
  playSfx: (src: string, vol?: number) => void;
  shiftModeRef: MutableRefObject<"off" | "shift" | "caps">;
  consumeShift: () => void;
  navigate: (id: string) => void; // saltar a otra pantalla del registro por su id (lo usa el menú de Home)
}

// Formulario TUI (login, y el compose del chat): campos + acción (Enviar/Conectar) + Salir, navegable
// con caret. Compartido entre Terminal (motor + render) y useChat (que arma el compose del hilo).
export interface Field {
  label: string;
  value: string;
  mask?: boolean; // enmascara el valor (contraseña)
  nocheck?: boolean; // no muestra el [✓] a la izquierda (p. ej. el campo de mensaje del chat)
}
export interface FormState {
  fields: Field[];
  active: number;
  editing: boolean;
  submitLabel?: string; // etiqueta de la acción principal (Conectar/Enviar); se bloquea con candado si falta rellenar
  onSubmit: (values: string[]) => void;
  onCancel?: () => void; // acción de "Salir"; si falta, cancela con el eco por defecto (login)
}

// Handle que cada pantalla EXPONE al armazón vía useImperativeHandle (salidas: teclas, comandos,
// estado de carga, pausa). El armazón habla con la pantalla activa por UN solo ref de este tipo, en
// vez de un puñado de refs sueltos asignados en el render. Añadir una pantalla nueva = implementar esto.
export interface ScreenHandle {
  handleKey: (k: string) => void; // el armazón despacha aquí las teclas cuando esta pantalla está activa
  runCmd?: (cmd: string) => void; // opcional: el menú lateral del armazón ejecuta un comando aquí
  isLoading: () => boolean; // ¿hay un loader? (el armazón bloquea sus botones)
  setPaused: (v: boolean) => void; // el armazón pausa/reanuda al abrir menú/diálogo
}
