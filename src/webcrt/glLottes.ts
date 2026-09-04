// Port a WebGL1 del shader CRT-LOTTES de RetroArch (Timothy Lottes, dominio público).
// Warp de barril + beam gaussiano (Tri) + shadow-mask (4 tipos) + bloom + gamma sRGB.
// La textura fuente es exactamente el contenido (TextureSize == InputSize).

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
uniform vec2 uTexRes;
uniform vec2 uOutRes;
uniform float hardScan, hardPix, warpX, warpY, maskDark, maskLight, shadowMask, brightBoost, hardBloomPix, hardBloomScan, bloomAmount, shape;

#define scaleInLinearGamma 1.0
#define SourceSize vec4(uTexRes, 1.0/uTexRes)

float ToLinear1(float c){ return (c<=0.04045) ? c/12.92 : pow((c+0.055)/1.055, 2.4); }
vec3 ToLinear(vec3 c){ return vec3(ToLinear1(c.r), ToLinear1(c.g), ToLinear1(c.b)); }
float ToSrgb1(float c){ return (c<0.0031308) ? c*12.92 : 1.055*pow(c, 0.41666)-0.055; }
vec3 ToSrgb(vec3 c){ return vec3(ToSrgb1(c.r), ToSrgb1(c.g), ToSrgb1(c.b)); }

vec3 Fetch(vec2 pos, vec2 off){
  pos = (floor(pos*SourceSize.xy+off)+vec2(0.5))/SourceSize.xy;
  return ToLinear(brightBoost * texture2D(uTex, pos.xy).rgb);
}
vec2 Dist(vec2 pos){ pos = pos*SourceSize.xy; return -((pos-floor(pos))-vec2(0.5)); }
float Gaus(float pos, float scale){ return exp2(scale*pow(abs(pos), shape)); }

vec3 Horz3(vec2 pos, float off){
  vec3 b=Fetch(pos,vec2(-1.0,off)); vec3 c=Fetch(pos,vec2(0.0,off)); vec3 d=Fetch(pos,vec2(1.0,off));
  float dst=Dist(pos).x; float scale=hardPix;
  float wb=Gaus(dst-1.0,scale), wc=Gaus(dst+0.0,scale), wd=Gaus(dst+1.0,scale);
  return (b*wb+c*wc+d*wd)/(wb+wc+wd);
}
vec3 Horz5(vec2 pos, float off){
  vec3 a=Fetch(pos,vec2(-2.0,off)); vec3 b=Fetch(pos,vec2(-1.0,off)); vec3 c=Fetch(pos,vec2(0.0,off));
  vec3 d=Fetch(pos,vec2(1.0,off)); vec3 e=Fetch(pos,vec2(2.0,off));
  float dst=Dist(pos).x; float scale=hardPix;
  float wa=Gaus(dst-2.0,scale), wb=Gaus(dst-1.0,scale), wc=Gaus(dst+0.0,scale), wd=Gaus(dst+1.0,scale), we=Gaus(dst+2.0,scale);
  return (a*wa+b*wb+c*wc+d*wd+e*we)/(wa+wb+wc+wd+we);
}
vec3 Horz7(vec2 pos, float off){
  vec3 a=Fetch(pos,vec2(-3.0,off)); vec3 b=Fetch(pos,vec2(-2.0,off)); vec3 c=Fetch(pos,vec2(-1.0,off));
  vec3 d=Fetch(pos,vec2(0.0,off)); vec3 e=Fetch(pos,vec2(1.0,off)); vec3 f=Fetch(pos,vec2(2.0,off)); vec3 g=Fetch(pos,vec2(3.0,off));
  float dst=Dist(pos).x; float scale=hardBloomPix;
  float wa=Gaus(dst-3.0,scale), wb=Gaus(dst-2.0,scale), wc=Gaus(dst-1.0,scale), wd=Gaus(dst+0.0,scale), we=Gaus(dst+1.0,scale), wf=Gaus(dst+2.0,scale), wg=Gaus(dst+3.0,scale);
  return (a*wa+b*wb+c*wc+d*wd+e*we+f*wf+g*wg)/(wa+wb+wc+wd+we+wf+wg);
}
float Scan(vec2 pos, float off){ return Gaus(Dist(pos).y+off, hardScan); }
float BloomScan(vec2 pos, float off){ return Gaus(Dist(pos).y+off, hardBloomScan); }
vec3 Tri(vec2 pos){
  vec3 a=Horz3(pos,-1.0); vec3 b=Horz5(pos,0.0); vec3 c=Horz3(pos,1.0);
  float wa=Scan(pos,-1.0), wb=Scan(pos,0.0), wc=Scan(pos,1.0);
  return a*wa+b*wb+c*wc;
}
vec3 Bloom(vec2 pos){
  vec3 a=Horz5(pos,-2.0); vec3 b=Horz7(pos,-1.0); vec3 c=Horz7(pos,0.0); vec3 d=Horz7(pos,1.0); vec3 e=Horz5(pos,2.0);
  float wa=BloomScan(pos,-2.0), wb=BloomScan(pos,-1.0), wc=BloomScan(pos,0.0), wd=BloomScan(pos,1.0), we=BloomScan(pos,2.0);
  return a*wa+b*wb+c*wc+d*wd+e*we;
}
vec2 Warp(vec2 pos){
  pos = pos*2.0-1.0;
  pos *= vec2(1.0+(pos.y*pos.y)*warpX, 1.0+(pos.x*pos.x)*warpY);
  return pos*0.5+0.5;
}
vec3 Mask(vec2 pos){
  vec3 mask = vec3(maskDark);
  if (shadowMask == 1.0){
    float ln = maskLight; float odd = 0.0;
    if (fract(pos.x*0.166666666) < 0.5) odd = 1.0;
    if (fract((pos.y+odd)*0.5) < 0.5) ln = maskDark;
    pos.x = fract(pos.x*0.333333333);
    if (pos.x < 0.333) mask.r = maskLight; else if (pos.x < 0.666) mask.g = maskLight; else mask.b = maskLight;
    mask *= ln;
  } else if (shadowMask == 2.0){
    pos.x = fract(pos.x*0.333333333);
    if (pos.x < 0.333) mask.r = maskLight; else if (pos.x < 0.666) mask.g = maskLight; else mask.b = maskLight;
  } else if (shadowMask == 3.0){
    pos.x += pos.y*3.0; pos.x = fract(pos.x*0.166666666);
    if (pos.x < 0.333) mask.r = maskLight; else if (pos.x < 0.666) mask.g = maskLight; else mask.b = maskLight;
  } else if (shadowMask == 4.0){
    pos.xy = floor(pos.xy*vec2(1.0,0.5)); pos.x += pos.y*3.0; pos.x = fract(pos.x*0.166666666);
    if (pos.x < 0.333) mask.r = maskLight; else if (pos.x < 0.666) mask.g = maskLight; else mask.b = maskLight;
  }
  return mask;
}

