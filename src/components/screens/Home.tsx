import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { menuNav } from "../../terminal/input";

// Opciones del menú de inicio. target = id de una pantalla del registro SCREENS; sin target = aún sin
// pantalla (Tienda/Notas/Registro/Fases): se muestran pero no navegan.
const OPEN_DELAY = 250; // ms que la opción se queda en AZUL antes de abrir el programa (para que se vea la selección)
const HOME_OPTS: { label: string; target?: string; icon: string }[] = [
  { label: "Tienda", icon: "/icons/internet.png" },      // tienda online del juego (icono html)
  { label: "Notas", icon: "/icons/notepad.png" },
  { label: "Registro", icon: "/icons/printer.png" },     // chat con el informante (tipo Lifeline)
  { label: "NeoTerminal2", target: "terminal", icon: "/icons/terminal.png" },
  { label: "Fases", icon: "/icons/fases.png" },          // icono helpbook
];

// Pantalla HOME: escritorio Win98 (fondo teal liso) con un menú de botones centrado, navegable SOLO con
// flechas + OK (nada táctil, como todo el ordenador). Es un screen más del registro: se monta/desmonta
// como los demás y salta a otra pantalla por el servicio navigate del armazón.
const Home = forwardRef<ScreenHandle, ScreenServices>(function Home({ navigate }, ref) {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0); // el handle lee de aquí (no del state) para no capturar un active viejo

  const setActiveBoth = (i: number) => {
    activeRef.current = i;
    setActive(i);
  };
  const select = (i: number) => {
    setActiveBoth(i); // marca la opción en azul (selección Win98)
    const t = HOME_OPTS[i].target;
    if (!t) return; // sin pantalla aún (placeholder): solo se queda seleccionada
    window.setTimeout(() => navigate(t), OPEN_DELAY); // espera para que se VEA el azul y luego abre el programa
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
    isLoading: () => false,
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
          </button>
        ))}
      </nav>
    </div>
  );
});

export default Home;
