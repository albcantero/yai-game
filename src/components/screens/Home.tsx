import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { animate, stagger } from "motion";
import type { ScreenHandle, ScreenServices } from "./types";
import { menuNav } from "../../terminal/input";

// Opciones del menú de inicio. target = id de una pantalla del registro SCREENS; sin target = aún sin
// pantalla (Tienda/Fases): se muestran pero no navegan.
const OPEN_DELAY = 250; // ms que la opción se queda en AZUL antes de abrir el programa (para que se vea la selección)
const HOME_OPTS: { label: string; target?: string; icon: string }[] = [
  { label: "Tienda", icon: "/icons/internet.png" },      // tienda online del juego (icono html)
  { label: "Notas", icon: "/icons/notepad.png" },
  { label: "Registro", icon: "/icons/printer.png" },     // chat con el informante (tipo Lifeline)
  { label: "NeoTerminal2", target: "terminal", icon: "/icons/terminal.png" },
  { label: "Fases", icon: "/icons/fases.png" },          // icono helpbook
];

// Pantalla HOME: fondo pixelart (SVG) + título "EL libro PERDIDO" ("PERDIDO" ondula letra a letra con
// Motion) + menú de botones pixel, navegable con flechas + OK y tocable. Es un screen más del registro:
// se monta/desmonta como los demás y salta a otra pantalla por el servicio navigate del armazón.
const Home = forwardRef<ScreenHandle, ScreenServices>(function Home({ playSfx, navigate }, ref) {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0); // el handle lee de aquí (no del state) para no capturar un active viejo
  const titleRef = useRef<HTMLHeadingElement | null>(null);

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

  // "PERDIDO" ondula letra a letra en bucle (Motion). controls.stop() al desmontar la pantalla.
  useEffect(() => {
    const chars = titleRef.current?.querySelectorAll(".ch");
    if (!chars || !chars.length) return;
    const controls = animate(
      chars,
      { y: [0, -24, 0] },
      { duration: 2.6, delay: stagger(0.08), repeat: Infinity, ease: "easeInOut" },
    );
    return () => controls.stop();
  }, []);

  return (
    <div className="home-screen">
      <div className="home__content">
        <h1 className="home__title" ref={titleRef}>
          <span className="line">EL libro</span>
          <span className="line line--wavy" aria-label="PERDIDO">
            {"PERDIDO".split("").map((c, i) => (
              <span className="ch" aria-hidden="true" key={i}>
                {c}
              </span>
            ))}
          </span>
        </h1>
        <nav className="home__menu win98">
          {HOME_OPTS.map((opt, i) => (
            <button
              type="button"
              key={i}
              className={active === i ? "is-active" : undefined}
              onPointerDown={() => {
                playSfx("/audio/mouse-click.mp3");
                select(i); // select ya marca el azul y abre tras OPEN_DELAY
              }}
            >
              <img className="home__menu-icon" src={opt.icon} alt="" />
              {opt.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
});

export default Home;