void main(){
  vec2 pos = Warp(vUV);
  vec3 outColor = Tri(pos);
  outColor.rgb += Bloom(pos)*bloomAmount;
  if (shadowMask > 0.0) outColor.rgb *= Mask(gl_FragCoord.xy * 1.000001);
  vec2 bt = pos;
  if (!(bt.x>0.0001 && bt.x<0.9999 && bt.y>0.0001 && bt.y<0.9999)) outColor = vec3(0.0);
  gl_FragColor = vec4(ToSrgb(outColor.rgb), 1.0);
}`;

export interface LottesParams {
  hardScan: number;
  hardPix: number;
  warpX: number;
  warpY: number;
  maskDark: number;
  maskLight: number;
  shadowMask: number;
  brightBoost: number;
  hardBloomPix: number;
  hardBloomScan: number;
  bloomAmount: number;
  shape: number;
}
export const LOTTES_DEFAULTS: LottesParams = {
  hardScan: -8,
  hardPix: -3,
  warpX: 0.031,
  warpY: 0.041,
  maskDark: 0.5,
  maskLight: 1.5,
  shadowMask: 3,
  brightBoost: 1,
  hardBloomPix: -1.5,
  hardBloomScan: -2,
  bloomAmount: 0.15,
  shape: 2,
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

export class CRTLottesRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private source: HTMLCanvasElement;
  params: LottesParams;

  constructor(glCanvas: HTMLCanvasElement, source: HTMLCanvasElement, params: LottesParams = LOTTES_DEFAULTS) {
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

    for (const name of [
      "uTex", "uTexRes", "uOutRes", "hardScan", "hardPix", "warpX", "warpY", "maskDark",
      "maskLight", "shadowMask", "brightBoost", "hardBloomPix", "hardBloomScan", "bloomAmount", "shape",
    ]) {
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
    gl.uniform1f(this.u.hardScan, p.hardScan);
    gl.uniform1f(this.u.hardPix, p.hardPix);
    gl.uniform1f(this.u.warpX, p.warpX);
    gl.uniform1f(this.u.warpY, p.warpY);
    gl.uniform1f(this.u.maskDark, p.maskDark);
    gl.uniform1f(this.u.maskLight, p.maskLight);
    gl.uniform1f(this.u.shadowMask, p.shadowMask);
    gl.uniform1f(this.u.brightBoost, p.brightBoost);
    gl.uniform1f(this.u.hardBloomPix, p.hardBloomPix);
    gl.uniform1f(this.u.hardBloomScan, p.hardBloomScan);
    gl.uniform1f(this.u.bloomAmount, p.bloomAmount);
    gl.uniform1f(this.u.shape, p.shape);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
