import type { ComponentType, RefAttributes } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import Home from "./Home";
import Terminal from "./Terminal";
import Placeholder from "./Placeholder";

// Registro de pantallas montables sobre el armazón. Añadir una pantalla = un componente
// forwardRef<ScreenHandle, ScreenServices> + una entrada aquí. El armazón monta SCREENS[view].Component
// genéricamente y pinta su VENTANA (barra de título con icono + nombre + X) desde estos datos. Tienda/
// Notas/Registro/Fases son de momento placeholders (cuerpo en blanco) que comparten el componente Placeholder.
export interface ScreenDef {
  label: string;
  title?: string; // texto de la barra de título de la ventana; home no tiene ventana (no se pinta)
  icon?: string; // icono (16px) de la barra de título
  confirm?: boolean; // la X pide confirmación (terminal = cerrar sesión) en vez de cerrar directo
  Component: ComponentType<ScreenServices & RefAttributes<ScreenHandle>>;
}

export const SCREENS = {
  home: { label: "Home", Component: Home },
  terminal: { label: "Terminal", title: "santasochova-term.exe", icon: "/icons/term.png", confirm: true, Component: Terminal },
  tienda: { label: "Tienda", title: "Tienda - Internet Explorer", icon: "/icons/internet.png", Component: Placeholder },
  notas: { label: "Notas", title: "Notas", icon: "/icons/notepad.png", Component: Placeholder },
  registro: { label: "Registro", title: "Registro", icon: "/icons/printer.png", Component: Placeholder },
  fases: { label: "Fases", title: "Fases", icon: "/icons/fases.png", Component: Placeholder },
} satisfies Record<string, ScreenDef>;

export type ScreenId = keyof typeof SCREENS;
