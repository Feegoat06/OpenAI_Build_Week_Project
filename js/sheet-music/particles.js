/* ------------------------------------------------------------------
   LEGATO – WebGL particle staff
   Replaces the original Canvas 2D overlay with a Three.js renderer
   that runs fully on the GPU:

     • OrthographicCamera matching canvas CSS pixel dimensions
     • 3D Simplex-Noise vertex shader for organic breathing drift
     • Multi-frequency sin layering driven by uBass / uEnergy
     • Scatter ↔ assemble state machine (idle / playback / paused / settling)
     • Additive-blending "bloom" second pass for soft glow
     • Tone.Analyser tap for bass / energy uniforms (graceful fallback)
------------------------------------------------------------------ */

// Dense enough to preserve noteheads, stems, beams, and accidentals after the
// semantic SVG is replaced by particles. Compact devices retain a lower cap
// so the two-pass point render does not overwhelm integrated/mobile GPUs.
const DESKTOP_PARTICLES = 48000;
const COMPACT_PARTICLES = 20000;
const MAX_DPR           = 3;
const GOLD              = [209, 161, 90];

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease  = (t) => 1 - (1 - clamp(t)) ** 3;

/* ── GLSL ────────────────────────────────────────────────────────── */

// Compact 3D Simplex noise (Stefan Gustavson / Ashima Arts)
const SIMPLEX = /* glsl */`
vec4 _p289(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = _p289(_p289(_p289(
      i.z + vec4(0.0,i1.z,i2.z,1.0))
    + i.y + vec4(0.0,i1.y,i2.y,1.0))
    + i.x + vec4(0.0,i1.x,i2.x,1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4  j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_  = floor(j * ns.z);
  vec4 y_  = floor(j - 7.0 * x_);
  vec4 xx  = x_ * ns.x + ns.yyyy;
  vec4 yy  = y_ * ns.x + ns.yyyy;
  vec4 h   = 1.0 - abs(xx) - abs(yy);
  vec4 b0  = vec4(xx.xy, yy.xy);
  vec4 b1  = vec4(xx.zw, yy.zw);
  vec4 s0  = floor(b0)*2.0 + 1.0;
  vec4 s1  = floor(b1)*2.0 + 1.0;
  vec4 sh  = -step(h, vec4(0.0));
  vec4 a0  = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1  = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0  = vec3(a0.xy, h.x);
  vec3 p1  = vec3(a0.zw, h.y);
  vec3 p2  = vec3(a1.xy, h.z);
  vec3 p3  = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERT = /* glsl */`
precision highp float;
${SIMPLEX}

uniform float uTime;
uniform float uBass;
uniform float uEnergy;
uniform float uProgress;
uniform float uScatterT;   // 0 = assembled, 1 = fully scattered
uniform float uVisibleMeasure; // highest measure that has begun playback
uniform float uCanvasW;
uniform float uCanvasH;    // canvas CSS height for y-flip
uniform float uPixelRatio; // for gl_PointSize
uniform float uBloomMult;  // 1.0 for main pass, >1 for bloom
uniform float uMotionStrength;
uniform float uPointerActive;
uniform float uPointerRadius;
uniform vec2  uPointer;

attribute float aSeed;
attribute float aOrder;
attribute float aMeasure;
attribute float aCoverage;
attribute vec3  aCol;

varying float vAlpha;
varying float vBright;
varying float vCoverage;
varying vec3  vCol;

