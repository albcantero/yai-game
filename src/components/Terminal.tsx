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
      print("prueba /help", "muted");
      print("");
      return;
    }
    const ctx: Ctx = { print, clear, startDialog: runDialog, arg, raw: line };
    command.run(ctx);
    if (!command.names.includes("/contacto")) print("");
  };

  // Manejador único de teclas (teclado en pantalla + teclado físico).
  const handleKey = (k: string) => {
    if (menuOpen) return;
    if (dialog) {
      if (k === "Enter" || k === " ") advance();
      return;
    }
    if (!booted) return;
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
      keyTick();
      setLine(curRef.current + k);
    }
  };
  handleKeyRef.current = handleKey;

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
      await typeLine("escribe /help y pulsa Enter para empezar.", "", 10);
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
                  <button type="button" onClick={() => runFromMenu("/help")}>Ayuda</button>
                  <button type="button" onClick={() => runFromMenu("/catalogo")}>Catálogo</button>
                  <button type="button" onClick={() => runFromMenu("/contacto")}>Último mensaje</button>
                  <button type="button" onClick={() => runFromMenu("/limpiar")}>Limpiar pantalla</button>
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
                onChange={() => setShowKeyboard((v) => !v)}
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
        {[
          ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
          ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
          ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
          ["z", "x", "c", "v", "b", "n", "m", "/", "-", "."],
        ].map((row, ri) => (
          <div className="krow" key={ri}>
            {row.map((k) => (
              <button type="button" key={k} onClick={() => handleKey(k)}>
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        ))}
        <div className="krow">
          <button type="button" className="kwide" onClick={() => handleKey("Backspace")}>⌫</button>
          <button type="button" className="kspace" onClick={() => handleKey(" ")}>espacio</button>
          <button type="button" className="kwide" onClick={() => handleKey("Enter")}>Enter ↵</button>
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
