import type { ComponentType, RefAttributes } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import Terminal from "./Terminal";

// Registro de pantallas montables sobre el armazón. Añadir una pantalla = un componente
// forwardRef<ScreenHandle, ScreenServices> + una entrada aquí. El armazón monta SCREENS[view].Component
// genéricamente y habla con la activa por un solo ref; no hay que re-cablear el armazón por cada pantalla.
export interface ScreenDef {
  label: string;
  Component: ComponentType<ScreenServices & RefAttributes<ScreenHandle>>;
}

export const SCREENS = {
  terminal: { label: "Terminal", Component: Terminal },
  // tienda: { label: "Tienda", Component: Shop },
  // fases:  { label: "Fases",   Component: Lobby },
} satisfies Record<string, ScreenDef>;

export type ScreenId = keyof typeof SCREENS;
