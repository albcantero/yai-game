import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { commands } from "../terminal/commands";
import type { Command, Ctx, LineClass } from "../terminal/types";
import BANNER from "../terminal/banner.txt?raw";
import { rlog } from "../lib/rlog";
import {
  loginCharacter,
  ensureSession,
  currentCharacter,
  allCharacters,
  fetchThread,
  sendMessage,
  subscribeMessages,
  type Character,
  type Msg,
} from "../lib/supabase";

type Mark = "*" | ">" | "";
interface Line {
  id: number;
  text: string;
  cls: LineClass;
  mark: Mark;
  code?: string;
  bullet?: boolean;
  spinner?: boolean;
  chev?: boolean;
  chevMore?: boolean;
}
interface Field {
  label: string;
  value: string;
  mask?: boolean;
}
interface FormState {
  fields: Field[];
  active: number;
  editing: boolean;
  submitLabel?: string;
  onSubmit: (values: string[]) => void;
}
interface PanelOption {
  label: string;
  run: () => void;
}
interface PanelState {
  options: PanelOption[];
  active: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const prefersReduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;

// El CONTENIDO del terminal (líneas, login, chat, boot...). Vive como componente propio dentro del
// armazón ("el PC"): se MONTA al entrar y se DESMONTA al salir, así reiniciar = remontar y React
// limpia todo (estado + async) solo. El audio/teclado/warp los pone el padre y llegan por props.
export interface TerminalContentProps {
  playSfx: (src: string, vol?: number) => void;
  shiftModeRef: MutableRefObject<"off" | "shift" | "caps">;
  consumeShift: () => void;
  keyHandlerRef: MutableRefObject<(k: string) => void>; // el terminal registra aquí su handleKey
  runCmdRef: MutableRefObject<(cmd: string) => void>; // ...y su submit (para el menú lateral del armazón)
  loaderRef: MutableRefObject<boolean>; // expone si hay un loader (el armazón bloquea sus botones)
}

export default function TerminalContent({
  playSfx,
  shiftModeRef,
  consumeShift,
  keyHandlerRef,
  runCmdRef,
  loaderRef,
}: TerminalContentProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [loader, setLoader] = useState(false);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [account, setAccount] = useState(false);
  const [thread, setThread] = useState<{ target: string | null; name: string } | null>(null);

  const idRef = useRef(0);
  const busyRef = useRef(false);
  const advanceRef = useRef<null | (() => void)>(null);
  const historyRef = useRef<string[]>([]);
  const hposRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const curRef = useRef("");
  const bannerRef = useRef<HTMLPreElement>(null);
  const meRef = useRef<Character | null>(null);
  const namesRef = useRef<Record<string, string>>({});
  const threadRef = useRef<{ target: string | null; name: string } | null>(null);
  const chatUnsubRef = useRef<null | (() => void)>(null);

  loaderRef.current = loader; // el armazón usa esto para bloquear los botones del monitor durante un loader

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
  const setText = (id: number, text: string) =>
    setLines((p) => p.map((x) => (x.id === id ? { ...x, text } : x)));
  const print = (text: string, cls: LineClass = "") => {
    addLine({ text, cls, mark: "" });
  };
  const echo = (text: string) => {
    addLine({ text: text ? "#" + text : "", cls: "", mark: "" });
  };
  const sys = (code: string, text: string, cls: LineClass = "") => {
    addLine({ text, cls, mark: "", code });
  };
  const clear = () => setLines([]);
  const setLine = (v: string) => {
    curRef.current = v;
    setInput(v);
  };

  const typeLine = async (
    text: string,
    cls: LineClass = "",
    step = 9,
    mark: Mark = "",
    extra: { bullet?: boolean } = {},
    alive?: () => boolean,
  ) => {
    const mk: Mark = text ? mark : "";
    const id = addLine({ text: "", cls, mark: mk, ...extra });
    if (prefersReduced()) {
      setText(id, text);
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      await sleep(step);
      if (alive && !alive()) return;
      setText(id, text.slice(0, i));
    }
  };

  const fitBanner = () => {
    const b = bannerRef.current;
    if (!b) return;
    const wrap = b.parentElement;
    if (!wrap) return;
    b.style.transform = "none";
    b.style.fontSize = "";
    const base = parseFloat(getComputedStyle(b).fontSize) || 11;
    const s = Math.min(1, (wrap.clientWidth || 1) / (b.scrollWidth || 1));
    b.style.fontSize = base * s + "px";
    wrap.style.height = "";
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
      await typeLine(dlines[i], "b", 24, "");
      busyRef.current = false;
      const more = i < dlines.length - 1;
      const chevId = addLine({ text: "", cls: "", mark: "", chev: true, chevMore: more });
      await waitForAdvance();
      setLines((p) => p.filter((x) => x.id !== chevId));
    }
    setDialog(false);
    print("");
  };

