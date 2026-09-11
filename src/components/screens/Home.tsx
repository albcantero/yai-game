import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { menuNav } from "../../terminal/input";
import { useGameState } from "../../lib/gameState";
import { faxUnread } from "../../game/fax";

// Opciones del menú de inicio. target = id de una pantalla del registro SCREENS. Hoy todas navegan
// (Tienda/Notas/Fax → Placeholder; Terminal; Libro de Juego → Minimap); el guard de `target` opcional se
// conserva como defensa por si en el futuro alguna opción se muestra antes de tener pantalla.
const OPEN_DELAY = 250; // ms que la opción se queda en AZUL antes de abrir el programa (para que se vea la selección)
const HOME_OPTS: { label: string; target?: string; icon: string }[] = [
  { label: "Tienda", target: "tienda", icon: "/icons/internet.png" },      // tienda online del juego (icono html)
  { label: "Notas", target: "notas", icon: "/icons/notepad.png" },
  { label: "Fax Electrónico", target: "registro", icon: "/icons/printer.png" }, // chat con el informante (tipo Lifeline)
  { label: "NeoTerminal2", target: "terminal", icon: "/icons/terminal.png" },
  { label: "Libro de Juego", target: "fases", icon: "/icons/fases.png" },  // icono helpbook
];

// Pantalla HOME: escritorio Win98 (fondo teal liso) con un menú de botones centrado, navegable SOLO con
// flechas + OK (nada táctil, como todo el ordenador). Es un screen más del registro: se monta/desmonta
// como los demás y salta a otra pantalla por el servicio navigate del armazón.
const Home = forwardRef<ScreenHandle, ScreenServices>(function Home({ navigate }, ref) {
  const [active, setActive] = useState(0);
  const gs = useGameState();
  const faxNew = gs ? faxUnread(gs) : false; // aviso de mensajes nuevos en el Fax ("!" a la derecha del botón)
  const activeRef = useRef(0); // el handle lee de aquí (no del state) para no capturar un active viejo
  const openTimerRef = useRef<number | null>(null); // timeout del OPEN_DELAY: se limpia al desmontar

  useEffect(() => () => { if (openTimerRef.current !== null) clearTimeout(openTimerRef.current); }, []);

  const setActiveBoth = (i: number) => {
    activeRef.current = i;
    setActive(i);
  };
  const select = (i: number) => {
    setActiveBoth(i); // marca la opción en azul (selección Win98)
    const t = HOME_OPTS[i].target;
    if (!t) return; // sin pantalla aún (placeholder): solo se queda seleccionada
    openTimerRef.current = window.setTimeout(() => navigate(t), OPEN_DELAY); // espera para que se VEA el azul y luego abre el programa
  };

  // El armazón nos despacha las teclas aquí: las flechas mueven la selección, OK/Enter entra.
  useImperativeHandle(ref, () => ({
    handleKey: (k: string) => {
      if (k === "Enter") {
        select(activeRef.current);
        return;
      }
      const na = menuNav(activeRef.current, HOME_OPTS.length, k);
      if (na !== activeRef.current) setActiveBoth(na);
    },
    setPaused: () => {},
  }), []);

  return (
    <div className="home-screen">
      <nav className="home__menu win98">
        {HOME_OPTS.map((opt, i) => (
          <button
            type="button"
            key={i}
            tabIndex={-1}
            className={active === i ? "is-active" : undefined}
          >
            <img className="home__menu-icon" src={opt.icon} alt="" />
            {opt.label}
            {opt.target === "registro" && faxNew && <span className="home__badge" aria-label="mensajes nuevos">!</span>}
          </button>
        ))}
      </nav>
    </div>
  );
});

export default Home;
