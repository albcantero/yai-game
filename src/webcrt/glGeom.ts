// Port a WebGL1 del shader CRT-GEOM de RetroArch (cgwg / Themaister / DOLLS, GPL).
// Curvatura esférica real + beam gaussiano con oversample + filtro Lanczos horizontal
// + dot-mask + corrección de gamma + esquinas redondeadas. Es el CRT "clásico" y más probado.
// Adaptación: la textura fuente es exactamente el contenido (TextureSize == InputSize).

const VERT = `
attribute vec2 aPos;
varying vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUV;
uniform sampler2D uTex;
uniform vec2  uTexRes;   // TextureSize == InputSize (px del canvas fuente)
uniform vec2  uOutRes;   // OutputSize (px del canvas WebGL)
uniform float uCurv;     // curvatura on/off (>0.5)
uniform float uR;        // radio de curvatura
uniform float uD;        // distancia del observador
uniform float uScanW;    // grosor de scanline
uniform float uDotMask;  // fuerza del dot-mask
uniform float uCorner;   // tamaño de esquina redondeada

#define TextureSize uTexRes
#define InputSize   uTexRes
#define OutputSize  uOutRes
#define CRTgamma 2.4
#define monitorgamma 2.2
#define cornersmooth 1000.0
#define LUM 0.0
#define SATURATION 1.0
#define PI 3.141592653589
#define FIX(c) max(abs(c), 1e-5)

const vec2 aspect   = vec2(1.0, 0.75);
const vec2 overscan = vec2(1.0, 1.0);
const vec2 sinangle = vec2(0.001);
const vec2 cosangle = vec2(1.001);

float intersect(vec2 xy){
  float A = dot(xy,xy)+uD*uD;
  float B = 2.0*(uR*(dot(xy,sinangle)-uD*cosangle.x*cosangle.y)-uD*uD);
  float C = uD*uD + 2.0*uR*uD*cosangle.x*cosangle.y;
  return (-B-sqrt(B*B-4.0*A*C))/(2.0*A);
}
vec2 bkwtrans(vec2 xy){
  float c = intersect(xy);
  vec2 point = vec2(c)*xy;
  point -= vec2(-uR)*sinangle;
  point /= vec2(uR);
  vec2 tang = sinangle/cosangle;
  vec2 poc = point/cosangle;
  float A = dot(tang,tang)+1.0;
  float B = -2.0*dot(poc,tang);
  float C = dot(poc,poc)-1.0;
  float a = (-B+sqrt(B*B-4.0*A*C))/(2.0*A);
  vec2 uv = (point-a*sinangle)/cosangle;
  float r = FIX(uR*acos(a));
  return uv*r/sin(r/uR);
}
vec2 fwtrans(vec2 uv){
  float r = FIX(sqrt(dot(uv,uv)));
  uv *= sin(r/uR)/r;
  float x = 1.0-cos(r/uR);
  float D = uD/uR + x*cosangle.x*cosangle.y+dot(uv,sinangle);
  return uD*(uv*cosangle-x*sinangle)/D;
}
vec3 maxscale(){
  vec2 c = bkwtrans(-uR * sinangle / (1.0 + uR/uD*cosangle.x*cosangle.y));
  vec2 a = vec2(0.5,0.5)*aspect;
  vec2 lo = vec2(fwtrans(vec2(-a.x,c.y)).x, fwtrans(vec2(c.x,-a.y)).y)/aspect;
  vec2 hi = vec2(fwtrans(vec2(+a.x,c.y)).x, fwtrans(vec2(c.x,+a.y)).y)/aspect;
  return vec3((hi+lo)*aspect*0.5, max(hi.x-lo.x, hi.y-lo.y));
}
vec2 transform(vec2 coord, vec3 stretch){
  coord = (coord-vec2(0.5))*aspect*stretch.z+stretch.xy;
  return (bkwtrans(coord)/overscan/aspect+vec2(0.5));
}
float corner(vec2 coord){
  coord = (coord - vec2(0.5)) * overscan + vec2(0.5);
  coord = min(coord, vec2(1.0)-coord) * aspect;
  vec2 cdist = vec2(uCorner);
  coord = (cdist - min(coord,cdist));
  float dist = sqrt(dot(coord,coord));
  return clamp((cdist.x-dist)*cornersmooth, 0.0, 1.0)*1.0001;
}
vec4 scanlineWeights(float distance, vec4 color){
  vec4 wid = 2.0 + 2.0 * pow(color, vec4(4.0));
  vec4 weights = vec4(distance / uScanW);
  return (LUM + 1.4) * exp(-pow(weights * inversesqrt(0.5 * wid), wid)) / (0.6 + 0.2 * wid);
}
vec3 saturation(vec3 textureColor){
  float lum = length(textureColor)*0.5775;
  vec3 lw = vec3(0.3,0.6,0.1);
  if (lum < 0.5) lw = (lw*lw)+(lw*lw);
  float luminance = dot(textureColor, lw);
  return mix(vec3(luminance), textureColor, SATURATION);
}
vec3 inv_gamma(vec3 col, vec3 power){
  vec3 cir = col-1.0;
  cir *= cir;
  return mix(sqrt(col), sqrt(1.0-cir), power);
}
vec4 TEX2D(vec2 c){ return pow(texture2D(uTex, c), vec4(CRTgamma)); }

void main(){
  vec3 stretch = maxscale();
  vec2 xy = (uCurv > 0.5) ? transform(vUV, stretch) : vUV;
  float cval = corner(xy);

  vec2 ratio_scale = xy * TextureSize - vec2(0.5);
  float filter_ = InputSize.y / OutputSize.y;
  vec2 uv_ratio = fract(ratio_scale);
  xy = (floor(ratio_scale) + vec2(0.5)) / TextureSize;
  vec2 one = vec2(1.0) / TextureSize;

  vec4 coeffs = PI * vec4(1.0 + uv_ratio.x, uv_ratio.x, 1.0 - uv_ratio.x, 2.0 - uv_ratio.x);
  coeffs = FIX(coeffs);
  coeffs = 2.0 * sin(coeffs) * sin(coeffs / 2.0) / (coeffs * coeffs);
  coeffs /= dot(coeffs, vec4(1.0));

  vec4 col = clamp(mat4(
      TEX2D(xy + vec2(-one.x, 0.0)),
      TEX2D(xy),
      TEX2D(xy + vec2(one.x, 0.0)),
      TEX2D(xy + vec2(2.0 * one.x, 0.0))) * coeffs, 0.0, 1.0);
  vec4 col2 = clamp(mat4(
      TEX2D(xy + vec2(-one.x, one.y)),
      TEX2D(xy + vec2(0.0, one.y)),
      TEX2D(xy + one),
      TEX2D(xy + vec2(2.0 * one.x, one.y))) * coeffs, 0.0, 1.0);

  vec4 weights  = scanlineWeights(uv_ratio.y, col);
  vec4 weights2 = scanlineWeights(1.0 - uv_ratio.y, col2);
  uv_ratio.y = uv_ratio.y + 1.0/3.0*filter_;
  weights  = (weights  + scanlineWeights(uv_ratio.y, col)) / 3.0;
  weights2 = (weights2 + scanlineWeights(abs(1.0 - uv_ratio.y), col2)) / 3.0;
  uv_ratio.y = uv_ratio.y - 2.0/3.0*filter_;
  weights  = weights  + scanlineWeights(abs(uv_ratio.y), col) / 3.0;
  weights2 = weights2 + scanlineWeights(abs(1.0 - uv_ratio.y), col2) / 3.0;

  vec3 mul_res = (col * weights + col2 * weights2).rgb * vec3(cval);

  float mod_factor = vUV.x * OutputSize.x;
  vec3 dotMaskWeights = mix(
      vec3(1.0, 1.0 - uDotMask, 1.0),
      vec3(1.0 - uDotMask, 1.0, 1.0 - uDotMask),
      floor(mod(mod_factor, 2.0)));
  mul_res *= dotMaskWeights;

  vec3 pwr = vec3(1.0 / ((-0.7*(1.0-uScanW)+1.0) * (-0.5*uDotMask+1.0)) - 1.25);
  mul_res = inv_gamma(mul_res, pwr);
  mul_res = saturation(mul_res);

  gl_FragColor = vec4(mul_res, 1.0);
}`;

