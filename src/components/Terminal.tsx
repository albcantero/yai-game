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

const SWITCH_SFX =
  "data:audio/mpeg;base64,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l66A+sBKsb3MK//SnKSoeEbwjlksu4Y6nUw8//swZPsA8awMWfghSAAAAA0gAAABCB0LYeAwQ4gAADSAAAAElUxBTUUzLjEwMFVVVVVVVVVVVVVVgRCAAnmjmEjpMKT//f6oUrbOjqnbawppb6P//2DCQVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//swZPuA8etCV/kBHWAAAA0gAAABBxBTXeA8YoAAADSAAAAEVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sgZPyA8agY1vgLEKAAAA0gAAABBxDdV+KkToAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7IGT0gPF8JNV4BxHQAAANIAAAAQUcZVOgCSfAAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk9wzxTDJTaCASMgAADSAAAAEDIJ9QQAh2gAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTtjfDOL1IYARUQAAANIAAAAQC4ATIAAAAAAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAf4AAAAgAAA0gAAABAAAB/gAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [booted, setBooted] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [warpReady, setWarpReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [shift, setShift] = useState(false);

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

  // Tic de tecleo: reproduce uno de los 4 samples mp3 reales al azar.
  const keyTick = () => {
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
    b.style.transform = "none";
    const wrap = b.parentElement;
    if (!wrap) return;
    const s = Math.min(1, (wrap.clientWidth || 1) / (b.scrollWidth || 1));
    b.style.transform = `scale(${s})`;
    wrap.style.height = Math.ceil(b.getBoundingClientRect().height) + "px";
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
    onPointerDown: (e: ReactPointerEvent) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startHold(k);
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  const runFromMenu = (cmd: string) => {
    setMenuOpen(false);
    if (dialog) return;
    submit(cmd);
  };

  // Arranque: mapa de curvatura + banner + secuencia de boot (una sola vez).
  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;

    // Mapa de desplazamiento para el abombado 3D (convexo). Se aplica SOLO al .content.
    try {
      const fe = feImageRef.current;
      const g = document.createElement("canvas");
      if (fe && g.getContext) {
        const size = 96;
        g.width = g.height = size;
        const ctx2d = g.getContext("2d");
        if (ctx2d) {
          const im = ctx2d.createImageData(size, size);
          const d = im.data;
          const strength = 0.4;
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
          const url = g.toDataURL();
          fe.setAttribute("href", url);
          fe.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
          setWarpReady(true);
        }
      }
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
          [1, 2, 3, 4].map((n) =>
            fetch(`/audio/key${n}.mp3`)
              .then((r) => r.arrayBuffer())
              .then((a) => ac.decodeAudioData(a)),
          ),
        )
          .then((bufs) => {
            keyBuffersRef.current = bufs;
          })
          .catch(() => {});
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
          <div className="win98 win-header">
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
            <aside className="win98 win-sidebar">
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
          <span className="kbd-switch">
            <label className="switch" title={showKeyboard ? "Ocultar teclado" : "Mostrar teclado"}>
              <input
                className="switch__input"
                type="checkbox"
                role="switch"
                aria-label="Mostrar u ocultar el teclado en pantalla"
                checked={showKeyboard}
                onChange={() => {
                  setShowKeyboard((v) => !v);
                  try {
                    new Audio(SWITCH_SFX).play().catch(() => {});
                  } catch {
                    /* sin audio */
                  }
                  if (navigator.vibrate) navigator.vibrate(50);
                }}
              />
              <span className="switch__lever-shadow"></span>
              <span className="switch__lever">
                <span className="switch__lever-sides"></span>
                <span className="switch__lever-half-top"></span>
                <span className="switch__lever-half-bottom"></span>
              </span>
              <span className="switch__label">Teclado</span>
            </label>
          </span>
          <span className="monitor-led" aria-hidden="true"></span>
        </div>
      </div>

      {showKeyboard && (
      <div className="keyboard">
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
            <svg viewBox="0 0 500 500" aria-hidden="true"><path d="M433.704,237.465c4.456,6.086,7.092,13.539,7.092,21.622c0,20.079-16.266,36.341-36.344,36.341h-36.341c-9.991,0-18.173,8.18-18.173,18.172v109.025c0,20.079-16.262,36.341-36.341,36.341H186.4c-20.079,0-36.34-16.262-36.34-36.341V313.6c0-9.992-8.181-18.172-18.172-18.172H95.547c-20.079,0-36.342-16.262-36.342-36.341c0-8.083,2.635-15.536,7.08-21.622L217.747,54.388c17.807-17.808,46.695-17.808,64.505,0L433.704,237.465z"/></svg>
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5,5h-10C8.234,5,6.666,5.807,5.93,6.837L3.32,10.49c-0.642,0.898-1.182,1.654-1.199,1.679C2,12.344,1.999,12.661,2.124,12.833c0.023,0.033,0.555,0.777,1.188,1.664l2.619,3.667C6.666,19.193,8.233,20,9.5,20h10c1.379,0,2.5-1.122,2.5-2.5v-10C22,6.122,20.879,5,19.5,5z M17.207,14.793c0.391,0.391,0.391,1.023,0,1.414C17.012,16.402,16.756,16.5,16.5,16.5s-0.512-0.098-0.707-0.293L13.5,13.914l-2.293,2.293C11.012,16.402,10.756,16.5,10.5,16.5s-0.512-0.098-0.707-0.293c-0.391-0.391-0.391-1.023,0-1.414l2.293-2.293l-2.293-2.293c-0.391-0.391-0.391-1.023,0-1.414s1.023-0.391,1.414,0l2.293,2.293l2.293-2.293c0.391-0.391,1.023-0.391,1.414,0s0.391,1.023,0,1.414L14.914,12.5L17.207,14.793z"/></svg>
          </button>
        </div>
        <div className="krow">
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => handleKey("Enter")}>Enter</button>
        </div>
      </div>
      )}

      {confirmClose && (
        <div className="win98 confirm-overlay">
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
