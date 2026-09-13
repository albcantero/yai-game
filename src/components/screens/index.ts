import type { ComponentType, RefAttributes } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import Home from "./Home";
// import Terminal from "./Terminal"; // MVP: NeoTerminal2 fuera de momento (comentado, no borrado)
// import Placeholder from "./Placeholder"; // MVP: solo lo usaba la Tienda (comentada abajo)
import Minimap from "./Minimap";
import Fax from "./Fax";
import Notas from "./Notas";

// Registro de pantallas montables sobre el armazón. Añadir una pantalla = un componente
// forwardRef<ScreenHandle, ScreenServices> + una entrada aquí. El armazón monta SCREENS[view].Component
// genéricamente y pinta su VENTANA (barra de título con icono + nombre + X) desde estos datos. Tienda/
// Notas/Registro/Fases son de momento placeholders (cuerpo en blanco) que comparten el componente Placeholder.
export interface ScreenDef {
  label: string;
  title?: string; // texto de la barra de título de la ventana; home no tiene ventana (no se pinta)
  icon?: string; // icono (16px) de la barra de título
  Component: ComponentType<ScreenServices & RefAttributes<ScreenHandle>>;
}

export const SCREENS = {
  home: { label: "Home", Component: Home },
  // terminal: { label: "Terminal", title: "santasochova-term.exe", icon: "/icons/term.png", Component: Terminal }, // MVP: NeoTerminal2 fuera de momento (comentado, no borrado)
  // tienda: { label: "Tienda", title: "Tienda - Internet Explorer", icon: "/icons/internet-sm.png", Component: Placeholder }, // MVP: Tienda fuera de momento (comentada, no borrada)
  notas: { label: "Notas", title: "Notas", icon: "/icons/notepad-sm.png", Component: Notas },
  registro: { label: "Fax Electrónico", title: "Fax Electrónico", icon: "/icons/printer-sm.png", Component: Fax },
  fases: { label: "Libro de Juego", title: "Libro de Juego", icon: "/icons/fases-sm.png", Component: Minimap }, // PROVISIONAL: cuelgo aquí el minimapa para verlo; ya decidiremos su sitio
} satisfies Record<string, ScreenDef>;

export type ScreenId = keyof typeof SCREENS;
