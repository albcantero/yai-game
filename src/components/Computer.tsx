import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { initRemoteLog, rlog, BUILD } from "../lib/rlog";
import Terminal from "./screens/Terminal";

// Warp CRT (abombado 3D via filtro SVG).
const WARP_ENABLED = true;
// Audio del terminal por Web Audio (bypassa el interruptor de silencio de iOS). ON.
const AUDIO_ENABLED = true;
// Sello de build (SHA) visible en una esquina (dev). Poner en false para la versión final.
const SHOW_BUILD = true;
// Opciones del menú de inicio (vista "home" dentro del CRT). Terminal entra; Tienda/Fases: próximamente.
const HOME_OPTS = ["Terminal", "Tienda", "Fases"];

// EL ARMAZÓN ("el PC"): monitor, teclado, AUDIO, warp y la vista de inicio. Persiste siempre; cada
// pantalla (screens/Terminal, y en el futuro Shop, Lobby...) se monta encima como un componente.
// Reiniciar una pantalla = salir de su vista → el hijo se desmonta y React lo limpia todo.
export default function Computer() {
  const [warpReady, setWarpReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [powerOn, setPowerOn] = useState(true);
  const [shiftMode, setShiftMode] = useState<"off" | "shift" | "caps">("off"); // off=minús, shift=1 letra, caps=bloqueo
  const [numMode, setNumMode] = useState(false);
  const [view, setView] = useState<"home" | "terminal">("home");
  const [homeActive, setHomeActive] = useState(0);

  const feImageRef = useRef<SVGFEImageElement>(null);
  const didBoot = useRef(false);
  const acRef = useRef<AudioContext | null>(null);
  const keyBuffersRef = useRef<AudioBuffer[]>([]);
  const humBufferRef = useRef<AudioBuffer | null>(null);
  const humSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const sfxBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const suppressTickRef = useRef(false); // silencia el tic de tecla cuando el sonido lo dispara otra cosa
  const shiftModeRef = useRef<"off" | "shift" | "caps">("off");
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const termKeyRef = useRef<(k: string) => void>(() => {}); // handleKey del terminal montado
  const runCmdRef = useRef<(cmd: string) => void>(() => {}); // submit del terminal (menú lateral)
  const loaderRef = useRef(false); // hay un loader en el terminal (bloquea los botones del monitor)
  const dispatchRef = useRef<(k: string) => void>(() => {}); // dispatchKey estable para el teclado físico
  const termPauseRef = useRef<(v: boolean) => void>(() => {}); // pausa/reanuda el terminal (lo registra el hijo)

  // ---------- Audio (Web Audio, compartido con el terminal por props) ----------
  const keyTick = () => {
    if (suppressTickRef.current) return;
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

  const setShiftState = (m: "off" | "shift" | "caps") => {
    shiftModeRef.current = m;
    setShiftMode(m);
  };
  const consumeShift = () => {
    if (shiftModeRef.current === "shift") setShiftState("off");
  };

  // ---------- Enrutado de teclas (teclado en pantalla + físico + botones del monitor) ----------
  const homeSelect = (i: number) => {
    if (i === 0) setView("terminal");
  };
  const handleHomeKey = (k: string) => {
    if (k === "ArrowUp") setHomeActive((a) => Math.max(0, a - 1));
    else if (k === "ArrowDown") setHomeActive((a) => Math.min(HOME_OPTS.length - 1, a + 1));
    else if (k === "Enter") homeSelect(homeActive);
  };
  // El armazón pone el CLIC de tecla (keyTick) una vez por pulsación y luego delega según la vista.
  const dispatchKey = (k: string) => {
    if (menuOpen || confirmClose) return; // menú/diálogo abiertos = terminal en pausa, no acepta teclas
    keyTick();
    if (view === "home") {
      handleHomeKey(k);
      return;
    }
    if (k === "Shift") {
      const cur = shiftModeRef.current;
      setShiftState(cur === "off" ? "shift" : cur === "shift" ? "caps" : "off");
      return;
    }
    termKeyRef.current(k);
  };
  dispatchRef.current = dispatchKey;

  // Menú lateral o diálogo de cierre abiertos => PAUSA el terminal (congela boot/typeLine/spinners,
  // esté como esté). Al cerrarlos, reanuda donde iba. Lo ejecuta el hijo vía termPauseRef.
  useEffect(() => {
    termPauseRef.current(menuOpen || confirmClose);
  }, [menuOpen, confirmClose]);

  // Botones del monitor (flechas/OK): suenan a botón, no a tecla. Bloqueados si hay loader en el terminal.
  const chinKey = (k: string) => {
    if (loaderRef.current) return;
    playSfx("/audio/terminal-simple-button.mp3");
    suppressTickRef.current = true;
    dispatchKey(k);
    suppressTickRef.current = false;
  };

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
  const startHold = (k: string) => {
    dispatchKey(k); // primer toque (con sonido)
    stopHold();
    const repeatable = view === "terminal" && (k === "Backspace" || k.length === 1);
    if (!repeatable) return;
    holdTimerRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        suppressTickRef.current = true;
        dispatchKey(k); // repeticiones SIN sonido
        suppressTickRef.current = false;
      }, 60);
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
    if (view === "terminal") runCmdRef.current(cmd);
  };
  const chromeClick = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) playSfx("/audio/mouse-click.mp3");
  };
  const onScreenPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest(".win98")) return;
    if (menuOpen) setMenuOpen(false);
  };
  const closeAttempt = () => {
    setConfirmClose(false);
    setView("home"); // salir del sistema: el hijo <Terminal> se desmonta → reinicio limpio
  };

  // ---------- Efectos del armazón ----------
  useEffect(() => {
    initRemoteLog();
  }, []);

  // Animación de pulsado POR BOTÓN (no global): cada botón completa su animación entera (baja y sube,
  // con un mínimo garantizado) aunque lo pulses rapidísimo. Se pueden pulsar varias teclas a la vez sin
  // ahogo: cada pointer va por su cuenta. Solo se ignora re-pulsar EL MISMO botón mientras aún anima
  // (eso evita el doble-fire que motivó el guard). Multitáctil: se rastrea por pointerId.
  useEffect(() => {
    const presses = new Map<number, { btn: HTMLElement; at: number }>(); // pointerId -> pulsación viva
    const timers = new Map<HTMLElement, number>(); // botón -> timer de "levantar"
    const down = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.(".chin-btn, .keyboard button") as HTMLElement | null;
      if (!btn) return;
      if (btn.hasAttribute("data-pressing")) {
        e.stopPropagation(); // MISMO botón aún animando: corta el handler de React (ni acción ni sonido)
        return;
      }
      const t = timers.get(btn);
      if (t) {
        clearTimeout(t); // reusa un botón cuyo "levantar" estaba pendiente
        timers.delete(btn);
      }
      presses.set(e.pointerId, { btn, at: performance.now() });
      btn.setAttribute("data-pressing", "");
    };
    const up = (e: PointerEvent) => {
      const p = presses.get(e.pointerId);
      if (!p) return;
      presses.delete(e.pointerId);
      const min = p.btn.classList.contains("chin-kb") ? 200 : 130;
      const wait = Math.max(0, min - (performance.now() - p.at)); // deja que la animación baje+suba entera
      const timer = window.setTimeout(() => {
        p.btn.removeAttribute("data-pressing");
        timers.delete(p.btn);
      }, wait);
      timers.set(p.btn, timer);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Arranque del PC (una vez): mapa de curvatura del warp + precarga de samples de audio.
  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;

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
      const url = makeMap(0.4);
      setHref(feImageRef.current, url);
      if (url) setWarpReady(true);
    } catch {
      /* navegador sin soporte: se queda plano */
    }

    // Precarga los samples de tecleo, el zumbido y los SFX de click en buffers.
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

    rlog("info", "PC arrancado");
  }, []);

  // Teclado físico (PC): enruta al mismo dispatch que el teclado en pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "Enter" || k === "Backspace" || k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        dispatchRef.current(k);
      } else if (k.length === 1) {
        dispatchRef.current(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => stopHold, []);

  // Calienta los buffers en el primer gesto (iOS prepara cada buffer en su primera reproducción).
  useEffect(() => {
    if (!AUDIO_ENABLED) return;
    const warm = () => {
      const ac = acRef.current;
      if (!ac) return;
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

  // Zumbido de fondo del CRT (Web Audio; bypassa el silencio de iOS). Loop; arranca en la 1ª interacción.
  useEffect(() => {
    const start = () => {
      const ac = acRef.current;
      const buf = humBufferRef.current;
      if (!ac || !buf || humSrcRef.current) return;
      if (ac.state === "suspended") ac.resume();
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ac.createGain();
      g.gain.value = 0.075;
      src.connect(g);
      g.connect(ac.destination);
      src.start(0);
      humSrcRef.current = src;
      rlog("audio", "hum started", { state: ac.state });
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
          {view === "home" && (
            <div className="home-screen">
              <div className="home-title">EL libro PERDIDO</div>
              <div className="home-menu">
                {HOME_OPTS.map((label, i) => (
                  <div className="inputline" key={i}>
                    <span className="fcaret" aria-hidden="true">
                      {homeActive === i && (
                        <svg viewBox="9 7 6 10" fill="currentColor"><path d="M9 17h2v-2h2v-2h2v-2h-2V9h-2V7H9v10Z" /></svg>
                      )}
                    </span>
                    <span className="faction" onPointerDown={() => { setHomeActive(i); homeSelect(i); }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === "terminal" && (
            <Terminal
              playSfx={playSfx}
              shiftModeRef={shiftModeRef}
              consumeShift={consumeShift}
              keyHandlerRef={termKeyRef}
              runCmdRef={runCmdRef}
              loaderRef={loaderRef}
              pauseRef={termPauseRef}
            />
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
                if (loaderRef.current) return;
                playSfx("/audio/terminal-button.mp3");
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              onClick={() => { if (loaderRef.current) return; setShowKeyboard((v) => !v); }}
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
                if (loaderRef.current) return;
                playSfx("/audio/terminal-button.mp3");
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              onClick={() => { if (loaderRef.current) return; setPowerOn((v) => !v); }}
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
              {shiftMode !== "off" ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
        <div className="krow">
          {["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>
              {shiftMode !== "off" ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
        <div className="krow">
          <button type="button" className="kmod" aria-pressed={shiftMode === "caps"} aria-label="Mayúsculas" onPointerDown={() => dispatchKey("Shift")}>
            {shiftMode !== "off" ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3h2v2h2v2h2v2h2v4h-5v8H8v-8H3V9h2V7h2V5h2V3h2V1h2v2Z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 21h8v-2H8zm0-2h2v-8H8zm-5-6h5v-2H3zm0-2h2V9H3zm2-2h2V7H5zm2-2h2V5H7zm2-2h2V3H9zm2-2h2V1h-2zm2 2h2V3h-2zm2 2h2V5h-2zm2 2h2V7h-2zm2 4h2V9h-2zm-3 0h3v-2h-3zm-2 6h2v-8h-2z"/></svg>
            )}
          </button>
          {["z", "x", "c", "v", "b", "n", "m"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>
              {shiftMode !== "off" ? k.toUpperCase() : k}
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
          <button type="button" className="knum" onPointerDown={() => { keyTick(); setNumMode(true); }}>123</button>
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => dispatchKey("Enter")}>Enter</button>
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
          <button type="button" className="knum" onPointerDown={() => { keyTick(); setNumMode(false); }}>ABC</button>
          <button type="button" className="kspace" {...holdProps(" ")}>Espacio</button>
          <button type="button" className="kreturn" onPointerDown={() => dispatchKey("Enter")}>Enter</button>
        </div>
        </>
        )}
      </div>
      )}
    </>
  );
}
