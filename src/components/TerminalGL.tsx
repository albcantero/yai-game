import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { commands } from "../terminal/commands";
import type { Command, Ctx } from "../terminal/types";
import { TextScreen } from "../webcrt/textScreen";
import type { LineModel } from "../webcrt/textScreen";
import { CRTGeomRenderer } from "../webcrt/glGeom";
import { CRTLottesRenderer } from "../webcrt/glLottes";
import { CRTRenderer } from "../webcrt/gl";
import BANNER from "../terminal/banner.txt?raw";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const BANNER_LINES = BANNER.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");

const SWITCH_SFX =
  "data:audio/mpeg;base64,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l66A+sBKsb3MK//SnKSoeEbwjlksu4Y6nUw8//swZPsA8awMWfghSAAAAA0gAAABCB0LYeAwQ4gAADSAAAAElUxBTUUzLjEwMFVVVVVVVVVVVVVVgRCAAnmjmEjpMKT//f6oUrbOjqnbawppb6P//2DCQVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//swZPuA8etCV/kBHWAAAA0gAAABBxBTXeA8YoAAADSAAAAEVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sgZPyA8agY1vgLEKAAAA0gAAABBxDdV+KkToAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7IGT0gPF8JNV4BxHQAAANIAAAAQUcZVOgCSfAAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk9wzxTDJTaCASMgAADSAAAAEDIJ9QQAh2gAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTtjfDOL1IYARUQAAANIAAAAQC4ATIAAAAAAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAf4AAAAgAAA0gAAABAAAB/gAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";

