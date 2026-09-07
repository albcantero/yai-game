import { useEffect, useRef, useState } from "react";

// Genera (una vez) el mapa de desplazamiento del warp: pinta un gradiente radial en un canvas, lo pasa a
// data URL y lo mete en el <feImage> del filtro SVG #barrel. Devuelve el ref del feImage (para el markup)
// y `warpReady` (true cuando el mapa está listo; el armazón aplica la clase .warp entonces).
export function useWarpFilter() {
  const feImageRef = useRef<SVGFEImageElement>(null);
  const [warpReady, setWarpReady] = useState(false);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

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
  }, []);

  return { feImageRef, warpReady };
}