export interface GeomParams {
  curvature: number;
  radius: number;
  distance: number;
  scanWeight: number;
  dotMask: number;
  corner: number;
}
export const GEOM_DEFAULTS: GeomParams = {
  curvature: 1.0,
  radius: 2.0,
  distance: 1.6,
  scanWeight: 0.3,
  dotMask: 0.3,
  corner: 0.03,
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

export class CRTGeomRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private source: HTMLCanvasElement;
  params: GeomParams;

  constructor(glCanvas: HTMLCanvasElement, source: HTMLCanvasElement, params: GeomParams = GEOM_DEFAULTS) {
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

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["uTex", "uTexRes", "uOutRes", "uCurv", "uR", "uD", "uScanW", "uDotMask", "uCorner"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    const tex = gl.createTexture()!;
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.clearColor(0, 0, 0, 1);
  }

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

  render(_timeSec: number): void {
    const gl = this.gl;
    const p = this.params;
    const c = gl.canvas as HTMLCanvasElement;
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);

    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uTexRes, this.source.width, this.source.height);
    gl.uniform2f(this.u.uOutRes, c.width, c.height);
    gl.uniform1f(this.u.uCurv, p.curvature);
    gl.uniform1f(this.u.uR, p.radius);
    gl.uniform1f(this.u.uD, p.distance);
    gl.uniform1f(this.u.uScanW, p.scanWeight);
    gl.uniform1f(this.u.uDotMask, p.dotMask);
    gl.uniform1f(this.u.uCorner, p.corner);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
