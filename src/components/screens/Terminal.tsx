import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ScreenHandle, ScreenServices } from "./types";
import { commands } from "../../terminal/commands";
import { editText, menuNav } from "../../terminal/input";
import type { Command, Ctx, LineClass } from "../../terminal/types";
import BANNER from "../../terminal/banner.txt?raw";
import { rlog } from "../../lib/rlog";
import { loginCharacter, ensureSession } from "../../lib/supabase";
import { useChat } from "./useChat";

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

const rawSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BOOT_WIDTH = 24; // bloques de la barra de carga inicial
const BOOT_MS = 4000; // duración de la barra de carga
const prefersReduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;

// Pantalla-terminal (líneas, login, chat, boot...). Se MONTA al entrar y se DESMONTA al salir, así
// reiniciar = remontar y React limpia todo (estado + async) solo. Recibe los servicios del armazón por
// props (ScreenServices) y le EXPONE su ScreenHandle vía useImperativeHandle (más abajo), en vez de
// que el armazón le asigne refs sueltos en el render.
const Terminal = forwardRef<ScreenHandle, ScreenServices>(function Terminal(
  { playSfx, shiftModeRef, consumeShift },
  ref,
) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);
  const [booting, setBooting] = useState(true); // splash de carga inicial (logo centrado + barra); solo en el arranque
  const [bootFill, setBootFill] = useState(0); // bloques llenos de la barra de carga (0..BOOT_WIDTH)
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [loader, setLoader] = useState(false);

  const idRef = useRef(0);
  const busyRef = useRef(false);
  const advanceRef = useRef<null | (() => void)>(null);
  const historyRef = useRef<string[]>([]);
  const hposRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const curRef = useRef("");
  const bannerRef = useRef<HTMLPreElement>(null);
  const mountedRef = useRef(true); // false tras desmontar: corta subscripciones/pintados de awaits en vuelo

  // ---- PAUSA del terminal (la impone el armazón al abrir menú/diálogo) ----
  // Todo lo animado pasa por sleep(); mientras paused, sleep aparca en la "compuerta" (gate) y no
  // resuelve hasta despausar. Así se congelan boot, typeLine y spinners sin tocar cada bucle, esté como esté.
  const pausedRef = useRef(false);
  const resumeWaitersRef = useRef<Array<() => void>>([]);
  const setPaused = (v: boolean) => {
    if (pausedRef.current === v) return;
    pausedRef.current = v;
    if (!v) {
      const ws = resumeWaitersRef.current; // al reanudar, libera a todos los que esperaban en la compuerta
      resumeWaitersRef.current = [];
      ws.forEach((fn) => fn());
    }
  };
  const gate = () =>
    pausedRef.current
      ? new Promise<void>((res) => resumeWaitersRef.current.push(res))
      : Promise.resolve();
  const sleep = (ms: number) => rawSleep(ms).then(gate); // sleep consciente de la pausa (sombrea al de módulo)

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

  // Cuenta + chat extraídos a su propio hook (identidad, panel, hilos, realtime, dedup, echo local);
  // se le prestan las primitivas de pintado del terminal (print/clear/setLine/sys), el spin y el sleep pausable.
  const { panel, thread, meRef, openPanel, backToRoster, sendChat, handlePanelKey, loadIdentity, unsubscribe } =
    useChat({ print, clear, setLine, sys, spin, sleep, mountedRef });

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
    const meta = await spin("Descargando metadatos de su cuenta...", async () => {
      await loadIdentity();
      await sleep(2500);
      return meRef.current
        ? { code: "OK" as const, text: "Metadatos sincronizados", cls: "b" as LineClass }
        : {
            code: "ERROR" as const,
            text: "No se pudieron sincronizar los datos de su cuenta. Inténtelo nuevamente",
            cls: "d" as LineClass,
          };
    });
    if (meta.code === "ERROR" || !meRef.current) {
      print(""); // sin identidad no se entra al chat (evita un panel con me=null que traga los envíos)
      return;
    }
    if (!mountedRef.current) return; // el terminal se cerró durante los ~5,5s de spins: no toques estado
    clear();
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
      const na = menuNav(f.active, count, k);
      if (na !== f.active) {
        setForm({ ...f, active: na });
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
    const next = editText(f.fields[f.active].value, k, shiftModeRef.current !== "off");
    if (next !== null) {
      setActive(next);
      if (k.length === 1) consumeShift();
    }
  };

  const submit = (raw: string) => {
    if (loader) return; // guard unico: cubre tanto handleKey como el menu lateral (runFromMenu) durante un spin
    const line = raw.trim();
    if (!line) return; // Enter/OK/click con el prompt vacío: no hace nada, ni añade salto de línea
    echo(line);
    rlog("info", "submit", { line });
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
    if (!command.names.includes("login")) print(""); // login no lleva línea en blanco extra (la gestiona startLogin)
  };

  // handleKey del terminal (Shift, home y el clic de tecla los gestiona el armazón antes de delegar aquí).
  const handleKey = (k: string) => {
    if (loader) return; // spin en marcha: no se ejecutan comandos ni se lanza otro flujo (evita reentrada); el teclado del armazón sigue sonando
    if (thread) {
      if (k === "Enter") {
        const body = curRef.current.trim();
        setLine("");
        if (body) void sendChat(thread.target, body);
        return;
      }
      const next = editText(curRef.current, k, shiftModeRef.current !== "off");
      if (next !== null) {
        setLine(next);
        if (k.length === 1) consumeShift();
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
    } else {
      const next = editText(curRef.current, k, shiftModeRef.current !== "off");
      if (next !== null) {
        setLine(next);
        if (k.length === 1) consumeShift();
      }
    }
  };
  // Handle que el armazón usa para hablar con esta pantalla (teclas, comandos del menú, loader, pausa).
  // Sin dep-array: se recrea en cada commit (como useLayoutEffect), así los closures van siempre frescos
  // sin asignar refs en el cuerpo del render.
  useImperativeHandle(ref, () => ({
    handleKey,
    runCmd: submit,
    isLoading: () => loader,
    setPaused,
  }));

  // Click en el hint = confirmar (equivale a Enter), con sonido de ratón.
  const confirmClick = () => {
    playSfx("/audio/mouse-click.mp3");
    handleKey("Enter");
  };

  // Arranque del terminal: se ejecuta al MONTAR (cada vez que se entra) y se cancela al DESMONTAR.
  useEffect(() => {
    mountedRef.current = true; // re-arma por si el efecto se re-ejecuta (StrictMode/dev), tras el cleanup previo
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
      // Splash de carga inicial: logo centrado + barra de bloques desnuda debajo (sin texto/%/brackets).
      // El logo SOLO aparece aquí; al terminar se retira el splash y la bienvenida ya va sin logo.
      if (prefersReduced()) {
        setBootFill(BOOT_WIDTH); // movimiento reducido: barra llena de golpe, sin esperar los 4s
        await sleep(400);
      } else {
        for (let i = 1; i <= BOOT_WIDTH; i++) {
          await sleep(BOOT_MS / BOOT_WIDTH);
          if (!alive) return;
          setBootFill(i);
        }
      }
      if (!alive) return;
      await sleep(350);
      setBooting(false); // fuera el splash (y el logo con él)
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
      mountedRef.current = false; // corta subscripciones/pintados de awaits que sigan en vuelo
      window.removeEventListener("resize", onResize);
      unsubscribe(); // desuscribe el realtime del chat (vive en useChat)
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
      {booting && (
        <div className="boot-splash">
          <div className="banner-wrap">
            <pre className="banner" ref={bannerRef}></pre>
          </div>
          <div className="boot-bar" aria-hidden="true">
            {"█".repeat(bootFill) + "░".repeat(BOOT_WIDTH - bootFill)}
          </div>
        </div>
      )}
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
});

export default Terminal;
