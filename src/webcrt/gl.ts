// Post-procesador CRT en WebGL (inspirado en crt-geom / lottes).
// Toma un <canvas> 2D (la "imagen de fósforo" ya pintada con el texto) y lo dibuja
// en un <canvas> WebGL aplicando, en UNA pasada de GPU:
//   curvatura de tubo, scanlines con perfil de haz, máscara de subpíxel (aperture grille),
//   viñeta, aberración cromática y flicker.
// El texto se pinta nítido en el canvas fuente a resolución "nativa" y el shader lo
// reescala añadiendo los efectos: así el texto no se emborrona como con feDisplacementMap.

const VERT = `
attribute vec2 aPos;
varying vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform vec2  uTexRes;   // resolución del canvas fuente (px)
uniform float uTime;     // segundos
uniform vec2  uCurve;    // curvatura (x = por eje Y, y = por eje X)
uniform float uScan;     // profundidad de scanline 0..1
uniform float uMask;     // fuerza de máscara de subpíxel 0..1
uniform float uAber;     // aberración cromática (uv)
uniform float uVign;     // viñeta 0..1
uniform float uFlicker;  // amplitud de flicker 0..1
uniform float uScanCount;   // nº de scanlines
uniform float uBloom;       // intensidad de bloom/halación
uniform float uBloomThresh; // umbral de brillo para el bloom
uniform float uBloomSize;   // radio del bloom (en texels)

vec2 warp(vec2 uv){
  uv = uv * 2.0 - 1.0;
  uv *= vec2(1.0 + (uv.y*uv.y) * uCurve.x, 1.0 + (uv.x*uv.x) * uCurve.y);
  return uv * 0.5 + 0.5;
}

void main(){
  vec2 uv = warp(vUV);

  // fuera del tubo -> negro (borde del cristal)
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // aberración cromática: R y B desplazados
  float r = texture2D(uTex, uv + vec2(uAber, 0.0)).r;
  float g = texture2D(uTex, uv).g;
  float b = texture2D(uTex, uv - vec2(uAber, 0.0)).b;
  vec3 col = vec3(r, g, b);

  // bloom / halación de fósforo: desenfoque de las zonas brillantes alrededor
  vec2 px = uBloomSize / uTexRes;
  vec3 glow = vec3(0.0);
  float tot = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec3 s = texture2D(uTex, uv + vec2(float(i), float(j)) * px).rgb;
      s = max(s - uBloomThresh, 0.0);
      float w = 1.0 / (1.0 + float(i * i + j * j));
      glow += s * w;
      tot += w;
    }
  }
  col += (glow / tot) * uBloom;

  // scanlines (nº de líneas ajustable)
  float beam = sin(uv.y * uScanCount * 3.14159265);
  beam = beam * 0.5 + 0.5;
  col *= mix(1.0, beam, uScan);

  // máscara de subpíxel (aperture grille) por columna de salida
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 grille = vec3(1.0 - uMask);
  if (m < 1.0) grille.r = 1.0;
  else if (m < 2.0) grille.g = 1.0;
  else grille.b = 1.0;
  col *= grille;

  // viñeta
  vec2 vv = uv * 2.0 - 1.0;
  col *= clamp(1.0 - uVign * dot(vv, vv), 0.0, 1.0);

  // flicker sutil (parpadeo de red)
  col *= 1.0 - uFlicker + uFlicker * (0.5 + 0.5 * sin(uTime * 6.2831 * 1.3 + uv.y * 6.0));

  // pequeño realce de fósforo
  col = pow(max(col, 0.0), vec3(0.92));

  gl_FragColor = vec4(col, 1.0);
}`;

export interface CRTParams {
  curve: [number, number];
  scan: number;
  scanCount: number;
  mask: number;
  aber: number;
  vign: number;
  flicker: number;
  bloom: number;
  bloomThresh: number;
  bloomSize: number;
}

export const DEFAULT_PARAMS: CRTParams = {
  curve: [0.06, 0.1],
  scan: 0.22,
  scanCount: 300,
  mask: 0.18,
  aber: 0.0016,
  vign: 0.26,
  flicker: 0.05,
  bloom: 0.9,
  bloomThresh: 0.25,
  bloomSize: 1.6,
};

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

export class CRTRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private source: HTMLCanvasElement;
  params: CRTParams;
  ok = false;

  constructor(glCanvas: HTMLCanvasElement, source: HTMLCanvasElement, params: CRTParams = DEFAULT_PARAMS) {
    this.source = source;
    this.params = params;
    const gl = (glCanvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, alpha: false }) ||
      glCanvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL no disponible");
    this.gl = gl;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);

    // quad de pantalla completa (dos triángulos en clip space)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["uTex", "uTexRes", "uTime", "uCurve", "uScan", "uScanCount", "uMask", "uAber", "uVign", "uFlicker", "uBloom", "uBloomThresh", "uBloomSize"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    // textura desde el canvas fuente
    const tex = gl.createTexture()!;
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.clearColor(0, 0, 0, 1);
    this.ok = true;
  }

  /** Ajusta el tamaño del canvas WebGL al de su caja en pantalla (con DPR). */
  resize(): void {
    const gl = this.gl;
    const c = gl.canvas as HTMLCanvasElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, c.width, c.height);
  }

  render(timeSec: number): void {
    const gl = this.gl;
    const p = this.params;
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // sube el canvas fuente como textura (es pequeño; barato por frame)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);

    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uTexRes, this.source.width, this.source.height);
    gl.uniform1f(this.u.uTime, timeSec);
    gl.uniform2f(this.u.uCurve, p.curve[0], p.curve[1]);
    gl.uniform1f(this.u.uScan, p.scan);
    gl.uniform1f(this.u.uMask, p.mask);
    gl.uniform1f(this.u.uAber, p.aber);
    gl.uniform1f(this.u.uVign, p.vign);
    gl.uniform1f(this.u.uFlicker, p.flicker);
    gl.uniform1f(this.u.uScanCount, p.scanCount);
    gl.uniform1f(this.u.uBloom, p.bloom);
    gl.uniform1f(this.u.uBloomThresh, p.bloomThresh);
    gl.uniform1f(this.u.uBloomSize, p.bloomSize);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
