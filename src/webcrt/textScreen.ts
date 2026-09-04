// Renderiza el contenido de la terminal a un <canvas> 2D a resolución "nativa"
// (rejilla de caracteres). Ese canvas es la textura que luego pasa por el shader CRT.

export interface LineModel {
  text: string;
  cls: string; // "", "b", "muted", "d"
  mark: string; // "*", ">", ""
  center?: boolean; // línea sin wrap, centrada (para el banner ASCII)
}
export interface ScreenModel {
  lines: LineModel[];
  input: string;
  showInput: boolean;
  cursorOn: boolean;
  banner?: string[]; // arte ASCII del logo (se dibuja escalado al ancho, arriba)
}

const BG = "#050805";
const COLORS: Record<string, string> = {
  "": "#37f07d",
  b: "#b8ffd6",
  muted: "#1f9e5e",
  d: "#ff5f5f",
};
const PROMPT = "#1f9e5e";

export class TextScreen {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontPx: number;
  cellW = 8;
  cellH: number;
  cols = 48;
  rows = 30;
  maxCols = 64; // la columna de texto va centrada, con este ancho máximo (como el max-width de main)

  constructor(fontPx = 16, fontFamily = '"IBM VGA","Courier New",monospace') {
    this.fontPx = fontPx;
    this.cellH = fontPx; // la IBM VGA es 8x16 -> celda de 16 de alto
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.ctx.font = `${fontPx}px ${fontFamily}`;
    this.ctx.textBaseline = "top";
    // ancho de celda real de la fuente monoespaciada
    const w = this.ctx.measureText("MMMMMMMMMM").width / 10;
    this.cellW = w > 0 ? w : fontPx * 0.5;
  }

  /** Ajusta la rejilla al tamaño real de la pantalla (px de salida). Responsive. */
  layout(pxW: number, pxH: number): void {
    // Celda de salida ~22px de alto (texto grande, legible) manteniendo la proporción 8:16
    // de la fuente. La fuente se pinta a 8x16 (menor res) para que crt-geom marque scanlines
    // al reescalar. cols/rows se ajustan al tamaño real -> llena y reflowa al redimensionar.
    const targetCellH = 22;
    const targetCellW = targetCellH * (this.cellW / this.cellH);
    this.rows = Math.max(10, Math.round(pxH / targetCellH));
    this.cols = Math.max(20, Math.round(pxW / targetCellW));
    this.canvas.width = Math.round(this.cols * this.cellW);
    this.canvas.height = Math.round(this.rows * this.cellH);
    // el contexto se resetea al cambiar el tamaño del canvas
    this.ctx.font = `${this.fontPx}px "IBM VGA","Courier New",monospace`;
    this.ctx.textBaseline = "top";
  }

  private wrap(model: ScreenModel): { text: string; color: string; markLen: number; markColor: string; center?: boolean }[] {
    const out: { text: string; color: string; markLen: number; markColor: string; center?: boolean }[] = [];
    const push = (l: LineModel) => {
      const color = COLORS[l.cls] ?? COLORS[""];
      const markColor = l.cls === "d" ? COLORS.d : PROMPT;
      if (l.center) {
        out.push({ text: l.text, color, markLen: 0, markColor, center: true });
        return;
      }
      const prefix = l.mark ? l.mark + " " : "";
      const indent = prefix.length; // 0 o 2 (sangrado francés)
      const avail = Math.max(1, Math.min(this.cols, this.maxCols) - indent);
      const content = l.text ?? "";
      if (content.length === 0) {
        out.push({ text: prefix, color, markLen: prefix.length, markColor });
        return;
      }
      for (let i = 0, first = true; i < content.length; i += avail, first = false) {
        const chunk = content.slice(i, i + avail);
        if (first) out.push({ text: prefix + chunk, color, markLen: prefix.length, markColor });
        else out.push({ text: " ".repeat(indent) + chunk, color, markLen: 0, markColor });
      }
    };
    for (const l of model.lines) push(l);
    if (model.showInput) push({ text: model.input, cls: "", mark: ">" });
    return out;
  }

  render(model: ScreenModel): void {
    const ctx = this.ctx;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const topPad = Math.round(this.cellH * 0.5); // margen superior
    const banner = model.banner && model.banner.length ? model.banner : null;

    // medidas del banner escalado (equivalente al fitBanner de main)
    let bLineH = 0;
    let bCharW = 0;
    let bScalePx = this.fontPx;
    let bannerPxH = 0;
    if (banner) {
      let bw = 1;
      for (const l of banner) if (l.length > bw) bw = l.length;
      const wScale = (this.canvas.width * 0.85) / (bw * this.cellW);
      const hScale = (this.canvas.height * 0.4) / (banner.length * this.cellH);
      const scale = Math.min(1, wScale, hScale);
      bLineH = this.cellH * scale;
      bCharW = this.cellW * scale;
      bScalePx = this.fontPx * scale;
      bannerPxH = banner.length * bLineH;
    }
    const gap = banner ? Math.round(this.cellH * 0.5) : 0;

    const effCols = Math.min(this.cols, this.maxCols);
    const xoff = Math.floor((this.cols - effCols) / 2) * this.cellW;

    // scroll por píxeles: banner + texto en un solo flujo, anclado al fondo
    const all = this.wrap(model);
    const contentH = topPad + bannerPxH + gap + all.length * this.cellH;
    const scroll = Math.max(0, contentH - this.canvas.height);

    // banner (se desplaza con el scroll, no es sticky)
    if (banner) {
      ctx.font = `${bScalePx}px "IBM VGA","Courier New",monospace`;
      ctx.fillStyle = COLORS.b;
      for (let i = 0; i < banner.length; i++) {
        const y = topPad + i * bLineH - scroll;
        if (y + bLineH < 0 || y > this.canvas.height) continue;
        const line = banner[i];
        const x = Math.max(0, (this.canvas.width - line.length * bCharW) / 2);
        ctx.fillText(line, x, y);
      }
      ctx.font = `${this.fontPx}px "IBM VGA","Courier New",monospace`;
    }

    const textTop = topPad + bannerPxH + gap - scroll;
    for (let i = 0; i < all.length; i++) {
      const row = all[i];
      const y = textTop + i * this.cellH;
      if (y + this.cellH < 0 || y > this.canvas.height) continue;
      if (row.markLen > 0) {
        ctx.fillStyle = row.markColor;
        ctx.fillText(row.text.slice(0, row.markLen), xoff, y);
        ctx.fillStyle = row.color;
        ctx.fillText(row.text.slice(row.markLen), xoff + row.markLen * this.cellW, y);
      } else {
        ctx.fillStyle = row.color;
        ctx.fillText(row.text, xoff, y);
      }
    }

    // cursor de bloque al final de la línea de input
    if (model.showInput && model.cursorOn) {
      const lastY = textTop + (all.length - 1) * this.cellH;
      const col = (2 + model.input.length) % effCols;
      const extraRows = Math.floor((2 + model.input.length) / effCols);
      ctx.fillStyle = COLORS[""];
      ctx.fillRect(xoff + col * this.cellW, lastY + extraRows * this.cellH, this.cellW, this.cellH - 1);
    }
  }
}
