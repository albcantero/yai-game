import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { initRemoteLog, BUILD } from "../lib/rlog";
import { usePressAnimation } from "./usePressAnimation";
import { useWarpFilter } from "./useWarpFilter";
import { useTerminalAudio } from "./useTerminalAudio";
import { SCREENS, type ScreenId } from "./screens";
import type { ScreenHandle } from "./screens/types";

// Warp CRT (abombado 3D via filtro SVG).
const WARP_ENABLED = true;
// Audio del terminal por Web Audio (bypassa el interruptor de silencio de iOS). ON.
const AUDIO_ENABLED = true;
// Sello de build (SHA) visible en una esquina (dev). Poner en false para la versión final.
const SHOW_BUILD = true;
// Vibración háptica (Vibration API) en CADA pulsación real: teclas + botones del monitor (flechas/OK/
// teclado/power). NO en la ⚙ ni la X (controles "internos" del programa abierto). iOS/Safari NO implementa
// la API, así que en iPhone es un no-op (cero vibración, cero calor); en Android son pulsos de pocos ms,
// sin consumo apreciable. Sube el valor para un golpe más firme.
const BUZZ_MS = 10;

// EL ARMAZÓN ("el PC"): monitor, teclado, AUDIO, warp y la vista de inicio. Persiste siempre; cada
// pantalla (screens/Terminal, y en el futuro Shop, Lobby...) se monta encima como un componente.
// Reiniciar una pantalla = salir de su vista → el hijo se desmonta y React lo limpia todo.
export default function Computer() {
  const [confirmClose, setConfirmClose] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false); // popup de "Información" (botón "?" de la barra de título)
  const [showKeyboard, setShowKeyboard] = useState(false); // arranca OCULTO en cada carga (se muestra con el botón del mentón)
  const [powerOn, setPowerOn] = useState(true);
  const [shiftMode, setShiftMode] = useState<"off" | "shift" | "caps">("off"); // off=minús, shift=1 letra, caps=bloqueo
  const [numMode, setNumMode] = useState(false);
  const [view, setView] = useState<ScreenId>("home"); // pantalla activa; arranca en "home" (todas son screens del registro)

  const shiftModeRef = useRef<"off" | "shift" | "caps">("off");
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const screenRef = useRef<ScreenHandle | null>(null); // handle de la pantalla activa (React lo pone null al desmontar)
  const dispatchRef = useRef<(k: string) => void>(() => {}); // dispatchKey estable para el teclado físico
  const suppressBuzzRef = useRef(false); // silencia SOLO la vibración en las repeticiones de tecla mantenida (el primer toque sí vibra)

  // Motores del armazón extraídos a hooks: el warp (mapa del filtro SVG) y el audio (un AudioContext
  // persistente + buffers + hum). suppressTickRef silencia el tic de tecla cuando el sonido lo dispara otra cosa.
  const { feImageRef, warpReady } = useWarpFilter();
  const { keyTick, playSfx, suppressTickRef } = useTerminalAudio(AUDIO_ENABLED);
  const buzz = () => { if (navigator.vibrate) navigator.vibrate(BUZZ_MS); }; // háptica única de TODO botón real (teclado + monitor)

  const setShiftState = (m: "off" | "shift" | "caps") => {
    shiftModeRef.current = m;
    setShiftMode(m);
  };
  const consumeShift = () => {
    if (shiftModeRef.current === "shift") setShiftState("off");
  };

  // ---------- Enrutado de teclas (teclado en pantalla + físico + botones del monitor) ----------
  // Navegación entre pantallas: cada screen (Home, y en el futuro Shop...) pide saltar a otra por su id.
  const navigate = (id: string) => {
    if (id in SCREENS) setView(id as ScreenId);
  };
  // El armazón pone el CLIC de tecla (keyTick) una vez por pulsación y luego delega en la pantalla activa.
  const dispatchKey = (k: string) => {
    keyTick(); // el TECLADO es INDEPENDIENTE: SIEMPRE suena, aunque haya menú/diálogo abierto o un loader
    if (!suppressBuzzRef.current) buzz(); // y SIEMPRE vibra (salvo repeticiones de tecla mantenida)
    if (k === "Shift") {   // Mayús INDEPENDIENTE: SIEMPRE togglea (estado local del teclado), en cualquier vista y con menú/diálogo abiertos
      const cur = shiftModeRef.current;
      setShiftState(cur === "off" ? "shift" : cur === "shift" ? "caps" : "off");
      return;
    }
    if (confirmClose || infoOpen) return; // diálogo/info abiertos = pantalla en PAUSA: las teclas suenan y el Mayús va, pero NO llegan al contenido ni navegan
    screenRef.current?.handleKey(k); // delega en la pantalla activa (home incluido: su menú navega con flechas + OK)
  };
  dispatchRef.current = dispatchKey;

  // Diálogo de cierre abierto => PAUSA la pantalla activa (congela boot/typeLine/spinners, esté como
  // esté). Al cerrarlo, reanuda donde iba. Vía screenRef.setPaused.
  useEffect(() => {
    screenRef.current?.setPaused(confirmClose || infoOpen);
  }, [confirmClose, infoOpen]);

  // Botones del monitor (flechas/OK): suenan a botón, no a tecla. SIEMPRE funcionan (inputs independientes,
  // como el teclado): si hay un loader, la pantalla activa ignora las teclas, pero el botón suena igual.
  const chinKey = (k: string) => {
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
        suppressBuzzRef.current = true;
        dispatchKey(k); // repeticiones SIN sonido ni vibración
        suppressTickRef.current = false;
        suppressBuzzRef.current = false;
      }, 60);
    }, 350);
  };
  const holdProps = (k: string) => ({
    onPointerDown: () => startHold(k),
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  const chromeClick = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) playSfx("/audio/mouse-click.mp3");
  };
  const closeAttempt = () => {
    setConfirmClose(false);
    setView("home"); // cierra el programa: el screen activo se desmonta → vuelve a la home (reinicio limpio)
  };

  // ---------- Efectos del armazón ----------
  useEffect(() => {
    initRemoteLog();
  }, []);

  usePressAnimation(); // animación de pulsado por-botón + red de seguridad (ver hook)

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

  const Active = SCREENS[view].Component; // componente de la pantalla activa (registro; "home" incluido)

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
        <div className={"crt curved" + (warpReady && WARP_ENABLED ? " warp" : "") + (view === "home" ? " crt--home" : "")}>
          {view !== "home" && (
            <div className="win98 win-header" onPointerDownCapture={chromeClick}>
              <div className="title-bar">
                <img className="title-icon" src={SCREENS[view].icon} alt="" />
                <div className="title-bar-text">{SCREENS[view].title}</div>
                <div className="title-bar-controls">
                  <button type="button" aria-label="Help" onClick={() => setInfoOpen(true)}></button>
                  <button type="button" aria-label="Close" onClick={() => setConfirmClose(true)}></button>
                </div>
              </div>
            </div>
          )}
          <div className="crt-body">
          <Active
            key={view}
            ref={screenRef}
            playSfx={playSfx}
            shiftModeRef={shiftModeRef}
            consumeShift={consumeShift}
            navigate={navigate}
          />
          {confirmClose && (
            <div className="win98 confirm-overlay" onPointerDownCapture={chromeClick}>
              <div className="window confirm-dialog">
                <div className="title-bar">
                  <div className="title-bar-text">Cerrar</div>
                  <div className="title-bar-controls">
                    <button type="button" aria-label="Close" onClick={() => setConfirmClose(false)}></button>
                  </div>
                </div>
                <div className="window-body">
                  <div className="confirm-row">
                    <img className="confirm-icon" src="/icons/msg_error.png" alt="" />
                    <p>¿Seguro que quieres salir del programa? Se perderán todos los cambios que no se hayan guardado.</p>
                  </div>
                  <div className="confirm-buttons">
                    <button type="button" onClick={closeAttempt}>Sí</button>
                    <button type="button" onClick={() => setConfirmClose(false)}>No</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {infoOpen && (
            <div className="win98 confirm-overlay" onPointerDownCapture={chromeClick}>
              <div className="window confirm-dialog">
                <div className="title-bar">
                  <img className="title-icon" src="/icons/msg_question-1.png" alt="" />
                  <div className="title-bar-text">Información</div>
                  <div className="title-bar-controls">
                    <button type="button" aria-label="Close" onClick={() => setInfoOpen(false)}></button>
                  </div>
                </div>
                <div className="window-body">
                  <div className="confirm-row">
                    <img className="confirm-icon" src="/icons/msg_question.png" alt="" />
                    <p>Santas Ochova · La Mejor Librería</p>
                  </div>
                  <div className="confirm-buttons">
                    <button type="button" onClick={() => setInfoOpen(false)}>Cerrar</button>
                  </div>
                </div>
              </div>
            </div>
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
                buzz();
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
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7h2v16H9zm2 0h2v15h-2zm2 2h2v12h-2zm2 2h2v8h-2zm2 2h2v6h-2zm2 2h2v2h-2z"/><path d="M11 21h2v2h-2zm2-2h2v2h-2zm2-2h6v2h-6zm0-12h2v2h-2zM5 10h2v2H5zm0-5h2v2H5zm4-4h2v4H9zM3 3h2v2H3zm0 9h2v2H3zm14-9h2v2h-2z"/></svg>
            </button>
            <button
              type="button"
              className={"chin-btn chin-kb chin-power" + (powerOn ? " is-on" : "")}
              aria-pressed={powerOn}
              aria-label={powerOn ? "Apagar" : "Encender"}
              onPointerDown={() => {
                playSfx("/audio/terminal-button.mp3");
                buzz();
              }}
              onClick={() => setPowerOn((v) => !v)}
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
            {shiftMode === "caps" ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 21H8v-2h8v2ZM13 3h2v2h2v2h2v2h2v4h-5v4H8v-4H3V9h2V7h2V5h2V3h2V1h2v2Z"/></svg>
            ) : shiftMode === "shift" ? (
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
          <button type="button" className="knum" onPointerDown={() => { keyTick(); buzz(); setNumMode(true); }}>123</button>
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
          {["¿", "?", "¡", "!", ".", ",", "-", "_", "€", "\""].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
        </div>
        <div className="krow">
          {["+", ":", ";", "*", "#", "@", "(", ")", "/"].map((k) => (
            <button type="button" key={k} {...holdProps(k)}>{k}</button>
          ))}
          <button type="button" className="kmod" aria-label="Borrar" {...holdProps("Backspace")} onContextMenu={(e) => e.preventDefault()}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 19H8v-2H6v-2H4v-2H2v-2h2V9h2V7h2V5h12v2h2v10h-2v2Zm-8-8h2v2h-2v2h2v-2h2v2h2v-2h-2v-2h2V9h-2v2h-2V9h-2v2Z"/></svg>
          </button>
        </div>
        <div className="krow">
          <button type="button" className="knum" onPointerDown={() => { keyTick(); buzz(); setNumMode(false); }}>ABC</button>
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