void main() {
  // Raw pixel coordinates stored in buffer; flip y to match Three.js (y-up)
  vec3 pos = vec3(position.x, uCanvasH - position.y, position.z);

  // Stable per-particle randoms from seed
  float s1 = fract(sin(aSeed * 12.9898 + 1.0) * 43758.5453);
  float s2 = fract(sin(aSeed * 78.233  + 2.0) * 43758.5453);
  float s3 = fract(sin(aSeed * 39.346  + 3.0) * 43758.5453);

  // ── Readable orbital breathing ────────────────────────────────────
  // Every point stays close to its notation origin. Phase offsets across x
  // turn the small ellipses into broad travelling waves without deforming
  // the glyph silhouettes enough to hurt legibility.
  float nT       = uTime * 0.19;
  float phase    = uTime * 0.72 + pos.x * 0.014 + aMeasure * 0.82 + s1 * 0.12;
  float wave     = sin(uTime * 0.34 + pos.x * 0.0105 + pos.y * 0.022 + aMeasure * 0.56);
  float shimmer  = 0.5 + 0.5 * sin(phase * 0.74 + wave * 0.65);
  float orbitAmp = 0.55 + s2 * 0.12 + uBass * 0.15;
  vec2 center    = vec2(uCanvasW * 0.5, uCanvasH * 0.5);
  float camScale = 1.0 + sin(uTime * 0.43) * 0.0017 * uMotionStrength;
  vec2 camDrift  = center + (pos.xy - center) * camScale - pos.xy;
  float nX       = (cos(phase) * orbitAmp
                   + snoise(vec3(pos.x * 0.0036, pos.y * 0.0072, nT)) * 0.38
                   + camDrift.x) * uMotionStrength;
  float nY       = (sin(phase) * orbitAmp * 1.18
                   + wave * (0.34 + uEnergy * 0.16)
                   + snoise(vec3(pos.x * 0.0036 + 100.0, pos.y * 0.0072, nT * 0.71)) * 0.30
                   + camDrift.y) * uMotionStrength;

  // ── Star-field scatter displacement ──────────────────────────────
  float scatterAngle = s1 * 6.2832;
  float scatterReach = 0.38 + s2 * 0.62;
  float scX = cos(scatterAngle) * min(270.0, uCanvasW * 0.34) * scatterReach
            + sin(uTime * 0.052 + s3 * 6.2832) * 16.0;
  float scY = sin(scatterAngle) * min(170.0, uCanvasH * 0.46) * scatterReach
            + cos(uTime * 0.044 + s2 * 6.2832) * 12.0;

  // ── Assembly progress for this individual particle ────────────────
  float dist      = uProgress - aOrder;
  float assembled = clamp(dist / 0.018 + 0.5, 0.0, 1.0);

  // scatter only applies to unbuilt portion
  float effScatter = uScatterT * (1.0 - assembled);

  pos.x += mix(nX, scX, effScatter);
  pos.y += mix(nY, scY, effScatter);
  float hover = uPointerActive * (1.0 - smoothstep(
    uPointerRadius * 0.18,
    uPointerRadius,
    distance(pos.xy, uPointer)
  ));

  // Subtle z pulsation (visible in perspective-free ortho as size modulation)
  pos.z  = snoise(vec3(pos.x * 0.0026, pos.y * 0.0026, uTime * 0.09)) * 1.4
         + uBass * 0.7;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

  // ── Point size ───────────────────────────────────────────────────
  float isFrontier = step(abs(dist), 0.026);
  float isActive   = step(abs(dist), 0.062);
  float coverage   = smoothstep(0.12, 0.92, aCoverage);
  float sz         = (0.72 + s3 * 0.42 + uBass * 0.16) * uPixelRatio;
  sz *= (1.0 + isFrontier * 0.38 + isActive * 0.14 + hover * 0.22
        + shimmer * 0.04 * uMotionStrength) * uBloomMult;
  gl_PointSize = sz;

  // ── Alpha ────────────────────────────────────────────────────────
  float idleA     = 0.73 + s1 * 0.18 + shimmer * 0.08 * uMotionStrength;
  // The SVG layer is hidden while this particle reconstruction is active.
  // Never leave future measures faintly scattered: a displaced flag/stem from
  // the next system reads as an incorrect stray note. A measure becomes
  // visible only when audio playback has actually reached it.
  float measureHasBegun = step(aMeasure, uVisibleMeasure + 0.01);
  // Preserve the original subtle scatter opacity for a measure that has
  // started; the gate only suppresses measures that have not started yet.
  float playbackA = measureHasBegun * (0.18 + assembled * 0.68 + isActive * 0.18);
  vAlpha = min(1.0, (mix(idleA, playbackA, step(0.01, uScatterT)) + hover * measureHasBegun * 0.20)
           * (0.78 + coverage * 0.22));

  // ── Brightness ──────────────────────────────────────────────────
  vBright = 0.88 + isFrontier * 0.30 + isActive * 0.18
          + uBass * 0.16 + uEnergy * 0.08 + hover * 0.82
          + shimmer * 0.14 * uMotionStrength;

  vCoverage = coverage;
  vCol = aCol;
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDotTex;
uniform float     uColorBoost;
varying float vAlpha;
varying float vBright;
varying float vCoverage;
varying vec3  vCol;
void main() {
  vec4 t = texture2D(uDotTex, gl_PointCoord);
  if (t.a < 0.018) discard;
  vec3 col = max(vCol * vBright, vec3(0.0));
  col = pow(col, vec3(1.0 / max(1.0, uColorBoost)));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float floorLum = mix(0.31, 0.36, vCoverage);
  col *= max(1.0, floorLum / max(0.001, lum));
  col = clamp(col, vec3(0.0), vec3(1.45));
  float core = smoothstep(0.06, 0.28, t.a);
  gl_FragColor = vec4(col, core * vAlpha);
}
`;

const BLOOM_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDotTex;
uniform float     uBloomAlpha;
uniform float     uColorBoost;
varying float vAlpha;
varying float vBright;
varying float vCoverage;
varying vec3  vCol;
void main() {
  vec4 t = texture2D(uDotTex, gl_PointCoord);
  if (t.a < 0.01) discard;
  float soft = t.a * t.a;
  vec3 col = max(vCol * (0.72 + vBright * 0.48), vec3(0.0));
  col = pow(col, vec3(1.0 / max(1.0, uColorBoost)));
  col = clamp(col + vec3(0.10, 0.065, 0.025), vec3(0.0), vec3(1.65));
  gl_FragColor = vec4(col, soft * vAlpha * uBloomAlpha * (0.76 + vCoverage * 0.24));
}
`;

/* ── Soft radial dot texture ────────────────────────────────────── */
function makeDotTexture(T) {
  const S = 64;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.96)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.48)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new T.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/* ── Main export ────────────────────────────────────────────────── */
