import type { MutableRefObject } from "react";

// Servicios que el ARMAZÓN (Computer) da a cada pantalla montada encima (entradas: audio + shift).
export interface ScreenServices {
  playSfx: (src: string, vol?: number) => void;
  shiftModeRef: MutableRefObject<"off" | "shift" | "caps">;
  consumeShift: () => void;
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
