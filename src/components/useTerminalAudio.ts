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

  const playSfx = (src: string, vol = 1) => {
    if (!enabled) return;
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

  // Precarga (una vez) los samples de tecleo, el zumbido y los SFX de click en buffers.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (enabled && AC) {
        if (!acRef.current) acRef.current = new AC({ latencyHint: "interactive" }); // mínima latencia (importante en iOS)
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
        ["/audio/mouse-click.mp3", "/audio/terminal-button.mp3", "/audio/terminal-simple-button.mp3", "/audio/terminal-power-button.mp3", "/audio/terminal-turning-on.mp3", "/audio/tick.mp3", "/audio/paper-slide.mp3"].forEach(
          (src) => {
            fetch(src)
              .then((r) => r.arrayBuffer())
              .then((a) => ac.decodeAudioData(a))
              .then((b) => {
                sfxBuffersRef.current[src] = b;
                if (warmedRef.current) warmOne(b); // si ya hubo 1er gesto, calienta este buffer al cargar (iOS)
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