export function createSheetMusicParticles(canvas) {
  const T = window.THREE;
  if (!T) {
    console.warn('[particles] Three.js not available — visual disabled.');
    return { setSheetMusic() {}, beginPlayback() {}, setProgress() {}, settle() {} };
  }

  const stage   = canvas.closest('.notation-stage');
  const stateEl = stage?.querySelector('#sheet-music-fx-state');
  const mq      = window.matchMedia('(prefers-reduced-motion: reduce)');
  let   rm      = mq.matches;
  const compact = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches
    || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const particleCap = compact ? COMPACT_PARTICLES : DESKTOP_PARTICLES;
  const sampleStep  = compact ? 2 : 1;

  /* ── Three.js renderer ─────────────────────────────────────────── */
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setClearColor(0x000000, 0);
  renderer.sortObjects = false;
  // The sampled SVG pixels are sRGB. Match the reference visual system and
  // keep the renderer in sRGB output instead of writing them as linear values.
  if (T.SRGBColorSpace !== undefined) {
    renderer.outputColorSpace = T.SRGBColorSpace;
  }

  const scene = new T.Scene();
  let camera  = null;
  let cW = 0, cH = 0;

  /* ── Shared uniform objects (mutated every frame) ─────────────── */
  const uTime       = { value: 0 };
  const uBass       = { value: 0 };
  const uEnergy     = { value: 0 };
  const uProgress   = { value: 0 };
  const uScatterT   = { value: 0 };
  const uVisibleMeasure = { value: -1 };
  const uCanvasW    = { value: 1 };
  const uCanvasH    = { value: 1 };
  const uPixelRatio = { value: renderer.getPixelRatio() };
  const uDotTex     = { value: makeDotTexture(T) };
  const uMotionStrength = { value: rm ? 0 : 1 };
  const uPointerActive  = { value: 0 };
  const uPointerRadius  = { value: compact ? 82 : 112 };
  const uPointer        = { value: new T.Vector2(-10000, -10000) };
  const uColorBoost     = { value: 1.28 };

  // Main pass (normal blending, tight point size)
  const mainUniforms = {
    uTime, uBass, uEnergy, uProgress, uScatterT, uVisibleMeasure,
    uCanvasW, uCanvasH, uPixelRatio, uDotTex,
    uMotionStrength, uPointerActive, uPointerRadius, uPointer, uColorBoost,
    uBloomMult:  { value: 1.0 },
  };

  // Bloom pass (additive blending, enlarged points for soft halo)
  const bloomUniforms = {
    uTime, uBass, uEnergy, uProgress, uScatterT, uVisibleMeasure,
    uCanvasW, uCanvasH, uPixelRatio, uDotTex,
    uMotionStrength, uPointerActive, uPointerRadius, uPointer, uColorBoost,
    uBloomMult:  { value: 1.85 },
    uBloomAlpha: { value: 0.14 },
  };

  const matBase = {
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  };

  const mat      = new T.ShaderMaterial({ ...matBase, uniforms: mainUniforms, blending: T.NormalBlending });
  const bloomMat = new T.ShaderMaterial({ ...matBase, fragmentShader: BLOOM_FRAG, uniforms: bloomUniforms, blending: T.AdditiveBlending });

  let geo = null, pts = null, bPts = null;

  /* ── Camera / resize ───────────────────────────────────────────── */
  function syncCamera() {
    const par = canvas.parentElement;
    if (!par) return;
    const w = Math.max(1, par.clientWidth);
    const h = Math.max(1, par.clientHeight);
    const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const dprChanged = Math.abs(renderer.getPixelRatio() - nextDpr) > 0.001;
    if (dprChanged) renderer.setPixelRatio(nextDpr);
    if (w === cW && h === cH && camera && !dprChanged) return;
    cW = w; cH = h;
    renderer.setSize(w, h, false); // false = don't override CSS width/height
    uCanvasW.value    = w;
    uCanvasH.value    = h;
    uPixelRatio.value = renderer.getPixelRatio();
    if (camera) {
      camera.left = 0; camera.right = w;
      camera.top  = h; camera.bottom = 0;
      camera.updateProjectionMatrix();
    } else {
      // top=h, bottom=0 → world y=0 at bottom, y=h at top
      // particle y is raw pixel (0=top); flip in shader: world_y = h - pixel_y
      camera = new T.OrthographicCamera(0, w, h, 0, -200, 200);
    }
  }

  /* ── State ─────────────────────────────────────────────────────── */
  let mode          = 'idle';
  let progress      = 0;
  let activeMeasure = null;
  let modeStartedAt = performance.now();
  let layout        = [];
  let sampleGen     = 0;
  let frameId       = 0;
  let lastT         = performance.now();

  /* ── Audio analysis via Tone.Analyser ──────────────────────────── */
  let toneAnalyser = null;

  function getAnalyser() {
    if (toneAnalyser) return toneAnalyser;
    try {
      if (!window.Tone) return null;
      const raw = Tone.getContext().rawContext;
      if (raw.state === 'suspended') return null;
      toneAnalyser = new Tone.Analyser({ type: 'fft', size: 128, smoothing: 0.82 });
      Tone.getDestination().connect(toneAnalyser);
    } catch (e) { toneAnalyser = null; }
    return toneAnalyser;
  }

  function readAudio() {
    if (rm) return { bass: 0, energy: 0 };
    const an = getAnalyser();
    if (!an) return { bass: 0, energy: 0 };
    const v = an.getValue(); // Float32Array dBFS (~-100..0)
    const n = v.length;
    const bassEnd = Math.max(2, Math.floor(n * 0.04));
    let bSum = 0;
    for (let i = 0; i < bassEnd; i++) bSum += Math.max(0, (v[i] + 100) / 100);
    const bass = Math.min(1, bSum / bassEnd);
    let eSum = 0;
    for (let i = 0; i < n; i++) eSum += Math.max(0, (v[i] + 100) / 100);
    const energy = Math.min(1, eSum / n);
    return { bass, energy };
  }

  /* ── Geometry builders ─────────────────────────────────────────── */
  const seededR = (v) => { const r = Math.sin(v * 12.9898 + 78.233) * 43758.5453; return r - Math.floor(r); };

  function nearestM(x, y) {
    return layout.reduce((best, m) => {
      const hd = x < m.x ? m.x - x : Math.max(0, x - m.x - m.width);
      const d  = hd * 2 + Math.abs(y - (m.staffTop + 20));
      return !best || d < best.d ? { m, d } : best;
    }, null)?.m;
  }

  function buildGeo(list) {
    const n  = list.length;
    const pa = new Float32Array(n * 3);
    const sa = new Float32Array(n);
    const oa = new Float32Array(n);
    const ma = new Float32Array(n);
    const qa = new Float32Array(n);
    const ca = new Float32Array(n * 3);

    list.forEach((p, i) => {
      pa[i * 3]     = p.x;
      pa[i * 3 + 1] = p.y; // raw pixel y (0 = top); flipped in shader via uCanvasH
      pa[i * 3 + 2] = 0;
      sa[i]     = p.seed;
      oa[i]     = p.order;
      ma[i]     = p.measure;
      qa[i]     = p.coverage ?? 1;
      ca[i * 3]     = p.color[0] / 255;
      ca[i * 3 + 1] = p.color[1] / 255;
      ca[i * 3 + 2] = p.color[2] / 255;
    });

    if (geo)  geo.dispose();
    geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pa, 3));
    geo.setAttribute('aSeed',    new T.BufferAttribute(sa, 1));
    geo.setAttribute('aOrder',   new T.BufferAttribute(oa, 1));
    geo.setAttribute('aMeasure', new T.BufferAttribute(ma, 1));
    geo.setAttribute('aCoverage', new T.BufferAttribute(qa, 1));
    geo.setAttribute('aCol',     new T.BufferAttribute(ca, 3));

    if (pts)  { scene.remove(pts);  pts.geometry.dispose(); }
    if (bPts) { scene.remove(bPts); bPts.geometry.dispose(); }

    // Bloom renders first (behind), main pass on top
    bPts = new T.Points(geo, bloomMat);
    pts  = new T.Points(geo, mat);
    bPts.frustumCulled = false;
    pts.frustumCulled = false;
    bPts.renderOrder = 0;
    pts.renderOrder = 1;
    scene.add(bPts);
    scene.add(pts);
  }

  function buildFallback() {
    const sp   = Math.max(4, layout.reduce((s, m) => s + m.width * 5, 0) / 1800);
    const list = [];
    layout.forEach((m) => {
      const cnt = Math.max(2, Math.floor(m.width / sp));
      for (let line = 0; line < 5; line++) {
        for (let k = 0; k <= cnt; k++) {
          const lp   = k / cnt;
          const seed = m.index * 997 + line * 173 + k * 11;
          list.push({
            x: m.x + lp * m.width,
            y: m.staffTop + line * m.lineGap,
            color: GOLD, seed,
            order:   (m.index + lp) / Math.max(1, layout.length),
            measure: m.index,
            coverage: 1,
          });
        }
      }
    });
    buildGeo(list);
  }

  function samplePx(imgData, w, h, sp, scale = 1) {
    const px = imgData.data;
    const list = [];
    for (let cy = 0; cy < h; cy += sp) {
      for (let cx = 0; cx < w; cx += sp) {
        let bestA = 28, bestOff = -1;
        for (let y = cy; y < Math.min(h, cy + sp); y++) {
          for (let x = cx; x < Math.min(w, cx + sp); x++) {
            const off = (y * w + x) * 4;
            if (px[off + 3] > bestA) { bestA = px[off + 3]; bestOff = off; }
          }
        }
        if (bestOff < 0) continue;
        const pi = bestOff / 4;
        const rasterX = pi % w;
        const rasterY = Math.floor(pi / w);
        const x = rasterX / scale;
        const y = rasterY / scale;
        const m  = nearestM(x, y);
        if (!m) continue;
        const lp   = clamp((x - m.x) / m.width);
        const seed = m.index * 997 + Math.round(x) * 17 + Math.round(y) * 31 + list.length;
        list.push({
          x, y,
          color: [px[bestOff], px[bestOff + 1], px[bestOff + 2]]
            .map((c) => Math.min(255, Math.round(c * 1.18 + 12))),
          seed,
          order:   (m.index + lp) / Math.max(1, layout.length),
          measure: m.index,
          coverage: bestA / 255,
        });
      }
    }
    return list;
  }

  async function sampleSvg(svg, gen) {
    const par = canvas.parentElement;
    if (!svg || !par) return false;
    const w = Math.max(1, Math.round(par.clientWidth));
    const h = Math.max(1, Math.round(par.clientHeight));
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
    );
    const img = new Image();
    try {
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
      if (gen !== sampleGen) return false;
      // Rasterize above CSS resolution before selecting points. This gives
      // thin glyph details several candidate pixels instead of letting a
      // single low-resolution sample erase a stem, beam, or accidental.
      const sampleScale = compact ? 2 : 3;
      const rasterW = Math.max(1, Math.round(w * sampleScale));
      const rasterH = Math.max(1, Math.round(h * sampleScale));
      const rc  = Object.assign(document.createElement('canvas'), { width: rasterW, height: rasterH });
      const rctx = rc.getContext('2d', { willReadFrequently: true });
      rctx.imageSmoothingEnabled = true;
      rctx.imageSmoothingQuality = 'high';
      rctx.drawImage(img, 0, 0, rasterW, rasterH);
      const data = rctx.getImageData(0, 0, rasterW, rasterH);
      let sp = sampleStep;
      let list = samplePx(data, rasterW, rasterH, sp, sampleScale);
      while (list.length > particleCap && sp < 10) {
        sp++;
        list = samplePx(data, rasterW, rasterH, sp, sampleScale);
      }
      if (gen !== sampleGen || !list.length) return false;
      buildGeo(list.slice(0, particleCap));
      stage?.classList.add('has-full-particles');
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ── Render loop ───────────────────────────────────────────────── */
  function loop(now) {
    frameId = requestAnimationFrame(loop);

    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    syncCamera();
    if (!camera) return;

    const { bass, energy } = readAudio();
    uTime.value     += dt;
    uBass.value      = bass;
    uEnergy.value    = energy;
    uProgress.value  = progress;

    const elapsed = now - modeStartedAt;
    if (mode === 'idle') {
      uScatterT.value = 0;
    } else if (mode === 'playback') {
      uScatterT.value = ease(elapsed / 280);
    } else if (mode === 'paused') {
      uScatterT.value = 1;
    } else if (mode === 'settling') {
      uScatterT.value = 1 - ease(elapsed / 700);
      if (elapsed >= 700) {
        mode = 'idle';
        modeStartedAt = now;
        uScatterT.value = 0;
        stage?.classList.remove('is-particle-playing', 'is-particle-paused', 'is-particle-settling');
        stage?.style.setProperty('--sheet-music-progress', '0%');
        setLabel('Sheet music breathing');
      }
    }

    renderer.render(scene, camera);
  }

  function ensureLoop() { if (!frameId) frameId = requestAnimationFrame(loop); }
  function setLabel(v)  { if (stateEl) stateEl.textContent = v; }

  /* ── Public API (identical surface to old Canvas 2D version) ───── */
  function setSheetMusic(svg, nextLayout) {
    sampleGen++;
    const gen = sampleGen;
    layout = nextLayout;
    syncCamera();
    if (!svg || !layout.length) {
      stage?.classList.remove('has-full-particles');
      buildFallback();
      ensureLoop();
      return;
    }
    if (!stage?.classList.contains('has-full-particles')) buildFallback();
    ensureLoop();
    sampleSvg(svg, gen)
      .then((ok) => { if (!ok && gen === sampleGen) { stage?.classList.remove('has-full-particles'); buildFallback(); } })
      .catch(()  => { if (gen === sampleGen)        { stage?.classList.remove('has-full-particles'); buildFallback(); } });
  }

  function beginPlayback() {
    mode = 'playback';
    progress = 0;
    activeMeasure = null;
    uVisibleMeasure.value = -1;
    modeStartedAt = performance.now();
    stage?.classList.remove('is-particle-paused', 'is-particle-settling');
    stage?.classList.add('is-particle-playing');
    stage?.style.setProperty('--sheet-music-progress', '0%');
    setLabel('Notation dispersing');
    getAnalyser(); // eagerly start audio tap on first user gesture
    ensureLoop();
  }

  function setProgress(next, measureIndex = activeMeasure) {
    progress = clamp(next);
    activeMeasure = measureIndex;
    uVisibleMeasure.value = measureIndex ?? -1;
    stage?.style.setProperty('--sheet-music-progress', `${ (progress * 100).toFixed(2) }%`);
    if (measureIndex != null) setLabel(`Assembling measure ${ measureIndex + 1 }`);
  }

  function settle({ preserveProgress = false, immediate = false } = {}) {
    stage?.classList.remove('is-particle-playing', 'is-particle-paused', 'is-particle-settling');
    if (preserveProgress && (mode === 'playback' || mode === 'paused') && progress < 1) {
      mode = 'paused';
      modeStartedAt = performance.now();
      uScatterT.value = 1;
      stage?.classList.add('is-particle-paused');
      setLabel(`Paused at ${ Math.round(progress * 100) }%`);
      ensureLoop();
      return;
    }
    if (preserveProgress) immediate = true;
    progress = 1;
    uVisibleMeasure.value = Number.MAX_SAFE_INTEGER;
    mode = immediate || rm ? 'idle' : 'settling';
    modeStartedAt = performance.now();
    uScatterT.value = mode === 'idle' ? 0 : uScatterT.value;
    stage?.classList.toggle('is-particle-settling', mode === 'settling');
    stage?.style.setProperty('--sheet-music-progress', '0%');
    setLabel(mode === 'idle' ? 'Sheet music breathing' : 'Recalling the sheet music');
    ensureLoop();
  }

  mq.addEventListener?.('change', (e) => {
    rm = e.matches;
    uMotionStrength.value = rm ? 0 : 1;
    uPointerActive.value = rm ? 0 : uPointerActive.value;
    if (rm && mode === 'settling') {
      mode = 'idle';
      uScatterT.value = 0;
      stage?.classList.remove('is-particle-settling');
      setLabel('Sheet music breathing');
    }
  });

  stage?.addEventListener('pointermove', (event) => {
    if (rm) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    uPointer.value.set(
      (event.clientX - rect.left) * cW / rect.width,
      cH - (event.clientY - rect.top) * cH / rect.height,
    );
    uPointerActive.value = 1;
  }, { passive: true });
  stage?.addEventListener('pointerleave', () => { uPointerActive.value = 0; }, { passive: true });

  syncCamera();
  ensureLoop();

  return { setSheetMusic, beginPlayback, setProgress, settle };
}