export default function TerminalGL() {
  const glRef = useRef<HTMLCanvasElement>(null);

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
  const acRef = useRef<AudioContext | null>(null);
  const keyBuffersRef = useRef<AudioBuffer[]>([]);
  const shiftRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const scrollUpRef = useRef(0);
  const dragYRef = useRef<number | null>(null);

  const screenRef = useRef<TextScreen | null>(null);
  const rendererRef = useRef<CRTGeomRenderer | CRTLottesRenderer | CRTRenderer | null>(null);
  const shaderRef = useRef(0); // 0=crt-geom, 1=crt-lottes, 2=propio
  const [shader, setShader] = useState(0);
  const [showKb, setShowKb] = useState(true);
  const [shift, setShift] = useState(false);
  const [numMode, setNumMode] = useState(false);

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

  // --- audio ---
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

  const typeLine = async (text: string, cls = "", step = 9, mark = "*") => {
    const idx = addLine({ text: "", cls, mark: text ? mark : "" });
    for (let i = 1; i <= text.length; i++) {
      await sleep(step);
      setText(idx, text.slice(0, i));
      if (text[i - 1] !== " ") printTick();
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
      if (k === "Enter" || k === " ") {
        keyTick();
        advance();
      }
      return;
    }
    if (!bootedRef.current) return;
    if (k === "Shift") {
      keyTick();
      const n = !shiftRef.current;
      shiftRef.current = n;
      setShift(n);
      return;
    }
    if (k === "Enter") {
      keyTick();
      scrollUpRef.current = 0; // al enviar, vuelve al fondo
      const v = inputRef.current;
      if (v.trim()) historyRef.current.push(v);
      hposRef.current = historyRef.current.length;
      setLine("");
      submit(v);
    } else if (k === "Backspace") {
      keyTick();
      setLine(inputRef.current.slice(0, -1));
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
      setLine(inputRef.current + (shiftRef.current ? k.toUpperCase() : k));
    }
  };
  handleKeyRef.current = handleKey;

  // mantener pulsada una tecla: repite en silencio hasta soltar
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
    if (k === "Backspace") setLine(inputRef.current.slice(0, -1));
    else if (k.length === 1) setLine(inputRef.current + (shiftRef.current ? k.toUpperCase() : k));
  };
  const startHold = (k: string) => {
    handleKey(k);
    stopHold();
    const repeatable = bootedRef.current && !dialogRef.current && (k === "Backspace" || k.length === 1);
    if (!repeatable) return;
    holdTimerRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => repeatKey(k), 60);
    }, 350);
  };
  const holdProps = (k: string) => ({
    onPointerDown: () => startHold(k),
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  const buildRenderer = () => {
    const glc = glRef.current;
    const scr = screenRef.current;
    if (!glc || !scr) return;
    try {
      const s = shaderRef.current;
      rendererRef.current =
        s === 0
          ? new CRTGeomRenderer(glc, scr.canvas)
          : s === 1
            ? new CRTLottesRenderer(glc, scr.canvas)
            : new CRTRenderer(glc, scr.canvas);
    } catch (e) {
      console.error(e);
      rendererRef.current = null;
    }
  };
  const toggleShader = () => {
    shaderRef.current = (shaderRef.current + 1) % 3;
    setShader(shaderRef.current);
    buildRenderer();
  };

  // scrollback: rueda y arrastre sobre la pantalla
  const onScreenWheel = (e: ReactWheelEvent) => {
    const scr = screenRef.current;
    if (!scr) return;
    scrollUpRef.current = Math.max(0, Math.min(scr.maxScroll, scrollUpRef.current - e.deltaY));
    dirtyRef.current = true;
  };
  const onScreenDown = (e: ReactPointerEvent) => {
    dragYRef.current = e.clientY;
    // captura: el arrastre sigue aunque el dedo/cursor se salga del canvas
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onScreenMove = (e: ReactPointerEvent) => {
    if (dragYRef.current == null) return;
    const scr = screenRef.current;
    if (!scr) return;
    const dy = e.clientY - dragYRef.current;
    dragYRef.current = e.clientY;
    scrollUpRef.current = Math.max(0, Math.min(scr.maxScroll, scrollUpRef.current + dy));
    dirtyRef.current = true;
  };
  const onScreenUp = () => {
    dragYRef.current = null;
  };

  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;
    const glCanvas = glRef.current;
    if (!glCanvas) return;

    let screen: TextScreen | null = null;
    let raf = 0;
    let lastBlink = 0;
    let lastW = 0;
    let lastH = 0;
    const start = performance.now();

    const model = () => ({
      lines: linesRef.current,
      input: inputRef.current,
      showInput: bootedRef.current && !dialogRef.current,
      cursorOn: cursorOnRef.current,
      banner: BANNER_LINES,
      scrollUp: scrollUpRef.current,
    });

    const relayout = () => {
      const scr = screenRef.current;
      if (!scr) return;
      scr.layout(glCanvas.clientWidth, Math.max(1, glCanvas.clientHeight));
      dirtyRef.current = true;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const renderer = rendererRef.current;
      if (!renderer || !screen) return;
      // auto-relayout si cambia el tamaño del canvas (p. ej. al mostrar/ocultar teclado)
      if (glCanvas.clientWidth !== lastW || glCanvas.clientHeight !== lastH) {
        lastW = glCanvas.clientWidth;
        lastH = glCanvas.clientHeight;
        relayout();
      }
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

    // precarga de samples de tecleo
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

    (async () => {
      try {
        if (document.fonts && document.fonts.load) await document.fonts.load('16px "IBM VGA"');
      } catch {
        /* la fuente caerá al fallback */
      }
      screen = new TextScreen(16);
      screenRef.current = screen;
      relayout();
      buildRenderer();
      if (!rendererRef.current) return;
      window.addEventListener("resize", relayout);
      raf = requestAnimationFrame(loop);

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

  return (
    <div className="gl-stage">
      <div className="monitor">
        <div className="gl-screen">
          <canvas
            ref={glRef}
            className="gl-canvas"
            onWheel={onScreenWheel}
            onPointerDown={onScreenDown}
            onPointerMove={onScreenMove}
            onPointerUp={onScreenUp}
            onPointerCancel={onScreenUp}
          />
        </div>
        <div className="monitor-chin">
          <span className="monitor-brand">SANTAS OCHOVA</span>
          <span className="kbd-switch">
            <label className="switch" title={showKb ? "Ocultar teclado" : "Mostrar teclado"}>
              <input
                className="switch__input"
                type="checkbox"
                role="switch"
                aria-label="Mostrar u ocultar el teclado en pantalla"
                checked={showKb}
                onChange={() => {
                  setShowKb((v) => !v);
                  try {
                    new Audio(SWITCH_SFX).play().catch(() => {});
                  } catch {
                    /* sin audio */
                  }
                  if (navigator.vibrate) navigator.vibrate(50);
                  window.dispatchEvent(new Event("resize"));
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
          <button type="button" className="gl-shaderbtn" onClick={toggleShader}>
            {["crt-geom", "crt-lottes", "propio"][shader]}
          </button>
          <span className="monitor-led" aria-hidden="true"></span>
        </div>
      </div>

      {showKb && (
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
                  <svg viewBox="0 0 500 500" aria-hidden="true"><path d="M433.704,237.465c4.456,6.086,7.092,13.539,7.092,21.622c0,20.079-16.266,36.341-36.344,36.341h-36.341c-9.991,0-18.173,8.18-18.173,18.172v109.025c0,20.079-16.262,36.341-36.341,36.341H186.4c-20.079,0-36.34-16.262-36.34-36.341V313.6c0-9.992-8.181-18.172-18.172-18.172H95.547c-20.079,0-36.342-16.262-36.342-36.341c0-8.083,2.635-15.536,7.08-21.622L217.747,54.388c17.807-17.808,46.695-17.808,64.505,0L433.704,237.465z"/></svg>
                </button>
                {["z", "x", "c", "v", "b", "n", "m"].map((k) => (
                  <button type="button" key={k} {...holdProps(k)}>
                    {shift ? k.toUpperCase() : k}
                  </button>
                ))}
                <button type="button" className="kmod" aria-label="Borrar" {...holdProps("Backspace")} onContextMenu={(e) => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5,5h-10C8.234,5,6.666,5.807,5.93,6.837L3.32,10.49c-0.642,0.898-1.182,1.654-1.199,1.679C2,12.344,1.999,12.661,2.124,12.833c0.023,0.033,0.555,0.777,1.188,1.664l2.619,3.667C6.666,19.193,8.233,20,9.5,20h10c1.379,0,2.5-1.122,2.5-2.5v-10C22,6.122,20.879,5,19.5,5z M17.207,14.793c0.391,0.391,0.391,1.023,0,1.414C17.012,16.402,16.756,16.5,16.5,16.5s-0.512-0.098-0.707-0.293L13.5,13.914l-2.293,2.293C11.012,16.402,10.756,16.5,10.5,16.5s-0.512-0.098-0.707-0.293c-0.391-0.391-0.391-1.023,0-1.414l2.293-2.293l-2.293-2.293c-0.391-0.391-0.391-1.023,0-1.414s1.023-0.391,1.414,0l2.293,2.293l2.293-2.293c0.391-0.391,1.023-0.391,1.414,0s0.391,1.023,0,1.414L14.914,12.5L17.207,14.793z"/></svg>
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
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5,5h-10C8.234,5,6.666,5.807,5.93,6.837L3.32,10.49c-0.642,0.898-1.182,1.654-1.199,1.679C2,12.344,1.999,12.661,2.124,12.833c0.023,0.033,0.555,0.777,1.188,1.664l2.619,3.667C6.666,19.193,8.233,20,9.5,20h10c1.379,0,2.5-1.122,2.5-2.5v-10C22,6.122,20.879,5,19.5,5z M17.207,14.793c0.391,0.391,0.391,1.023,0,1.414C17.012,16.402,16.756,16.5,16.5,16.5s-0.512-0.098-0.707-0.293L13.5,13.914l-2.293,2.293C11.012,16.402,10.756,16.5,10.5,16.5s-0.512-0.098-0.707-0.293c-0.391-0.391-0.391-1.023,0-1.414l2.293-2.293l-2.293-2.293c-0.391-0.391-0.391-1.023,0-1.414s1.023-0.391,1.414,0l2.293,2.293l2.293-2.293c0.391-0.391,1.023-0.391,1.414,0s0.391,1.023,0,1.414L14.914,12.5L17.207,14.793z"/></svg>
                </button>
                <button type="button" className="kreturn" onPointerDown={() => handleKey("Enter")}>Enter</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
