import { useEffect, useRef, useState } from "react";

// Desplegable con aspecto Win98 (caja hundida + botón de flecha), pero con la LISTA renderizada por
// NOSOTROS en el DOM. El <select> nativo pinta su lista en el "top layer" del navegador, fuera del árbol
// de la página: el warp, las scanlines y la viñeta del CRT no la alcanzan (ningún z-index lo arregla).
// Aquí la lista es un <ul> normal DENTRO del tubo, así que recibe el efecto CRT como todo lo demás.
// Uncontrolled: guarda su propia selección (de momento son opciones de ejemplo). Estilos: .crt-select* en minimap.css.
// Controlado (con `value` + `onChange`) o no controlado (guarda su propia selección). onChange reporta el
// valor y su ÍNDICE, para que el padre sepa qué opción está elegida (p. ej. qué puzzle resolver).
type Props = {
  options: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  ariaLabel?: string;
  hideArrow?: boolean;
};

export default function Win98Select({ options, value, defaultValue, onChange, ariaLabel, hideArrow }: Props) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? options[0] ?? "");
  const controlled = value !== undefined;
  const current = controlled ? value : internal; // valor mostrado (controlado o interno)
  const rootRef = useRef<HTMLDivElement>(null);
  const disabled = options.length <= 1; // una sola opción (o ninguna) = flecha desactivada, no despliega

  // cerrar al tocar/pulsar fuera del control
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  const pick = (o: string, i: number) => {
    if (!controlled) setInternal(o);
    onChange?.(o, i);
    setOpen(false);
  };

  return (
    <div className="crt-select" ref={rootRef}>
      <div className="crt-select-trigger" role="button" tabIndex={disabled ? undefined : 0}
        aria-haspopup="listbox" aria-expanded={open} aria-disabled={disabled || undefined}
        aria-label={ariaLabel} data-open={open || undefined} data-disabled={disabled || undefined}
        data-no-arrow={hideArrow || undefined}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
          else if (e.key === "Escape") setOpen(false);
        }}>
        <span className="crt-select-value">{current}</span>
      </div>
      {open && !disabled && (
        <ul className="crt-select-list" role="listbox">
          {options.map((o, i) => (
            <li key={o} role="option" aria-selected={o === current}
              className={o === current ? "is-selected" : undefined}
              onClick={() => pick(o, i)}>{o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