  // Spinner UNIVERSAL: \n + spinner en su línea, sustituido al terminar por su [OK]/[ERROR] en el sitio.
  const spin = async (
    loadingText: string,
    task: () => Promise<{ code: "OK" | "ERROR"; text: string; cls?: LineClass }>,
    minMs = 0,
  ): Promise<{ code: "OK" | "ERROR"; text: string; cls?: LineClass }> => {
    print("");
    const id = addLine({ text: loadingText, cls: "", mark: "", spinner: true });
    setLoader(true);
    const start = Date.now();
    let res: { code: "OK" | "ERROR"; text: string; cls?: LineClass };
    try {
      res = await task();
    } catch {
      res = { code: "ERROR", text: "Se ha producido un error inesperado", cls: "d" };
    }
    const elapsed = Date.now() - start;
    if (elapsed < minMs) await sleep(minMs - elapsed);
    setLines((p) =>
      p.map((x) =>
        x.id === id ? { ...x, spinner: false, code: res.code, text: res.text, cls: res.cls ?? "" } : x,
      ),
    );
    setLoader(false);
    return res;
  };

  const logoutFlow = async () => {
    if (chatUnsubRef.current) {
      chatUnsubRef.current();
      chatUnsubRef.current = null;
    }
    threadRef.current = null;
    setThread(null);
    setPanel(null);
    await spin("Cerrando sesión...", async () => {
      await sleep(2000);
      return { code: "OK", text: "Se ha cerrado su sesión correctamente", cls: "b" };
    });
    setAccount(false);
    clear();
  };

  const openPanel = () => {
    setPanel({
      active: 0,
      options: [
        { label: "Mis mensajes", run: () => void openMessages() },
        { label: "Salir", run: () => logoutFlow() },
      ],
    });
  };

