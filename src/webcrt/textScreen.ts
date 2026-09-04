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
  scrollUp?: number; // px que el usuario ha subido desde el fondo (scrollback)
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
  maxScroll = 0; // píxeles scrollables (lo actualiza render; el host lo usa para acotar el scrollback)
  private iconImg: HTMLImageElement | null = null;

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
    // icono de terminal para la barra de título
    if (typeof Image !== "undefined") {
      this.iconImg = new Image();
      this.iconImg.src = "/icons/term.png";
    }
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

  /** bisel de 1px estilo Win98 (luz arriba-izq / sombra abajo-der; invertido si sunken). */
  private bevel(x: number, y: number, w: number, h: number, sunken: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = sunken ? "#808080" : "#ffffff";
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = sunken ? "#ffffff" : "#0a0a0a";
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  render(model: ScreenModel): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.textBaseline = "top";

    // ---- borde del tubo (margen de respeto monitor -> ventana) ----
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    const tube = Math.round(this.cellH * 0.6);
    const wx = tube;
    const wy = tube;
    const ww = W - tube * 2;
    const wh = H - tube * 2;

    // ---- ventana Windows 98 ----
    ctx.fillStyle = "#c0c0c0";
    ctx.fillRect(wx, wy, ww, wh);
    this.bevel(wx, wy, ww, wh, false);

    const pad = 4;
    const titleH = Math.round(this.cellH * 1.3);
    const tbx = wx + pad;
    const tby = wy + pad;
    const tbw = ww - pad * 2;
    // barra de título (degradado azul)
    const grad = ctx.createLinearGradient(tbx, 0, tbx + tbw, 0);
    grad.addColorStop(0, "#000080");
    grad.addColorStop(1, "#1084d0");
    ctx.fillStyle = grad;
    ctx.fillRect(tbx, tby, tbw, titleH);
    // icono de terminal + título
    const tfont = Math.max(8, Math.round(titleH * 0.6));
    let textX = tbx + 6;
    if (this.iconImg && this.iconImg.complete && this.iconImg.naturalWidth > 0) {
      const isz = titleH - 6;
      ctx.drawImage(this.iconImg, tbx + 4, tby + 3, isz, isz);
      textX = tbx + 4 + isz + 5;
    }
    ctx.font = `${tfont}px "IBM VGA","Courier New",monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("santasochova-term.exe", textX, tby + Math.round((titleH - tfont) / 2));
    // botones de control (menú ≡ y X) a la derecha
    const bs = titleH - 6;
    const xb = { x: tbx + tbw - bs - 2, y: tby + 3 };
    const mb = { x: xb.x - bs - 2, y: xb.y };
    for (const b of [mb, xb]) {
      ctx.fillStyle = "#c0c0c0";
      ctx.fillRect(b.x, b.y, bs, bs);
      this.bevel(b.x, b.y, bs, bs, false);
    }
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(1, Math.round(bs * 0.09));
    const m = bs * 0.3;
    ctx.beginPath();
    ctx.moveTo(xb.x + m, xb.y + m);
    ctx.lineTo(xb.x + bs - m, xb.y + bs - m);
    ctx.moveTo(xb.x + bs - m, xb.y + m);
    ctx.lineTo(xb.x + m, xb.y + bs - m);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = Math.round(mb.y + bs * 0.32 + i * bs * 0.2) + 0.5;
      ctx.moveTo(mb.x + bs * 0.28, yy);
      ctx.lineTo(mb.x + bs * 0.72, yy);
    }
    ctx.stroke();

    // ---- área cliente (pantalla verde) ----
    const cx = wx + pad;
    const cy = wy + pad + titleH + 2;
    const cw = ww - pad * 2;
    const chh = wh - (pad + titleH + 2) - pad;
    ctx.fillStyle = BG;
    ctx.fillRect(cx, cy, cw, chh);
    this.bevel(cx, cy, cw, chh, true);

    // ---- región de contenido con padding interno (aire dentro del terminal) ----
    const ipx = Math.round(this.cellW * 2);
    const ipy = Math.round(this.cellH * 0.7);
    const rx = cx + ipx;
    const ry = cy + ipy;
    const rw = Math.max(this.cellW * 8, cw - ipx * 2);
    const rh = Math.max(this.cellH * 2, chh - ipy * 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();

    const banner = model.banner && model.banner.length ? model.banner : null;
    let bLineH = 0;
    let bCharW = 0;
    let bScalePx = this.fontPx;
    let bannerPxH = 0;
    if (banner) {
      let bw = 1;
      for (const l of banner) if (l.length > bw) bw = l.length;
      const wScale = (rw * 0.9) / (bw * this.cellW);
      const hScale = (rh * 0.4) / (banner.length * this.cellH);
      const scale = Math.min(1, wScale, hScale);
      bLineH = this.cellH * scale;
      bCharW = this.cellW * scale;
      bScalePx = this.fontPx * scale;
      bannerPxH = banner.length * bLineH;
    }
    const gap = banner ? Math.round(this.cellH * 0.5) : 0;

    const effCols = Math.min(this.cols, this.maxCols);
    const colX = rx + Math.max(0, (rw - effCols * this.cellW) / 2);

    const all = this.wrap(model);
    const contentH = bannerPxH + gap + all.length * this.cellH;
    const total = Math.max(0, contentH - rh);
    this.maxScroll = total;
    const up = Math.max(0, Math.min(total, model.scrollUp ?? 0));
    const scroll = total - up;

    if (banner) {
      ctx.font = `${bScalePx}px "IBM VGA","Courier New",monospace`;
      ctx.fillStyle = COLORS.b;
      for (let i = 0; i < banner.length; i++) {
        const y = ry + i * bLineH - scroll;
        if (y + bLineH < ry || y > ry + rh) continue;
        const line = banner[i];
        const x = rx + Math.max(0, (rw - line.length * bCharW) / 2);
        ctx.fillText(line, x, y);
      }
      ctx.font = `${this.fontPx}px "IBM VGA","Courier New",monospace`;
    }

    const textTop = ry + bannerPxH + gap - scroll;
    for (let i = 0; i < all.length; i++) {
      const row = all[i];
      const y = textTop + i * this.cellH;
      if (y + this.cellH < ry || y > ry + rh) continue;
      if (row.markLen > 0) {
        ctx.fillStyle = row.markColor;
        ctx.fillText(row.text.slice(0, row.markLen), colX, y);
        ctx.fillStyle = row.color;
        ctx.fillText(row.text.slice(row.markLen), colX + row.markLen * this.cellW, y);
      } else {
        ctx.fillStyle = row.color;
        ctx.fillText(row.text, colX, y);
      }
    }

    if (model.showInput && model.cursorOn) {
      const lastY = textTop + (all.length - 1) * this.cellH;
      const col = (2 + model.input.length) % effCols;
      const extraRows = Math.floor((2 + model.input.length) / effCols);
      ctx.fillStyle = COLORS[""];
      ctx.fillRect(colX + col * this.cellW, lastY + extraRows * this.cellH, this.cellW, this.cellH - 1);
    }

    ctx.restore();
  }
}
