import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { commands } from "../terminal/commands";
import type { Command, Ctx, LineClass } from "../terminal/types";
import BANNER from "../terminal/banner.txt?raw";

type Mark = "*" | ">" | "";
interface Line {
  id: number;
  text: string;
  cls: LineClass;
  mark: Mark;
  chev?: boolean;
  chevMore?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const prefersReduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
const finePointer = () =>
  typeof matchMedia !== "undefined" && matchMedia("(hover:hover) and (pointer:fine)").matches;

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
    addLine({ text, cls, mark: text ? "*" : "" });
  };
  const echo = (text: string) => {
    addLine({ text, cls: "", mark: ">" });
  };
  const clear = () => setLines([]);
  const setLine = (v: string) => {
    curRef.current = v;
    setInput(v);
  };

  // Tic de tecleo: reproduce uno de los samples mp3 reales al azar.
  const keyTick = () => {
    if (suppressTickRef.current) return;   // los botones del monitor no suenan a teclado
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

  const typeLine = async (text: string, cls: LineClass = "", step = 9, mark: Mark = "*") => {
    const mk: Mark = text ? mark : "";
    const id = addLine({ text: "", cls, mark: mk });
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

  const submit = (raw: string) => {
    const line = raw.trim();
    echo(line);
    if (!line) return;
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");
    const command = lookup.get(cmd);
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

  // Manejador único de teclas (teclado en pantalla + teclado físico).
  const handleKey = (k: string) => {
    if (menuOpen) return;
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
    playSfx("/audio/terminal-click-button-switch.mp3");
    suppressTickRef.current = true;
    handleKey(k);
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
    const repeatable = booted && !menuOpen && !dialog && (k === "Backspace" || k.length === 1);
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
      if (AC) {
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
        ["/audio/mouse-click.mp3", "/audio/terminal-button.mp3", "/audio/terminal-click-button-switch.mp3"].forEach(
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

    void (async () => {
      await typeLine("sistema interno · nodo trastienda", "muted", 6);
      await typeLine("inicializando módulos .............. OK", "", 6);
      await typeLine("enlace cifrado ..................... OK", "", 6);
      await typeLine("[AVISO] registro de actividad: OFF", "muted", 8);
      print("");
      await typeLine("escribe help y pulsa Enter para empezar.", "", 10);
      print("");
      setBooted(true);
    })();

    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

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
      g.gain.value = 0.38; // 75% de lo anterior
      src.connect(g);
      g.connect(ac.destination);
      src.start(0);
      humSrcRef.current = src;
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

  const showInput = booted && !dialog;

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="barrel" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage ref={feImageRef} result="map" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="monitor">
        <div className="screen-area">
        <div
          className={"crt curved" + (warpReady ? " warp" : "")}
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
            <div className="banner-wrap">
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
              ) : (
                <div className={"row" + (l.cls ? " " + l.cls : "")} key={l.id}>
                  {l.mark && <span className={l.mark === ">" ? "prompt" : "astk"}>{l.mark + " "}</span>}
                  {l.text}
                </div>
              ),
            )}
            {showInput && (
              <div className="inputline">
                <span className="prompt">{">"}</span>
                <span className="field">
                  <span className="mirror">{input}</span>
                  <span className="cursor">█</span>
                </span>
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
                playSfx("/audio/terminal-button.mp3");
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              onClick={() => setShowKeyboard((v) => !v)}
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
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 9h-2v12h2v2H9V7h4v2Zm2 12h-2v-2h2v2Zm6-2h-6v-2h4v-2h2v4Zm-2-4h-2v-2h2v2ZM5 14H3v-2h2v2Zm12-1h-2v-2h2v2ZM7 12H5v-2h2v2Zm8-1h-2V9h2v2ZM7 7H5V5h2v2Zm10 0h-2V5h2v2ZM5 5H3V3h2v2Zm6 0H9V1h2v4Zm8 0h-2V3h2v2Z"/></svg>
            </button>
            <button
              type="button"
              className={"chin-btn chin-kb chin-power" + (powerOn ? " is-on" : "")}
              aria-pressed={powerOn}
              aria-label={powerOn ? "Apagar" : "Encender"}
              onPointerDown={() => {
                playSfx("/audio/terminal-button.mp3");
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              onClick={() => setPowerOn((v) => !v)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 22H6v-2h12v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V8h2v10Zm18 0h-2V8h2v10Zm-9-7h-2V2h2v9ZM6 8H4V6h2v2Zm14 0h-2V6h2v2ZM8 6H6V4h2v2Zm10 0h-2V4h2v2Z"/></svg>
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
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 21h8v-2H8zm0-2h2v-6H8zm-5-6h5v-2H3zm0-2h2V9H3zm2-2h2V7H5zm2-2h2V5H7zm2-2h2V3H9zm2-2h2V1h-2zm2 2h2V3h-2zm2 2h2V5h-2zm2 2h2V7h-2zm2 4h2V9h-2zm-3 0h3v-2h-3zm-2 6h2v-6h-2z"/></svg>
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
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 19H8v-2h12v2ZM8 17H6v-2h2v2Zm14 0h-2V7h2v10ZM6 15H4v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2ZM4 13H2v-2h2v2Zm12 0h-2v-2h2v2ZM6 11H4V9h2v2Zm8 0h-2V9h2v2Zm4 0h-2V9h2v2ZM8 9H6V7h2v2Zm12-2H8V5h12v2Z"/></svg>
          </button>
        </div>
        <div className="krow">
          <button type="button" className="knum" onPointerDown={() => { keyTick(); setNumMode(true); }}>123</button>
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => handleKey("Enter")}>Enter</button>
        </div>
        </>
        ) : (
        <>
        <div className="krow">
          {["1", "2", "3"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          {["4", "5", "6"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          {["7", "8", "9"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          {["*", "0", "#"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          <button type="button" className="knum" onPointerDown={() => { keyTick(); setNumMode(false); }}>ABC</button>
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kmod" aria-label="Borrar" {...holdProps("Backspace")} onContextMenu={(e) => e.preventDefault()}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 19H8v-2h12v2ZM8 17H6v-2h2v2Zm14 0h-2V7h2v10ZM6 15H4v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2ZM4 13H2v-2h2v2Zm12 0h-2v-2h2v2ZM6 11H4V9h2v2Zm8 0h-2V9h2v2Zm4 0h-2V9h2v2ZM8 9H6V7h2v2Zm12-2H8V5h12v2Z"/></svg>
          </button>
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
