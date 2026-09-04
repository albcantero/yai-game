import { useEffect, useRef } from "react";
import { commands } from "../terminal/commands";
import type { Command, Ctx } from "../terminal/types";
import { TextScreen } from "../webcrt/textScreen";
import type { LineModel } from "../webcrt/textScreen";
import { CRTRenderer } from "../webcrt/gl";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function TerminalGL() {
  const glRef = useRef<HTMLCanvasElement>(null);

  // Estado de la terminal en refs: el render es por canvas, no necesita re-render de React.
  const linesRef = useRef<LineModel[]>([]);
  const inputRef = useRef("");
  const bootedRef = useRef(false);
  const dialogRef = useRef(false);
  const busyRef = useRef(false);
  const advanceRef = useRef<null | (() => void)>(null);
  const historyRef = useRef<string[]>([]);
  const hposRef = useRef(0);
  const dirtyRef = useRef(true);
  const cursorOnRef = useRef(true);
  const handleKeyRef = useRef<(k: string) => void>(() => {});
  const didBoot = useRef(false);

  const lookup = useRef<Map<string, Command>>(new Map());
  if (lookup.current.size === 0) {
    for (const c of commands) for (const n of c.names) lookup.current.set(n, c);
  }

  // --- núcleo de la terminal (mutación de refs + dirty) ---
  const addLine = (l: LineModel) => {
    linesRef.current.push(l);
    dirtyRef.current = true;
    return linesRef.current.length - 1;
  };
  const setText = (idx: number, text: string) => {
    if (linesRef.current[idx]) linesRef.current[idx].text = text;
    dirtyRef.current = true;
  };
  const print = (text: string, cls = "") => addLine({ text, cls, mark: text ? "*" : "" });
  const echo = (text: string) => addLine({ text, cls: "", mark: ">" });
  const clear = () => {
    linesRef.current = [];
    dirtyRef.current = true;
  };
  const setLine = (v: string) => {
    inputRef.current = v;
    dirtyRef.current = true;
  };

  const typeLine = async (text: string, cls = "", step = 9, mark = "*") => {
    const idx = addLine({ text: "", cls, mark: text ? mark : "" });
    for (let i = 1; i <= text.length; i++) {
      await sleep(step);
      setText(idx, text.slice(0, i));
    }
  };

  const waitForAdvance = () => new Promise<void>((res) => (advanceRef.current = res));
  const advance = () => {
    if (busyRef.current) return;
    const r = advanceRef.current;
    if (r) {
      advanceRef.current = null;
      r();
    }
  };

  const runDialog = async (dlines: string[]) => {
    dialogRef.current = true;
    dirtyRef.current = true;
    print("");
    for (let i = 0; i < dlines.length; i++) {
      busyRef.current = true;
      await typeLine(dlines[i], "b", 24, "");
      busyRef.current = false;
      const more = i < dlines.length - 1;
      const idx = addLine({
        text: more ? "  toca o Enter para continuar" : "  fin del mensaje",
        cls: "muted",
        mark: "",
      });
      await waitForAdvance();
      linesRef.current.splice(idx, 1);
      dirtyRef.current = true;
    }
    dialogRef.current = false;
    print("");
  };

  const submit = (raw: string) => {
    const line = raw.trim();
    echo(line);
    if (!line) return;
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");
    const command = lookup.current.get(cmd);
    if (!command) {
      print("comando no reconocido: " + cmd, "d");
      print("prueba help", "muted");
      print("");
      return;
    }
    const ctx: Ctx = { print, clear, startDialog: runDialog, arg, raw: line };
    command.run(ctx);
    if (!command.names.includes("contacto")) print("");
  };

  const handleKey = (k: string) => {
    if (dialogRef.current) {
      if (k === "Enter" || k === " ") advance();
      return;
    }
    if (!bootedRef.current) return;
    if (k === "Enter") {
      const v = inputRef.current;
      if (v.trim()) historyRef.current.push(v);
      hposRef.current = historyRef.current.length;
      setLine("");
      submit(v);
    } else if (k === "Backspace") {
      setLine(inputRef.current.slice(0, -1));
    } else if (k === "ArrowUp") {
      if (hposRef.current > 0) {
        hposRef.current--;
        setLine(historyRef.current[hposRef.current] ?? "");
      }
    } else if (k === "ArrowDown") {
      if (hposRef.current < historyRef.current.length) {
        hposRef.current++;
        setLine(historyRef.current[hposRef.current] ?? "");
      }
    } else if (k.length === 1) {
      setLine(inputRef.current + k);
    }
  };
  handleKeyRef.current = handleKey;

  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;
    const glCanvas = glRef.current;
    if (!glCanvas) return;

    let renderer: CRTRenderer | null = null;
    let screen: TextScreen | null = null;
    let raf = 0;
    let lastBlink = 0;
    const start = performance.now();

    const model = () => ({
      lines: linesRef.current,
      input: inputRef.current,
      showInput: bootedRef.current && !dialogRef.current,
      cursorOn: cursorOnRef.current,
    });

    const relayout = () => {
      if (!screen) return;
      const aspect = glCanvas.clientWidth / Math.max(1, glCanvas.clientHeight);
      screen.layout(aspect);
      dirtyRef.current = true;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!renderer || !screen) return;
      // parpadeo del cursor
      if (now - lastBlink > 530) {
        lastBlink = now;
        cursorOnRef.current = !cursorOnRef.current;
        if (model().showInput) dirtyRef.current = true;
      }
      if (dirtyRef.current) {
        screen.render(model());
        dirtyRef.current = false;
      }
      renderer.resize();
      renderer.render((now - start) / 1000);
    };

    (async () => {
      try {
        if (document.fonts && document.fonts.load) await document.fonts.load('16px "IBM VGA"');
      } catch {
        /* la fuente caerá al fallback */
      }
      screen = new TextScreen(16);
      relayout();
      try {
        renderer = new CRTRenderer(glCanvas, screen.canvas);
      } catch (e) {
        console.error(e);
        return;
      }
      window.addEventListener("resize", relayout);
      raf = requestAnimationFrame(loop);

      // secuencia de arranque
      await typeLine("sistema interno · nodo trastienda", "muted", 6);
      await typeLine("inicializando módulos .............. OK", "", 6);
      await typeLine("enlace cifrado ..................... OK", "", 6);
      await typeLine("[AVISO] registro de actividad: OFF", "muted", 8);
      print("");
      await typeLine("escribe help y pulsa Enter para empezar.", "", 10);
      print("");
      bootedRef.current = true;
      dirtyRef.current = true;
    })();

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "Enter" || k === "Backspace" || k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        handleKeyRef.current(k);
      } else if (k.length === 1) {
        handleKeyRef.current(k);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", relayout);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const KEYS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ];

  return (
    <div className="gl-stage">
      <div className="gl-screen">
        <canvas ref={glRef} className="gl-canvas" />
      </div>
      <div className="keyboard">
        {KEYS.map((row, ri) => (
          <div className="krow" key={ri}>
            {row.map((k) => (
              <button type="button" key={k} onPointerDown={() => handleKey(k)}>
                {k}
              </button>
            ))}
          </div>
        ))}
        <div className="krow">
          <button type="button" className="kmod" onPointerDown={() => handleKey("Backspace")}>⌫</button>
          <button type="button" className="kspace" onPointerDown={() => handleKey(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => handleKey("Enter")}>Enter</button>
        </div>
      </div>
    </div>
  );
}
