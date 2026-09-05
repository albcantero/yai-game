import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { commands } from "../terminal/commands";
import type { Command, Ctx, LineClass } from "../terminal/types";
import BANNER from "../terminal/banner.txt?raw";
import { initRemoteLog, rlog, BUILD } from "../lib/rlog";
import { loginCharacter, ensureSession } from "../lib/supabase";

type Mark = "*" | ">" | "";
interface Line {
  id: number;
  text: string;
  cls: LineClass;
  mark: Mark;
  code?: string; // codigo de sistema entre corchetes ([ACCESS_DENIED], etc.), como span propio
  bullet?: boolean; // viñeta "*" en columna propia (dos columnas, como [ERROR]): el texto envuelve alineado
  spinner?: boolean; // línea de carga: al terminar se sustituye en su sitio por su [OK]/[ERROR]
  chev?: boolean;
  chevMore?: boolean;
}

// Formulario TUI: varios campos con navegacion por flechas y cursor en el activo.
interface Field {
  label: string;
  value: string;
  mask?: boolean;
}
interface FormState {
  fields: Field[];
  active: number; // indice sobre [campos..., (accion final si todos llenos)]
  editing: boolean; // false = navegando con el caret; true = escribiendo en el campo activo
  submitLabel?: string; // accion final que aparece cuando TODOS los campos tienen texto (p.ej. "Conectar")
  onSubmit: (values: string[]) => void;
}

// Menu/panel navegable: lista de opciones (sin campos), caret + flechas + Enter.
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
const finePointer = () =>
  typeof matchMedia !== "undefined" && matchMedia("(hover:hover) and (pointer:fine)").matches;

// Warp CRT (abombado 3D via filtro SVG). Estuvo desactivado mientras depurabamos el congelado de
// iOS, que al final resulto ser el AudioContext, NO el filtro. Reactivado; si el filtro diera algun
// problema propio en iOS (feImage/feDisplacementMap), volver a poner en false.
const WARP_ENABLED = true;

// Audio del terminal por Web Audio (bypassa el interruptor de silencio de iOS). ON.
const AUDIO_ENABLED = true;

// Sello de build (SHA) visible en una esquina, estilo dev, para saber al vuelo si estoy en el deploy
// actual o en uno cacheado (sin necesidad de ?debug=1). Poner en false para la version final.
const SHOW_BUILD = true;