  // ---------- Chat: roster (panel) + hilo (mensajes en lines + compose) ----------
  const printMsg = (m: Msg) => {
    const mine = m.from_char === meRef.current?.username;
    const who = mine ? "Tú" : namesRef.current[m.from_char] ?? m.from_char;
    addLine({ text: who + ": " + m.body, cls: mine ? "b" : "", mark: "" });
  };
  const belongsToThread = (m: Msg, target: string | null, me: string) =>
    target === null
      ? m.to_char === null
      : (m.from_char === me && m.to_char === target) || (m.from_char === target && m.to_char === me);
  const sendChat = async (target: string | null, body: string) => {
    const from = meRef.current?.username;
    if (!from) return;
    const res = await sendMessage(from, target, body);
    if (!res.ok) sys("ERROR", "No se pudo enviar el mensaje", "d");
  };
  const openThread = async (target: string | null, name: string) => {
    setPanel(null);
    const t = { target, name };
    threadRef.current = t;
    setThread(t);
    setLine("");
    clear();
    print(name, "muted");
    print("");
    const me = meRef.current?.username ?? "";
    const msgs = await fetchThread(me, target);
    for (const m of msgs) printMsg(m);
    if (chatUnsubRef.current) chatUnsubRef.current();
    chatUnsubRef.current = subscribeMessages((m) => {
      const cur = threadRef.current;
      if (cur && belongsToThread(m, cur.target, meRef.current?.username ?? "")) printMsg(m);
    });
  };
  const openMessages = async () => {
    const chars = (await allCharacters()).filter((c) => c.username !== meRef.current?.username);
    setPanel({
      active: 0,
      options: [
        { label: "Sala común", run: () => void openThread(null, "Sala común") },
        ...chars.map((c) => ({ label: c.display_name, run: () => void openThread(c.username, c.display_name) })),
        { label: "Salir", run: () => openPanel() },
      ],
    });
  };
  const backToRoster = () => {
    if (chatUnsubRef.current) {
      chatUnsubRef.current();
      chatUnsubRef.current = null;
    }
    threadRef.current = null;
    setThread(null);
    setLine("");
    clear();
    void openMessages();
  };
  const loadIdentity = async () => {
    const chars = await allCharacters();
    const map: Record<string, string> = {};
    for (const c of chars) map[c.username] = c.display_name;
    namesRef.current = map;
    meRef.current = await currentCharacter();
  };

  const connectFlow = async (username: string, password: string) => {
    const res = await spin(
      "Conectando con el servidor...",
      async () => {
        const r = await loginCharacter(username, password);
        if (!r.ok)
          return {
            code: "ERROR" as const,
            text: "Tu cuenta de usuario y/o contraseña son incorrectos. Inténtelo nuevamente",
            cls: "d" as LineClass,
          };
        return { code: "OK" as const, text: "Sesión iniciada correctamente", cls: "b" as LineClass };
      },
      3000,
    );
    if (res.code === "ERROR") {
      print("");
      return;
    }
    await spin("Descargando metadatos de su cuenta...", async () => {
      await loadIdentity();
      await sleep(2500);
      return { code: "OK" as const, text: "Metadatos sincronizados", cls: "b" as LineClass };
    });
    clear();
    setAccount(true);
    openPanel();
  };

  const startLogin = () => {
    print("Introduzca sus credenciales para acceder al sistema");
    setForm({
      fields: [
        { label: "[USER] Usuario:", value: "" },
        { label: "[PASSWORD] Contraseña:", value: "", mask: true },
      ],
      active: 0,
      editing: false,
      submitLabel: "Conectar",
      onSubmit: (vals) => {
        addLine({ text: "[USER] Usuario: " + vals[0], cls: "", mark: "" });
        addLine({ text: "[PASSWORD] Contraseña: " + "*".repeat(vals[1].length), cls: "", mark: "" });
        connectFlow(vals[0].trim(), vals[1]);
      },
    });
  };

  // Teclas con formulario en pantalla (sin sonido: el clic de tecla lo pone el armazón al despachar).
  const handleFormKey = (k: string) => {
    const f = form;
    if (!f) return;
    const allFilled = f.fields.every((x) => x.value.length > 0);
    const connectAvail = allFilled && !!f.submitLabel;
    const cancelIndex = f.fields.length + (connectAvail ? 1 : 0);
    const count = cancelIndex + 1;

    if (!f.editing) {
      if (k === "ArrowUp") {
        setForm({ ...f, active: Math.max(0, f.active - 1) });
      } else if (k === "ArrowDown") {
        setForm({ ...f, active: Math.min(count - 1, f.active + 1) });
      } else if (k === "Enter") {
        if (f.active < f.fields.length) {
          setForm({ ...f, editing: true });
        } else if (f.active === cancelIndex) {
          f.fields.forEach((fld) =>
            addLine({
              text: fld.label + " " + (fld.mask ? "*".repeat(fld.value.length) : fld.value),
              cls: "",
              mark: "",
            }),
          );
          setForm(null);
          print("");
          print("Se ha cancelado su solicitud");
          print("");
        } else {
          const values = f.fields.map((x) => x.value);
          setForm(null);
          f.onSubmit(values);
        }
      }
      return;
    }
    if (k === "ArrowUp" || k === "ArrowDown") return;
    if (k === "Enter") {
      setForm({ ...f, editing: false });
      return;
    }
    const setActive = (v: string) => {
      const fields = f.fields.slice();
      fields[f.active] = { ...fields[f.active], value: v };
      setForm({ ...f, fields });
    };
    if (k === "Backspace") {
      setActive(f.fields[f.active].value.slice(0, -1));
    } else if (k.length === 1) {
      setActive(f.fields[f.active].value + (shiftModeRef.current !== "off" ? k.toUpperCase() : k));
      consumeShift();
    }
  };

