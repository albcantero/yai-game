import { useEffect, useRef, useState } from "react";

// Desplegable con aspecto Win98 (caja hundida + botón de flecha), pero con la LISTA renderizada por
// NOSOTROS en el DOM. El <select> nativo pinta su lista en el "top layer" del navegador, fuera del árbol
// de la página: el warp, las scanlines y la viñeta del CRT no la alcanzan (ningún z-index lo arregla).
// Aquí la lista es un <ul> normal DENTRO del tubo, así que recibe el efecto CRT como todo lo demás.
// Uncontrolled: guarda su propia selección (de momento son opciones de ejemplo). Estilos: .crt-select* en minimap.css.
type Props = { options: string[]; defaultValue?: string; ariaLabel?: string };

export default function Win98Select({ options, defaultValue, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? options[0] ?? "");
  const rootRef = useRef<HTMLDivElement>(null);

  // cerrar al tocar/pulsar fuera del control
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  const pick = (o: string) => { setValue(o); setOpen(false); };

  return (
    <div className="crt-select" ref={rootRef}>
      <div className="crt-select-trigger" role="button" tabIndex={0} aria-haspopup="listbox"
        aria-expanded={open} aria-label={ariaLabel} data-open={open || undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
          else if (e.key === "Escape") setOpen(false);
        }}>
        <span className="crt-select-value">{value}</span>
      </div>
      {open && (
        <ul className="crt-select-list" role="listbox">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === value}
              className={o === value ? "is-selected" : undefined}
              onClick={() => pick(o)}>{o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
