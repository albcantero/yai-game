import { useEffect, useRef } from "react";
import { rlog } from "../lib/rlog";

// Motor de audio del armazón: UN único AudioContext persistente (bypassa el silencio de iOS). Precarga
// los samples en buffers, los calienta en el primer gesto (iOS prepara cada buffer en su 1ª reproducción),
// arranca el zumbido de fondo, y expone keyTick (tic de tecla) y playSfx (clicks). `suppressTickRef`
// silencia el tic cuando el sonido lo dispara otra cosa (lo usa el armazón alrededor del dispatch).
export function useTerminalAudio(enabled: boolean) {
  const acRef = useRef<AudioContext | null>(null);
  const keyBuffersRef = useRef<AudioBuffer[]>([]);
  const humBufferRef = useRef<AudioBuffer | null>(null);
  const humSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const sfxBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const suppressTickRef = useRef(false);
  const didInit = useRef(false);
  const warmedRef = useRef(false); // ya hubo 1er gesto y se calentaron los buffers cargados hasta ese momento
  const loggedLatencyRef = useRef(false); // ya logueamos la latencia real del AudioContext (una vez, al primer sonido)
  const warnedFallbackRef = useRef<Set<string>>(new Set()); // srcs de los que YA avisamos de fallback (evita spam en el log)
  const fallbackElsRef = useRef<Record<string, HTMLAudioElement>>({}); // <audio> reutilizado por src en el fallback (no crear uno por tick)

  // "Calienta" un buffer (iOS lo prepara en su 1ª reproducción): lo suena a volumen 0 un instante. Requiere el
  // AudioContext ya reanudado (tras un gesto). Libera los nodos al acabar.
  const warmOne = (b: AudioBuffer) => {
    const ac = acRef.current;
    if (!ac) return;
    try {
      if (ac.state === "suspended") ac.resume();
      const g = ac.createGain();
      g.gain.value = 0;
      g.connect(ac.destination);
      const s = ac.createBufferSource();
      s.buffer = b;
      s.connect(g);
      s.onended = () => { try { s.disconnect(); g.disconnect(); } catch { /* ya desconectado */ } };
      s.start(0);
      s.stop(ac.currentTime + 0.02);
    } catch {
      /* sin audio */
    }
  };

  const keyTick = () => {
    if (suppressTickRef.current) return;
    if (!enabled) return;
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
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* ya desconectado */ } }; // libera nodos (evita congestión → latencia)
      src.start(0);
    } catch {
      /* sin audio */
    }
  };

  // Devuelve la DURACIÓN del sonido en segundos (0 si no se pudo/está en fallback), para que el llamante pueda
  // bloquear hasta que acabe (p. ej. el candado de figuras: ningún botón hasta que termine el sonido de engranajes).
  const playSfx = (src: string, vol = 1): number => {
    if (!enabled) return 0;
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
        s.onended = () => { try { s.disconnect(); g.disconnect(); } catch { /* ya desconectado */ } }; // libera nodos (evita congestión → latencia)
        s.start(0);
        if (!loggedLatencyRef.current) { // latencia REAL de salida (una vez): en Android suele ser el techo del "retraso"
          loggedLatencyRef.current = true;
          const lat = ac as unknown as { baseLatency?: number; outputLatency?: number };
          rlog("audio", "latencia AudioContext", { state: ac.state, sampleRate: ac.sampleRate, baseLatency: lat.baseLatency, outputLatency: lat.outputLatency });
        }
        return buf.duration;
      } catch {
        /* cae al fallback */
      }
    }
    // FALLBACK: el buffer no está listo (aún sin decodificar, o decodeAudioData falló) o no hay AudioContext.
    // new Audio() es LENTO en móvil, así que: (1) avisamos UNA vez por src para poder detectarlo en el log remoto,
    // (2) reutilizamos un <audio> por src en vez de crear uno por llamada (evita el spam de elementos en el tick).
    if (!warnedFallbackRef.current.has(src)) {
      warnedFallbackRef.current.add(src);
      rlog("audio", "playSfx FALLBACK (buffer no listo → new Audio, lento en móvil)", { src, hasAC: !!ac, hasBuf: !!sfxBuffersRef.current[src] });
    }
    try {
      let a = fallbackElsRef.current[src];
      if (!a) { a = new Audio(src); fallbackElsRef.current[src] = a; }
      a.volume = vol;
      try { a.currentTime = 0; } catch { /* aún sin metadatos */ }
      a.play().catch(() => {});
    } catch {
      /* sin audio */
    }
    return 0;
  };

  // Precarga (una vez) los samples de tecleo, el zumbido y los SFX de click en buffers.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (enabled && AC) {
        // latencyHint:0 = pedir el búfer de salida MÍNIMO. CLAVE en Android: con "interactive" ese dispositivo daba
        // baseLatency 0.12s (120ms de retraso → el tic del dial se apelotonaba); con 0 baja a ~0.0027s (~3ms). iOS ya
        // iba bajo. Este es el AC ÚNICO de toda la app (teclas, zumbido, ticks, SFX), así que la latencia baja rige para todo.
        // Fallback en cascada a "interactive" (lo de antes, que funcionaba) y luego al default, por si algún navegador
        // rechaza el hint 0 al construir. (Ojo: el try/catch cubre errores de construcción, no micro-cortes por búfer.)
        if (!acRef.current) {
          try { acRef.current = new AC({ latencyHint: 0 }); }
          catch { try { acRef.current = new AC({ latencyHint: "interactive" }); } catch { acRef.current = new AC(); } }
        }
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
        // TODOS los sfx cortos en buffer (para que estén disponibles YA, sin caer al fallback new Audio, lento en iOS)
        ["/audio/mouse-click.mp3", "/audio/terminal-button.mp3", "/audio/terminal-simple-button.mp3", "/audio/terminal-power-button.mp3", "/audio/terminal-turning-on.mp3", "/audio/tick.mp3", "/audio/paper-slide.mp3", "/audio/gears.mp3", "/audio/lock-button-1.mp3", "/audio/lock-button-4.mp3", "/audio/lock-online-1.mp3", "/audio/lock-fail-1.mp3"].forEach(
          (src) => {
            fetch(src)
              .then((r) => r.arrayBuffer())
              .then((a) => ac.decodeAudioData(a))
              .then((b) => {
                sfxBuffersRef.current[src] = b;
                if (src === "/audio/tick.mp3") rlog("audio", "tick.mp3 decodificado (ruta buffer OK, sin new Audio)", { dur: b.duration }); // confirmación positiva: el tic del dial NO cae al fallback
                if (warmedRef.current) warmOne(b); // si ya hubo 1er gesto, calienta este buffer al cargar (iOS)
              })
              .catch((err) => { rlog("audio", "decodeAudioData FALLO (ese sonido caerá a new Audio)", { src, err: String(err) }); }); // antes se tragaba en silencio
          },
        );
      }
    } catch {
      /* sin audio */
    }
  }, []);

  // Calienta los buffers en el primer gesto (iOS prepara cada buffer en su primera reproducción).
  useEffect(() => {
    if (!enabled) return;
    const warm = () => {
      const ac = acRef.current;
      if (!ac) return;
      if (ac.state === "suspended") ac.resume();
      warmedRef.current = true; // a partir de aquí, los buffers que carguen luego se calientan al cargar (iOS)
      const all = [...keyBuffersRef.current, ...Object.values(sfxBuffersRef.current)];
      if (humBufferRef.current) all.push(humBufferRef.current);
      for (const b of all) warmOne(b);
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

  return { keyTick, playSfx, suppressTickRef };
}