/** Enmarca un bloque de texto ASCII con líneas +--+ (ancho automático). */
function frameArt(text: string): string {
  const lines = text.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  let w = 0;
  for (const l of lines) if (l.length > w) w = l.length;
  const bar = "-".repeat(w + 2);
  let out = "+" + bar + "+\n";
  for (const l of lines) out += "| " + l + " ".repeat(w - l.length) + " |\n";
  return out + "+" + bar + "+";
}

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [warpReady, setWarpReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [powerOn, setPowerOn] = useState(true); // interruptor de encendido de la maquina (switch como el teclado)
  const [shift, setShift] = useState(false);
  const [numMode, setNumMode] = useState(false);
  const [form, setForm] = useState<FormState | null>(null); // formulario TUI (login, etc.)
  const [loader, setLoader] = useState(false); // hay una carga en curso: bloquea el input (el spinner es una línea propia)
  const [panel, setPanel] = useState<PanelState | null>(null); // menu del panel (Mis mensajes / Salir)
  const [account, setAccount] = useState(false); // dentro de la cuenta: oculta el logo del inicio

  const idRef = useRef(0);
  const busyRef = useRef(false);
  const advanceRef = useRef<null | (() => void)>(null);
  const historyRef = useRef<string[]>([]);
  const hposRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const curRef = useRef("");
  const handleKeyRef = useRef<(k: string) => void>(() => {});
  const bannerRef = useRef<HTMLPreElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const didBoot = useRef(false);
  const acRef = useRef<AudioContext | null>(null);
  const keyBuffersRef = useRef<AudioBuffer[]>([]);
  const humBufferRef = useRef<AudioBuffer | null>(null); // buffer del zumbido (Web Audio: suena en movil aunque este en silencio)
  const humSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const sfxBuffersRef = useRef<Record<string, AudioBuffer>>({}); // SFX de click pre-decodificados (Web Audio, sin latencia)
  const suppressTickRef = useRef(false); // silencia el tic de tecla cuando el sonido lo dispara otra cosa (botones del monitor)
  const shiftRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

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
    addLine({ text: text ? "#" + text : "", cls: "", mark: "" }); // eco del comando del usuario, con prefijo #
  };
  // Linea de sistema: codigo entre corchetes (span propio) + mensaje. sys("ACCESS_DENIED", "...", "d").
  const sys = (code: string, text: string, cls: LineClass = "") => {
    addLine({ text, cls, mark: "", code });
  };
  const clear = () => setLines([]);
  const setLine = (v: string) => {
    curRef.current = v;
    setInput(v);
  };

  // Tic de tecleo: reproduce uno de los samples mp3 reales al azar.
  const keyTick = () => {
    if (suppressTickRef.current) return;   // los botones del monitor no suenan a teclado
    if (!AUDIO_ENABLED) return;
    if (navigator.vibrate) navigator.vibrate(8);
    try {
      const ac = acRef.current;
      const bufs = keyBuffersRef.current;
      if (!ac || bufs.length === 0) return;
      if (ac.state === "suspended") ac.resume();
      const src = ac.createBufferSource();
      src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
      const g = ac.createGain();
      g.gain.value = 0.55;
      src.connect(g);
      g.connect(ac.destination);
      src.start(0);
    } catch {
      /* sin audio */
    }
  };

  // Chip sintetizado para el texto que aparece solo (máquina de escribir).
  const printTick = () => {
    if (!AUDIO_ENABLED) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      if (!acRef.current) acRef.current = new AC();
      const ac = acRef.current;
      if (ac.state === "suspended") ac.resume();
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      o.frequency.value = 300 + Math.random() * 160;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.035);
    } catch {
      /* sin audio */
    }
  };

  // Reproduce un SFX corto por Web Audio (buffer pre-decodificado = sin latencia). Fallback a <audio>.
  const playSfx = (src: string, vol = 1) => {
    if (!AUDIO_ENABLED) return;
    const ac = acRef.current;
    const buf = sfxBuffersRef.current[src];
    if (ac && buf) {
      try {
        if (ac.state === "suspended") ac.resume();
        const s = ac.createBufferSource();
        s.buffer = buf;
        const g = ac.createGain();
        g.gain.value = vol;
        s.connect(g);
        g.connect(ac.destination);
        s.start(0);
        return;
      } catch {
        /* cae al fallback */
      }
    }
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.play().catch(() => {});
    } catch {
      /* sin audio */
    }
  };

  const typeLine = async (
    text: string,
    cls: LineClass = "",
    step = 9,
    mark: Mark = "",
    extra: { bullet?: boolean } = {},
  ) => {
    const mk: Mark = text ? mark : "";
    const id = addLine({ text: "", cls, mark: mk, ...extra });
    if (prefersReduced()) {
      setText(id, text);
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      await sleep(step);
      setText(id, text.slice(0, i));
      if (text[i - 1] !== " ") printTick();
    }
  };

  const fitBanner = () => {
    const b = bannerRef.current;
    if (!b) return;
    const wrap = b.parentElement;
    if (!wrap) return;
    // Escalar por FONT-SIZE (no transform): así el banner es un elemento normal que
    // scrollea con el resto. Con transform creaba una capa de composición que en móvil
    // no se repinta al hacer scroll y "se quedaba fija".
    b.style.transform = "none";
    b.style.fontSize = ""; // vuelve a la base del CSS para medir
    const base = parseFloat(getComputedStyle(b).fontSize) || 11;
    const s = Math.min(1, (wrap.clientWidth || 1) / (b.scrollWidth || 1));
    b.style.fontSize = base * s + "px";
    wrap.style.height = ""; // altura natural
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
      await typeLine(dlines[i], "b", 24, ""); // sin marcador: transmisión narrativa
      busyRef.current = false;
      const more = i < dlines.length - 1;
      const chevId = addLine({ text: "", cls: "", mark: "", chev: true, chevMore: more });
      await waitForAdvance();
      setLines((p) => p.filter((x) => x.id !== chevId));
    }
    setDialog(false);
    print("");
  };

  // Spinner UNIVERSAL. Regla: un spinner SIEMPRE deja un \n antes (aire), muestra el texto de carga con
  // el spinner girando, y al terminar la tarea SUSTITUYE el spinner por su salida [OK]/[ERROR] en la
  // MISMA línea. La tarea devuelve { code:"OK"|"ERROR", text, cls }. minMs fuerza una duración mínima.
  const spin = async (
    loadingText: string,
    task: () => Promise<{ code: "OK" | "ERROR"; text: string; cls?: LineClass }>,
    minMs = 0,
  ): Promise<{ code: "OK" | "ERROR"; text: string; cls?: LineClass }> => {
    print(""); // el \n que "gana espacio" antes del spinner
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
    // la salida sustituye al spinner en su misma línea (respeta el \n de antes)
    setLines((p) =>
      p.map((x) =>
        x.id === id ? { ...x, spinner: false, code: res.code, text: res.text, cls: res.cls ?? "" } : x,
      ),
    );
    setLoader(false);
    return res;
  };

  const logoutFlow = async () => {
    setPanel(null); // quita el menú antes de mostrar el spinner
    await spin("Cerrando sesión...", async () => {
      await sleep(2000);
      return { code: "OK", text: "Se ha cerrado su sesión correctamente", cls: "b" };
    });
    setAccount(false); // salimos de la cuenta: el logo vuelve a la pantalla de inicio
    clear(); // vuelve a la pantalla de inicio (con el logo)
  };

  // Abre el panel del personaje (menu). De momento: "Mis mensajes" y "Salir".
  const openPanel = () => {
    setPanel({
      active: 0,
      options: [
        { label: "Mis mensajes", run: () => print("(proximamente: aqui iran tus mensajes)", "muted") },
        { label: "Salir", run: () => logoutFlow() },
      ],
    });
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
      3000, // mínimo 3s (el login real va rápido; fingimos el timing)
    );
    if (res.code === "ERROR") {
      print("");
      return;
    }
    await spin("Descargando metadatos de su cuenta...", async () => {
      await sleep(2500);
      return { code: "OK" as const, text: "Metadatos sincronizados", cls: "b" as LineClass };
    });
    clear(); // limpia la pantalla tras la descarga
    setAccount(true); // entramos a la cuenta: a partir de aqui el logo NO aparece
    openPanel(); // abre el panel del personaje
  };

  // Abre el formulario de login: dos campos con navegacion por flechas.
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
        // deja el formulario fijado en pantalla (limpio) y arranca la secuencia de conexion
        addLine({ text: "[USER] Usuario: " + vals[0], cls: "", mark: "" });
        addLine({ text: "[PASSWORD] Contraseña: " + "*".repeat(vals[1].length), cls: "", mark: "" });
        connectFlow(vals[0].trim(), vals[1]);
      },
    });
  };

  // Teclas cuando hay un formulario en pantalla: flechas navegan campos, Enter avanza/envia.
  const handleFormKey = (k: string) => {
    const f = form;
    if (!f) return;
    if (k === "Shift") {
      keyTick();
      const n = !shiftRef.current;
      shiftRef.current = n;
      setShift(n);
      return;
    }
    const allFilled = f.fields.every((x) => x.value.length > 0);
    const connectAvail = allFilled && !!f.submitLabel;
    const cancelIndex = f.fields.length + (connectAvail ? 1 : 0); // "Cancelar" siempre al final
    const count = cancelIndex + 1;

    if (!f.editing) {
      // NAVEGACION: flechas mueven el caret; Enter selecciona campo / Conectar / Cancelar.
      if (k === "ArrowUp") {
        keyTick();
        setForm({ ...f, active: Math.max(0, f.active - 1) });
      } else if (k === "ArrowDown") {
        keyTick();
        setForm({ ...f, active: Math.min(count - 1, f.active + 1) });
      } else if (k === "Enter") {
        keyTick();
        if (f.active < f.fields.length) {
          setForm({ ...f, editing: true }); // es un campo: a editar
        } else if (f.active === cancelIndex) {
          // "Salir": deja los campos fijados en pantalla (NO limpia) y avisa de la cancelacion
          f.fields.forEach((fld) =>
            addLine({
              text: fld.label + " " + (fld.mask ? "*".repeat(fld.value.length) : fld.value),
              cls: "",
              mark: "",
            }),
          );
          setForm(null);
          print(""); // <br> antes del mensaje (como el hueco que tenian Conectar/Salir)
          print("Se ha cancelado su solicitud");
          print("");
        } else {
          const values = f.fields.map((x) => x.value); // "Conectar": envia
          setForm(null);
          f.onSubmit(values);
        }
      }
      return; // escribir no hace nada hasta seleccionar el campo
    }
    // EDICION: se escribe en el campo activo; las flechas NO navegan; Enter sale a navegacion.
    if (k === "ArrowUp" || k === "ArrowDown") return;
    if (k === "Enter") {
      keyTick();
      setForm({ ...f, editing: false });
      return;
    }
    const setActive = (v: string) => {
      const fields = f.fields.slice();
      fields[f.active] = { ...fields[f.active], value: v };
      setForm({ ...f, fields });
    };
    if (k === "Backspace") {
      keyTick();
      setActive(f.fields[f.active].value.slice(0, -1));
    } else if (k.length === 1) {
      keyTick();
      setActive(f.fields[f.active].value + (shiftRef.current ? k.toUpperCase() : k));
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

  // Manejador único de teclas (teclado en pantalla + teclado físico).
  // Teclas del panel/menu: flechas mueven el caret, Enter ejecuta la opcion.
  const handlePanelKey = (k: string) => {
    const p = panel;
    if (!p) return;
    if (k === "ArrowUp") {
      keyTick();
      setPanel({ ...p, active: Math.max(0, p.active - 1) });
    } else if (k === "ArrowDown") {
      keyTick();
      setPanel({ ...p, active: Math.min(p.options.length - 1, p.active + 1) });
    } else if (k === "Enter") {
      keyTick();
      p.options[p.active].run();
    }
  };

  const handleKey = (k: string) => {
    if (loader) return;
    if (menuOpen) return;
    if (panel) {
      handlePanelKey(k);
      return;
    }
    if (form) {
      handleFormKey(k);
      return;
    }
    if (dialog) {
      if (k === "Enter" || k === " ") {
        keyTick();
        advance();
      }
      return;
    }
    if (!booted) return;
    if (k === "Shift") {
      keyTick();
      const n = !shiftRef.current;
      shiftRef.current = n;
      setShift(n);
      return;
    }
    if (k === "Enter") {
      keyTick();
      const v = curRef.current;
      if (v.trim()) historyRef.current.push(v);
      hposRef.current = historyRef.current.length;
      setLine("");
      submit(v);
    } else if (k === "Backspace") {
      keyTick();
      setLine(curRef.current.slice(0, -1));
    } else if (k === "ArrowUp") {
      keyTick();
      if (hposRef.current > 0) {
        hposRef.current--;
        setLine(historyRef.current[hposRef.current] ?? "");
      }
    } else if (k === "ArrowDown") {
      keyTick();
      if (hposRef.current < historyRef.current.length) {
        hposRef.current++;
        setLine(historyRef.current[hposRef.current] ?? "");
      }
    } else if (k.length === 1) {
      keyTick();
      setLine(curRef.current + (shiftRef.current ? k.toUpperCase() : k));
    }
  };
  handleKeyRef.current = handleKey;

  // Botones de navegacion del monitor (arriba/abajo/OK): hacen su accion pero suenan a boton
  // de monitor (terminal-button), no al tic del teclado.
  const chinKey = (k: string) => {
    if (loader) return; // durante un loader los botones del monitor no hacen nada (ni sonido ni acción)
    playSfx("/audio/terminal-simple-button.mp3");
    suppressTickRef.current = true;
    handleKey(k);
    suppressTickRef.current = false;
  };

  // Click en el hint "(Pulsa ENTER...)" = confirmar (equivale a Enter), con sonido de click.
  const confirmClick = () => {
    playSfx("/audio/mouse-click.mp3");
    suppressTickRef.current = true;
    handleKey("Enter");
    suppressTickRef.current = false;
  };

  // Mantener pulsada una tecla: primer toque con sonido+vibración; luego repite el carácter en SILENCIO hasta soltar.
  const stopHold = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };
  const repeatKey = (k: string) => {
    if (k === "Backspace") setLine(curRef.current.slice(0, -1));
    else if (k.length === 1) setLine(curRef.current + (shiftRef.current ? k.toUpperCase() : k));
  };
  const startHold = (k: string) => {
    handleKey(k); // primer toque: inserta/borra + sonido + vibración
    stopHold();
    const repeatable = booted && !menuOpen && !dialog && !form && !panel && !loader && (k === "Backspace" || k.length === 1);
    if (!repeatable) return;
    holdTimerRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => repeatKey(k), 60); // repeticiones SIN sonido
    }, 350);
  };
  const holdProps = (k: string) => ({
    onPointerDown: () => startHold(k),
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  const runFromMenu = (cmd: string) => {
    setMenuOpen(false);
    if (dialog) return;
    submit(cmd);
  };

  // Sonido de click en el chrome del terminal (cerrar X, cog/menu, items, botones de dialogo...).
  const chromeClick = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) playSfx("/audio/mouse-click.mp3");
  };

  // Logging remoto para depurar en el movil (gateado tras ?debug=1).
  useEffect(() => {
    initRemoteLog();
  }, []);

  // Prepara la sesion (anonima) con Supabase al arrancar, para que el login vaya fluido.
  useEffect(() => {
    ensureSession().catch(() => {});
  }, []);

  // Animacion de pulsado garantizada: con :active (atado a la duracion del toque) un tap ultrarrapido
  // deja la animacion a medias. En su lugar marcamos el boton y lo mantenemos un minimo de tiempo,
  // asi la transicion completa (bajada + sostener + subida) se ve entera pulses como pulses. Usamos
  // un ATRIBUTO (data-pressing), no una clase: React solo gestiona `class` (lo del JSX), asi que al
  // re-renderizar un toggle (kbd/power cambia a is-on) no nos borra la marca. Delegado a nivel
  // ventana (captura) para no tener que tocar cada boton.
  useEffect(() => {
    let cur: HTMLElement | null = null;
    let at = 0;
    let min = 130; // ms que se sostiene el pulsado: >= la transicion mas larga (.08s) con margen
    let timer = 0;
    const down = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.(".chin-btn, .keyboard button") as HTMLElement | null;
      if (!btn) return;
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      if (cur && cur !== btn) cur.removeAttribute("data-pressing");
      cur = btn;
      at = performance.now();
      // los toggle (kbd/power) sostienen la sombra un pelin mas para que se aprecie la fase intermedia
      min = btn.classList.contains("chin-kb") ? 200 : 130;
      btn.setAttribute("data-pressing", "");
    };
    const up = () => {
      if (!cur) return;
      const btn = cur;
      cur = null;
      const wait = Math.max(0, min - (performance.now() - at));
      timer = window.setTimeout(() => {
        btn.removeAttribute("data-pressing");
        timer = 0;
      }, wait);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Arranque: mapa de curvatura + banner + secuencia de boot (una sola vez).
  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;

    // Mapas de desplazamiento para el abombado 3D. `strength` mayor = curva más esférica/pronunciada.
    const makeMap = (strength: number): string | null => {
      const g = document.createElement("canvas");
      if (!g.getContext) return null;
      const size = 96;
      g.width = g.height = size;
      const ctx2d = g.getContext("2d");
      if (!ctx2d) return null;
      const im = ctx2d.createImageData(size, size);
      const d = im.data;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const nx = (x / (size - 1)) * 2 - 1;
          const ny = (y / (size - 1)) * 2 - 1;
          const f = strength * (nx * nx + ny * ny);
          const i = (y * size + x) * 4;
          d[i] = Math.max(0, Math.min(255, 128 + nx * f * 127));
          d[i + 1] = Math.max(0, Math.min(255, 128 + ny * f * 127));
          d[i + 2] = 128;
          d[i + 3] = 255;
        }
      ctx2d.putImageData(im, 0, 0);
      return g.toDataURL();
    };
    const setHref = (fe: SVGFEImageElement | null, u: string | null) => {
      if (!fe || !u) return;
      fe.setAttribute("href", u);
      fe.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", u);
    };
    try {
      const url = makeMap(0.4); // barril actual
      setHref(feImageRef.current, url);
      if (url) setWarpReady(true);
    } catch {
      /* navegador sin soporte: se queda plano */
    }

    // Precarga los samples de tecleo (mp3 reales) en buffers.
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AUDIO_ENABLED && AC) {
        if (!acRef.current) acRef.current = new AC();
        const ac = acRef.current;
        Promise.all(
          ["a", "b"].map((n) =>
            fetch(`/audio/key-${n}.mp3`)
              .then((r) => r.arrayBuffer())
              .then((a) => ac.decodeAudioData(a)),
          ),
        )
          .then((bufs) => {
            keyBuffersRef.current = bufs;
          })
          .catch(() => {});
        fetch("/audio/terminal-humming.mp3")
          .then((r) => r.arrayBuffer())
          .then((a) => ac.decodeAudioData(a))
          .then((b) => {
            humBufferRef.current = b;
          })
          .catch(() => {});
        // SFX de click pre-decodificados (para que suenen sin latencia)
        ["/audio/mouse-click.mp3", "/audio/terminal-button.mp3", "/audio/terminal-simple-button.mp3"].forEach(
          (src) => {
            fetch(src)
              .then((r) => r.arrayBuffer())
              .then((a) => ac.decodeAudioData(a))
              .then((b) => {
                sfxBuffersRef.current[src] = b;
              })
              .catch(() => {});
          },
        );
      }
    } catch {
      /* sin audio */
    }

    if (bannerRef.current) {
      bannerRef.current.textContent = frameArt(BANNER);
      fitBanner();
    }
    const onResize = () => fitBanner();
    window.addEventListener("resize", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBanner);

    rlog("info", "boot done");

    // Menú principal del terminal: saludo + directivas (typewriter, letra a letra) + sincronización.
    // No marcamos booted hasta el final, así el prompt no parpadea mientras se escribe la bienvenida.
    (async () => {
      await typeLine("Bienvenido/a a SANTAS OCHOVA: Tu Mejor Librería.", "", 16);
      await typeLine("Antes de continuar, le recuerdamos nuestras directivas:", "", 16);
      print("");
      await typeLine("Literatura correcta para ciudadanos correctos.", "muted", 16, "", { bullet: true });
      await typeLine("Una mente condicionada es una mente feliz.", "muted", 16, "", { bullet: true });
      await typeLine("La lectura sin propósito produce inestabilidad social.", "muted", 16, "", { bullet: true });
      await spin("Sincronizando...", async () => {
        await sleep(2500);
        return { code: "OK", text: "Sistema sincronizado", cls: "b" };
      });
      setBooted(true); // ahora sí: aparece el prompt
    })();

    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // iOS Safari deja de repintar la pantalla tras los cambios de estado de React (solo entra un input
  // y se congela; el panel de diagnostico lo tapaba porque forzaba repintados). Tras cada commit
  // forzamos un reflow del CRT: display off + lectura de offsetHeight + on, todo SINCRONO en el mismo
  // turno de JS, asi iOS re-rasteriza y no hay parpadeo visible. Preservamos el scroll del contenido.
  // Teclado físico (PC): enruta al mismo manejador que el teclado en pantalla.
  useEffect(() => {
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
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => stopHold, []);

  // iOS tarda en la PRIMERA reproduccion de cada buffer (lo prepara en ese instante), por eso el
  // primer clic de cada sonido iba con retraso. En el primer gesto (fase de CAPTURA, antes que los
  // handlers de React) "calentamos" todos los buffers reproduciendolos en silencio, para que las
  // primeras pulsaciones reales ya suenen inmediatas.
  useEffect(() => {
    if (!AUDIO_ENABLED) return;
    const warm = () => {
      const ac = acRef.current;
      if (!ac) return; // aun sin contexto: reintenta en el siguiente gesto
      try {
        if (ac.state === "suspended") ac.resume();
        const g = ac.createGain();
        g.gain.value = 0;
        g.connect(ac.destination);
        const all = [...keyBuffersRef.current, ...Object.values(sfxBuffersRef.current)];
        if (humBufferRef.current) all.push(humBufferRef.current);
        for (const b of all) {
          const s = ac.createBufferSource();
          s.buffer = b;
          s.connect(g);
          s.start(0);
          s.stop(ac.currentTime + 0.02);
        }
      } catch {
        /* sin audio */
      }
      window.removeEventListener("pointerdown", warm, true);
      window.removeEventListener("keydown", warm, true);
    };
    window.addEventListener("pointerdown", warm, true);
    window.addEventListener("keydown", warm, true);
    return () => {
      window.removeEventListener("pointerdown", warm, true);
      window.removeEventListener("keydown", warm, true);
    };
  }, []);

  // Zumbido de fondo del CRT via Web Audio (bypassa el interruptor de silencio de iOS, que
  // silencia los <audio>; por eso en movil no sonaba). Loop; arranca en la primera interaccion.
  useEffect(() => {
    const start = () => {
      const ac = acRef.current;
      const buf = humBufferRef.current;
      if (!ac || !buf || humSrcRef.current) return; // aun no listo: sigue escuchando
      if (ac.state === "suspended") ac.resume();
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ac.createGain();
      g.gain.value = 0.075; // 15%
      src.connect(g);
      g.connect(ac.destination);
      src.start(0);
      humSrcRef.current = src;
      rlog("audio", "hum started (contexto running)", { state: ac.state });
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  const onScreenPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest(".win98")) return; // clics en header/menú/teclado: los gestiona el chrome
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (dialog) {
      advance();
    }
  };

  const closeAttempt = () => {
    window.location.href = "/";
  };

  const showInput = booted && !dialog && !loader && !panel;
  // Acciones del formulario: "Conectar" (si todos los campos llenos) y "Cancelar" (siempre, al final).
  const fAllFilled = form ? form.fields.every((x) => x.value.length > 0) : false;
  const fConnect = !!form?.submitLabel && fAllFilled;
  const fCancelIdx = form ? form.fields.length + (fConnect ? 1 : 0) : 0;

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="barrel" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage ref={feImageRef} result="map" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {SHOW_BUILD && (
        <div className="build-stamp" aria-hidden="true">
          build {BUILD}
        </div>
      )}

      <div className="monitor">
        <div className="screen-area">
        <div
          className={"crt curved" + (warpReady && WARP_ENABLED ? " warp" : "")}
          onPointerDown={onScreenPointerDown}
        >
          <div className="win98 win-header" onPointerDownCapture={chromeClick}>
            <div className="title-bar">
              <img className="title-icon" src="/icons/term.png" alt="" />
              <div className="title-bar-text">santasochova-term.exe</div>
              <div className="title-bar-controls">
                <button type="button" className="win-cog" aria-label="Menú" onClick={() => setMenuOpen((v) => !v)}>⚙</button>
                <button type="button" aria-label="Close" onClick={() => setConfirmClose(true)}></button>
              </div>
            </div>
          </div>
          <div className="crt-body">
          <div className="content" ref={scrollRef}>
            <div className="banner-wrap" hidden={account}>
              <pre className="banner" ref={bannerRef}></pre>
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
            )}
          </div>
          {menuOpen && (
            <aside className="win98 win-sidebar" onPointerDownCapture={chromeClick}>
              <div className="window">
                <div className="title-bar">
                  <div className="title-bar-text">Menú</div>
                  <div className="title-bar-controls">
                    <button type="button" aria-label="Close" onClick={() => setMenuOpen(false)}></button>
                  </div>
                </div>
                <div className="window-body">
                  <button type="button" onClick={() => runFromMenu("help")}>Ayuda</button>
                  <button type="button" onClick={() => runFromMenu("catalogo")}>Catálogo</button>
                  <button type="button" onClick={() => runFromMenu("contacto")}>Último mensaje</button>
                  <button type="button" onClick={() => runFromMenu("limpiar")}>Limpiar pantalla</button>
                </div>
              </div>
            </aside>
          )}
          </div>
        </div>
        <div className="curve-overlay"></div>
        </div>
        <div className="monitor-chin">
          <span className="monitor-brand">SANTAS OCHOVA</span>
          <div className="chin-buttons">
            <button
              type="button"
              className={"chin-btn chin-kb" + (showKeyboard ? " is-on" : "")}
              aria-pressed={showKeyboard}
              aria-label={showKeyboard ? "Ocultar teclado" : "Mostrar teclado"}
              onPointerDown={() => {
                if (loader) return;
                playSfx("/audio/terminal-button.mp3");
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              onClick={() => { if (loader) return; setShowKeyboard((v) => !v); }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 5h2v14h-2v2H3v-2H1V5h2V3h18v2ZM6 17h12v-2H6v2Zm1-4h2v-2H7v2Zm4 0h2v-2h-2v2Zm4 0h2v-2h-2v2ZM5 9h2V7H5v2Zm4 0h2V7H9v2Zm4 0h2V7h-2v2Zm4 0h2V7h-2v2Z"/></svg>
            </button>
            <button type="button" className="chin-btn" aria-label="Arriba" onPointerDown={() => chinKey("ArrowUp")}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 20h2V4h-2zm2-12h2V6h-2zm2 2h2V8h-2zm2 2h2v-2h-2zm-6-4H9V6h2z"/><path d="M15 10H7V8h8zm2 2H5v-2h12z"/></svg>
            </button>
            <button type="button" className="chin-btn" aria-label="Abajo" onPointerDown={() => chinKey("ArrowDown")}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 12h6v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2h6V4h2v8Z"/></svg>
            </button>
            <button type="button" className="chin-btn" aria-label="OK" onPointerDown={() => chinKey("Enter")}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7h2v16H9zm2 0h2v15h-2zm2 2h2v12h-2zm2 2h2v8h-2zm2 2h2v6h-2zm2 2h2v2h-2z"/><path d="M11 21h2v2h-2zm2-2h2v2h-2zm2-2h6v2h-6zm0-12h2v2h-2zM5 10h2v2H5zm0-5h2v2H5zm4-4h2v4H9zM3 3h2v2H3zm0 9h2v2H3zm14-9h2v2h-2z"/></svg>
            </button>
            <button
              type="button"
              className={"chin-btn chin-kb chin-power" + (powerOn ? " is-on" : "")}
              aria-pressed={powerOn}
              aria-label={powerOn ? "Apagar" : "Encender"}
              onPointerDown={() => {
                if (loader) return;
                playSfx("/audio/terminal-button.mp3");
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              onClick={() => { if (loader) return; setPowerOn((v) => !v); }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M18 22H6v-2h12v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V8h2v10Zm18 0h-2V8h2v10Zm-9-7h-2V2h2v9ZM6 8H4V6h2v2Zm14 0h-2V6h2v2ZM8 6H6V4h2v2Zm10 0h-2V4h2v2Z"/></svg>
            </button>
            <span className={"chin-led" + (powerOn ? "" : " off")} aria-hidden="true"></span>
          </div>
        </div>
      </div>

      {showKeyboard && (
      <div className="keyboard">
        {!numMode ? (
        <>
        <div className="krow">
          {["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>
              {shift ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
        <div className="krow">
          {["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>
              {shift ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
        <div className="krow">
          <button type="button" className="kmod" aria-pressed={shift} aria-label="Mayúsculas" onPointerDown={() => handleKey("Shift")}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3h2v2h2v2h2v2h2v4h-5v8H8v-8H3V9h2V7h2V5h2V3h2V1h2v2Z"/></svg>
          </button>
          {["z", "x", "c", "v", "b", "n", "m"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>
              {shift ? k.toUpperCase() : k}
            </button>
          ))}
          <button
            type="button"
            className="kmod"
            aria-label="Borrar"
            {...holdProps("Backspace")}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 19H8v-2H6v-2H4v-2H2v-2h2V9h2V7h2V5h12v2h2v10h-2v2Zm-8-8h2v2h-2v2h2v-2h2v2h2v-2h-2v-2h2V9h-2v2h-2V9h-2v2Z"/></svg>
          </button>
        </div>
        <div className="krow">
          <button type="button" className="knum" onPointerDown={() => { if (loader) return; keyTick(); setNumMode(true); }}>123</button>
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => handleKey("Enter")}>Enter</button>
        </div>
        </>
        ) : (
        <>
        <div className="krow">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          {["¿", "?", "¡", "!", ".", ",", "-"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          {["+", ":", ";", "*", "#", "@"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
          <button type="button" className="kmod" aria-label="Borrar" {...holdProps("Backspace")} onContextMenu={(e) => e.preventDefault()}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 19H8v-2H6v-2H4v-2H2v-2h2V9h2V7h2V5h12v2h2v10h-2v2Zm-8-8h2v2h-2v2h2v-2h2v2h2v-2h-2v-2h2V9h-2v2h-2V9h-2v2Z"/></svg>
          </button>
        </div>
        <div className="krow">
          <button type="button" className="knum" onPointerDown={() => { if (loader) return; keyTick(); setNumMode(false); }}>ABC</button>
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => handleKey("Enter")}>Enter</button>
        </div>
        </>
        )}
      </div>
      )}

      {confirmClose && (
        <div className="win98 confirm-overlay" onPointerDownCapture={chromeClick}>
          <div className="window confirm-dialog">
            <div className="title-bar">
              <div className="title-bar-text">Cerrar sesión</div>
              <div className="title-bar-controls">
                <button type="button" aria-label="Close" onClick={() => setConfirmClose(false)}></button>
              </div>
            </div>
            <div className="window-body">
              <div className="confirm-row">
                <img className="confirm-icon" src="/icons/msg_question.png" alt="" />
                <p>¿Seguro que quieres salir del sistema?</p>
              </div>
              <div className="confirm-buttons">
                <button type="button" onClick={closeAttempt}>Sí</button>
                <button type="button" onClick={() => setConfirmClose(false)}>No</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
