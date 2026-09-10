import type { MutableRefObject } from "react";

// Estado de Mayús del teclado en pantalla: off=minúsculas, shift=una letra, caps=bloqueo.
export type ShiftMode = "off" | "shift" | "caps";

// Config de un CANDADO que una pantalla pide abrir al armazón (combinación + qué hacer al acertar).
export interface LockConfig {
  combo: number[]; // combinación correcta (índices por rueda: números 0..9, letras 0..26, o formas 0..7)
  kind?: "number" | "letters" | "geometry"; // tipo de candado (default "number")
  onSolved: () => void; // combo correcto: la pantalla resuelve su puzzle (y el armazón cierra el overlay)
}

// Servicios que el ARMAZÓN (Computer) da a cada pantalla montada encima (entradas: audio + shift).
export interface ScreenServices {
  playSfx: (src: string, vol?: number) => void;
  shiftModeRef: MutableRefObject<ShiftMode>;
  consumeShift: () => void;
  navigate: (id: string) => void; // saltar a otra pantalla del registro por su id (lo usa el menú de Home)
  openLock: (config: LockConfig) => void; // abrir el candado (oscurece + pausa la pantalla, MISMO proceso que la "X")
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
  setPaused: (v: boolean) => void; // el armazón pausa/reanuda al abrir menú/diálogo
}