  const submit = (raw: string) => {
    const line = raw.trim();
    echo(line);
    rlog("info", "submit", { line });
    if (!line) return;
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");
    const command = lookup.get(cmd);
    if (!command) {
      sys(
        "ERROR",
        '"' + parts[0] + '" no se reconoce como un comando interno. Escribe "help" para consultar los comandos disponibles',
        "d",
      );
      print("");
      return;
    }
    const ctx: Ctx = { print, sys, clear, startDialog: runDialog, startLogin, arg, raw: line };
    command.run(ctx);
    if (!command.names.includes("contacto") && !command.names.includes("login")) print("");
  };
  runCmdRef.current = submit; // el menú lateral del armazón ejecuta comandos aquí

  const handlePanelKey = (k: string) => {
    const p = panel;
    if (!p) return;
    if (k === "ArrowUp") {
      setPanel({ ...p, active: Math.max(0, p.active - 1) });
    } else if (k === "ArrowDown") {
      setPanel({ ...p, active: Math.min(p.options.length - 1, p.active + 1) });
    } else if (k === "Enter") {
      p.options[p.active].run();
    }
  };

  // handleKey del terminal (Shift, home y el clic de tecla los gestiona el armazón antes de delegar aquí).
  const handleKey = (k: string) => {
    if (thread) {
      if (k === "Enter") {
        const body = curRef.current.trim();
        setLine("");
        if (body) void sendChat(thread.target, body);
        return;
      }
      if (k === "Backspace") {
        setLine(curRef.current.slice(0, -1));
        return;
      }
      if (k.length === 1) {
        setLine(curRef.current + (shiftModeRef.current !== "off" ? k.toUpperCase() : k));
        consumeShift();
        return;
      }
      return;
    }
    if (panel) {
      handlePanelKey(k);
      return;
    }
    if (form) {
      handleFormKey(k);
      return;
    }
    if (dialog) {
      if (k === "Enter" || k === " ") advance();
      return;
    }
    if (!booted) return;
    if (k === "Enter") {
      const v = curRef.current;
      if (v.trim()) historyRef.current.push(v);
      hposRef.current = historyRef.current.length;
      setLine("");
      submit(v);
    } else if (k === "Backspace") {
      setLine(curRef.current.slice(0, -1));
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
      setLine(curRef.current + (shiftModeRef.current !== "off" ? k.toUpperCase() : k));
      consumeShift();
    }
  };
  keyHandlerRef.current = handleKey; // el teclado/físico del armazón despacha aquí en vista "terminal"

  // Click en el hint = confirmar (equivale a Enter), con sonido de ratón.
  const confirmClick = () => {
    playSfx("/audio/mouse-click.mp3");
    handleKey("Enter");
  };

