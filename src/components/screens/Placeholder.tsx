import { forwardRef, useImperativeHandle } from "react";
import type { ScreenHandle, ScreenServices } from "./types";

// Pantalla PLACEHOLDER: cuerpo en blanco. La ventana (barra de título con icono + nombre + X) la pinta
// el armazón desde el registro SCREENS; aquí solo va el contenido, aún vacío. Lo comparten Tienda, Notas,
// Registro y Fases (cambia su ventana, no el cuerpo). Implementa el handle mínimo para encajar en el registro.
const Placeholder = forwardRef<ScreenHandle, ScreenServices>(function Placeholder(_props, ref) {
  useImperativeHandle(ref, () => ({
    handleKey: () => {},
    setPaused: () => {},
  }), []);
  return <div className="placeholder-screen" />;
});

export default Placeholder;
