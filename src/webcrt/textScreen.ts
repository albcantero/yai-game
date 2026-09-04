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

    let topOffset = Math.round(this.cellH * 0.5); // margen superior

    // banner ASCII escalado para caber en el ancho (equivalente al fitBanner de main)
    if (model.banner && model.banner.length) {
      let bw = 1;
      for (const l of model.banner) if (l.length > bw) bw = l.length;
      const wScale = (this.canvas.width * 0.85) / (bw * this.cellW);
      const hScale = (this.canvas.height * 0.4) / (model.banner.length * this.cellH);
      const scale = Math.min(1, wScale, hScale);
      const lineH = this.cellH * scale;
      const charW = this.cellW * scale;
      ctx.font = `${this.fontPx * scale}px "IBM VGA","Courier New",monospace`;
      ctx.fillStyle = COLORS.b;
      for (let i = 0; i < model.banner.length; i++) {
        const line = model.banner[i];
        const x = Math.max(0, (this.canvas.width - line.length * charW) / 2);
        ctx.fillText(line, x, topOffset + i * lineH);
      }
      topOffset += model.banner.length * lineH + this.cellH * 0.5;
      ctx.font = `${this.fontPx}px "IBM VGA","Courier New",monospace`;
    }

    // columna de texto centrada (máx. maxCols)
    const effCols = Math.min(this.cols, this.maxCols);
    const xoff = Math.floor((this.cols - effCols) / 2) * this.cellW;

    const all = this.wrap(model);
    const availRows = Math.max(1, Math.floor((this.canvas.height - topOffset) / this.cellH));
    const visible = all.slice(Math.max(0, all.length - availRows));

    for (let i = 0; i < visible.length; i++) {
      const row = visible[i];
      const y = topOffset + i * this.cellH;
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
      const lastY = topOffset + (visible.length - 1) * this.cellH;
      const col = (2 + model.input.length) % effCols;
      const extraRows = Math.floor((2 + model.input.length) / effCols);
      ctx.fillStyle = COLORS[""];
      ctx.fillRect(xoff + col * this.cellW, lastY + extraRows * this.cellH, this.cellW, this.cellH - 1);
    }
  }
}