  // Arranque del terminal: se ejecuta al MONTAR (cada vez que se entra) y se cancela al DESMONTAR.
  useEffect(() => {
    ensureSession().catch(() => {});
    if (bannerRef.current) {
      bannerRef.current.textContent = BANNER.replace(/[ \t]+$/gm, "").replace(/^\n+/, "").replace(/\n+$/, "");
      fitBanner();
    }
    const onResize = () => fitBanner();
    window.addEventListener("resize", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBanner);
    rlog("info", "terminal montado");

    let alive = true;
    (async () => {
      // Arranque tipo carga de sistema: barra de bloques bajo el logo (~4s). Se re-ejecuta en cada entrada.
      const label = "Cargando sistema";
      const width = 22;
      const barId = addLine({ text: label + " [" + "░".repeat(width) + "]", cls: "", mark: "" });
      for (let i = 1; i <= width; i++) {
        await sleep(4000 / width);
        if (!alive) return;
        setText(barId, label + " [" + "█".repeat(i) + "░".repeat(width - i) + "]");
      }
      if (!alive) return;
      await sleep(350);
      setLines([]); // retira la barra de carga (el logo va aparte y se queda)
      await typeLine("Bienvenido/a a SANTAS OCHOVA La Mejor Librería", "", 16, "", {}, () => alive);
      if (!alive) return;
      await typeLine("Antes de continuar, le recordamos nuestras directivas:", "", 16, "", {}, () => alive);
      if (!alive) return;
      await typeLine("Literatura correcta para ciudadanos correctos", "muted", 16, "", { bullet: true }, () => alive);
      await typeLine("Una mente condicionada es una mente feliz", "muted", 16, "", { bullet: true }, () => alive);
      await typeLine("La lectura sin propósito produce inestabilidad social", "muted", 16, "", { bullet: true }, () => alive);
      if (!alive) return;
      print("");
      setBooted(true);
    })();

    return () => {
      alive = false; // cancela la bienvenida en curso
      window.removeEventListener("resize", onResize);
      if (chatUnsubRef.current) chatUnsubRef.current();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const showInput = booted && !dialog && !loader && !panel && !thread;
  const fAllFilled = form ? form.fields.every((x) => x.value.length > 0) : false;
  const fConnect = !!form?.submitLabel && fAllFilled;
  const fCancelIdx = form ? form.fields.length + (fConnect ? 1 : 0) : 0;

  return (
    <div className="content" ref={scrollRef}>
      <div className="banner-frame" hidden={account}>
        <div className="banner-wrap">
          <pre className="banner" ref={bannerRef}></pre>
        </div>
      </div>
      {lines.map((l) =>
        l.chev ? (
          <div className="row" key={l.id}>
            <span className="chev">▾</span>
            <span className="muted">
              {l.chevMore ? "  toca o Enter para continuar" : "  fin del mensaje"}
            </span>
          </div>
        ) : l.spinner ? (
          <div className="row syscode-row spinner-row" key={l.id}>
            <span className="syscode spinner-cell">
              <svg className="loader-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M14 23H10V19H14V23ZM7 21H3L3 17H7V21ZM21 20H18V17H21V20ZM6 14H1L1 9H6V14ZM23 13H20V10H23V13ZM13 7H7L7 1L13 1V7ZM20 6H18V4L20 4V6Z" />
              </svg>
            </span>
            <span className="systext">{l.text}</span>
          </div>
        ) : l.code ? (
          <div className={"row syscode-row" + (l.cls ? " " + l.cls : "")} key={l.id}>
            <span className="syscode">[{l.code}]</span>
            <span className="systext">{l.text}</span>
          </div>
        ) : l.bullet ? (
          <div className={"row syscode-row" + (l.cls ? " " + l.cls : "")} key={l.id}>
            <span className="syscode">*</span>
            <span className="systext">{l.text}</span>
          </div>
        ) : (
          <div className={"row" + (l.cls ? " " + l.cls : "")} key={l.id}>
            {l.mark && <span className={l.mark === ">" ? "prompt" : "astk"}>{l.mark + " "}</span>}
            {l.text}
          </div>
        ),
      )}
      {showInput && !form && (
        <div className="inputline">
          <span className="field">
            <span className="uprompt">#</span>
            <span className="mirror">{input}</span>
            <span className="cursor" />
          </span>
        </div>
      )}
      {thread && (
        <>
          <div className="chat-back" onPointerDown={backToRoster}>‹ Volver a mensajes</div>
          <div className="inputline">
            <span className="field">
              <span className="cprompt">›</span>
              <span className="mirror">{input}</span>
              <span className="cursor" />
            </span>
          </div>
        </>
      )}
      {form && (
        <div className="form">
          {form.fields.map((f, i) => (
            <div className="inputline" key={i}>
              <span className="fcaret" aria-hidden="true">
                {!loader && i === form.active && !form.editing && (
                  <svg viewBox="9 7 6 10" fill="currentColor">
                    <path d="M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z" />
                  </svg>
                )}
              </span>
              <span className="fcheck" aria-hidden="true">
                {"["}
                {f.value.length ? (
                  <svg className="term-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z" />
                  </svg>
                ) : (
                  <span className="fcheck-gap" />
                )}
                {"]"}
              </span>
              <span className="flabel">{f.label}</span>
              <span className="field">
                <span className="mirror">{f.mask ? "*".repeat(f.value.length) : f.value}</span>
                {i === form.active && form.editing && <span className="cursor" />}
              </span>
            </div>
          ))}
          {fConnect && (
            <div className="inputline fconnect-row">
              <span className="fcaret" aria-hidden="true">
                {!loader && form.active === form.fields.length && (
                  <svg viewBox="9 7 6 10" fill="currentColor">
                    <path d="M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z" />
                  </svg>
                )}
              </span>
              <span className="faction">{form.submitLabel}</span>
            </div>
          )}
          <div className={"inputline" + (fConnect ? "" : " fconnect-row")}>
            <span className="fcaret" aria-hidden="true">
              {!loader && form.active === fCancelIdx && (
                <svg viewBox="9 7 6 10" fill="currentColor">
                  <path d="M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z" />
                </svg>
              )}
            </span>
            <span className="faction">Salir</span>
          </div>
        </div>
      )}
      {panel && (
        <div className="form">
          {panel.options.map((o, i) => (
            <div className={"inputline" + (i === 0 ? " fconnect-row" : "")} key={i}>
              <span className="fcaret" aria-hidden="true">
                {!loader && i === panel.active && (
                  <svg viewBox="9 7 6 10" fill="currentColor">
                    <path d="M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z" />
                  </svg>
                )}
              </span>
              <span className="faction">{o.label}</span>
            </div>
          ))}
        </div>
      )}
      {showInput && (
        <div className="help-block">
          <div className="help-q">¿Necesitas ayuda?</div>
          <div className="hint" onPointerDown={confirmClick}>
            Pulsa ENTER o{" "}
            <svg className="term-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 7h2v16H9zm2 0h2v15h-2zm2 2h2v12h-2zm2 2h2v8h-2zm2 2h2v6h-2zm2 2h2v2h-2z" />
              <path d="M11 21h2v2h-2zm2-2h2v2h-2zm2-2h6v2h-6zm0-12h2v2h-2zM5 10h2v2H5zm0-5h2v2H5zm4-4h2v4H9zM3 3h2v2H3zm0 9h2v2H3zm14-9h2v2h-2z" />
            </svg>
            Click para interactuar. Pulsa{" "}
            <svg className="term-svg" style={{ marginRight: 0 }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11 20h2V4h-2zm2-12h2V6h-2zm2 2h2V8h-2zm2 2h2v-2h-2zm-6-4H9V6h2z" />
              <path d="M15 10H7V8h8zm2 2H5v-2h12z" />
            </svg>
            <svg className="term-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 12h6v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2h6V4h2v8Z" />
            </svg>{" "}
            para desplazarte por NeoTerminal2. Escribe "help" para consultar los comandos disponibles
          </div>
        </div>
      )}
    </div>
  );
}
