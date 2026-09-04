import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { commands } from "../terminal/commands";
import type { Command, Ctx, LineClass } from "../terminal/types";

interface Line {
  id: number;
  text: string;
  cls: LineClass;
  chev?: boolean;
  chevMore?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const prefersReduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const finePointer = () =>
  typeof matchMedia !== "undefined" && matchMedia("(hover:hover) and (pointer:fine)").matches;

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [focused, setFocused] = useState(false);

  const idRef = useRef(0);
  const busyRef = useRef(false);
  const advanceRef = useRef<null | (() => void)>(null);
  const historyRef = useRef<string[]>([]);
  const hposRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didBoot = useRef(false);

  const lookup = useMemo(() => {
    const m = new Map<string, Command>();
    for (const c of commands) for (const n of c.names) m.set(n, c);
    return m;
  }, []);

  const addLine = (l: Omit<Line, "id">) => {
    const id = idRef.current++;
    setLines((p) => [...p, { ...l, id }]);
    return id;
  };
  const setText = (id: number, text: string, cls: LineClass) =>
    setLines((p) => p.map((x) => (x.id === id ? { ...x, text, cls } : x)));
  const print = (text: string, cls: LineClass = "") => {
    addLine({ text, cls });
  };
  const clear = () => setLines([]);

  const typeLine = async (text: string, cls: LineClass = "", step = 9) => {
    const id = addLine({ text: "", cls });
    if (prefersReduced()) {
      setText(id, text, cls);
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      await sleep(step);
      setText(id, text.slice(0, i), cls);
    }
  };

  const focusInput = () => {
    if (finePointer()) inputRef.current?.focus();
  };

  const waitForAdvance = () =>
    new Promise<void>((res) => {
      advanceRef.current = res;
    });
  const advance = () => {
    if (busyRef.current) return;
    const r = advanceRef.current;
    if (r) {
      advanceRef.current = null;
      r();
    }
  };

  const runDialog = async (dlines: string[]) => {
    setDialog(true);
    print("");
    for (let i = 0; i < dlines.length; i++) {
      busyRef.current = true;
      await typeLine(dlines[i], "b", 24);
      busyRef.current = false;
      const more = i < dlines.length - 1;
      const chevId = addLine({ text: "", cls: "", chev: true, chevMore: more });
      await waitForAdvance();
      setLines((p) => p.filter((x) => x.id !== chevId));
    }
    setDialog(false);
    print("");
    focusInput();
  };

  const submit = (raw: string) => {
    const line = raw.trim();
    print("manto:~$ " + line);
    if (!line) return;
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");
    const command = lookup.get(cmd);
    if (!command) {
      print("comando no reconocido: " + cmd, "d");
      print("prueba /help", "muted");
      print("");
      return;
    }
    const ctx: Ctx = { print, clear, startDialog: runDialog, arg, raw: line };
    command.run(ctx);
    const startsDialog = command.names.includes("/contacto");
    if (!startsDialog) print("");
  };

  // Secuencia de arranque (una sola vez).
  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;
    void (async () => {
      await typeLine("MANTO ROCHOA · SISTEMA INTERNO", "b", 14);
      await typeLine("terminal segura · nodo trastienda", "muted", 6);
      await typeLine("inicializando módulos .............. OK", "", 6);
      await typeLine("enlace cifrado ..................... OK", "", 6);
      await typeLine("[AVISO] registro de actividad: OFF", "muted", 8);
      print("");
      await typeLine("escribe /help para empezar.", "", 10);
      print("");
      setBooted(true);
      focusInput();
    })();
  }, []);

  // Autoscroll al fondo con cada línea nueva.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Durante el diálogo, Enter avanza (aunque el input esté oculto).
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input;
      if (v.trim()) historyRef.current.push(v);
      hposRef.current = historyRef.current.length;
      setInput("");
      submit(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hposRef.current > 0) {
        hposRef.current--;
        setInput(historyRef.current[hposRef.current] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hposRef.current < historyRef.current.length) {
        hposRef.current++;
        setInput(historyRef.current[hposRef.current] ?? "");
      }
    }
  };

  const onPointerDown = () => {
    if (dialog) {
      advance();
      return;
    }
    if (booted) inputRef.current?.focus();
  };

  const showInput = booted && !dialog;

  return (
    <div className={"crt" + (focused ? "" : " idle")} onPointerDown={onPointerDown}>
      <div className="content" ref={scrollRef}>
        {lines.map((l) =>
          l.chev ? (
            <div className="row" key={l.id}>
              <span className="chev">▾</span>
              <span className="muted">
                {l.chevMore ? "  toca o Enter para continuar" : "  fin del mensaje"}
              </span>
            </div>
          ) : (
            <div className={"row" + (l.cls ? " " + l.cls : "")} key={l.id}>
              {l.text}
            </div>
          ),
        )}
        {showInput && (
          <div className="inputline">
            <span className="prompt">manto:~$</span>
            <span className="field">
              <span className="mirror">{input}</span>
              <span className="cursor">█</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Línea de comandos"
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
