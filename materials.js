// =============================================================================
// materials.js — 全專案共用材質（全部程式生成，不讀任何圖片）
// -----------------------------------------------------------------------------
// 用法：
//   import { materials, variant } from '../materials.js';
//   new THREE.Mesh(geo, materials.stoneAshlar);
//   new THREE.Mesh(geo, variant('stoneCarved', { vertexColors: true }));
//
// 規則：
// - 各模組不得自行 new 材質，也不得修改這裡回傳的材質（全部共用）。
//   需要頂點色、雙面或 alphaTest 時，用 variant() 取得共用的變體。
// - 貼圖以「公尺」為單位：幾何的 UV 必須是 1 單位 = 1 公尺。
//   牆面 U 沿水平、V 往上；屋頂 U 沿簷口、V 往屋脊；地面 U = x、V = z。
// - 貼圖用固定種子的可平鋪雜訊算成 DataTexture，在 Node 與瀏覽器都能產生，
//   每次結果一模一樣。第一次取用某材質時才產生（lazy）。
// =============================================================================

import * as THREE from 'three';
import { hashString } from './rng.js';

// -----------------------------------------------------------------------------
// 可平鋪的雜訊
// -----------------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
const mod = (a, n) => ((a % n) + n) % n;

/** 值雜訊；s,t ∈ [0,1)，fx,fy 為整數頻率（保證平鋪） */
function vnoise(s, t, fx, fy, seed) {
  const x = s * fx, y = t * fy;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = fade(x - x0), ty = fade(y - y0);
  const a = hash2(mod(x0, fx), mod(y0, fy), seed);
  const b = hash2(mod(x0 + 1, fx), mod(y0, fy), seed);
  const c = hash2(mod(x0, fx), mod(y0 + 1, fy), seed);
  const d = hash2(mod(x0 + 1, fx), mod(y0 + 1, fy), seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
/** 分形雜訊，回傳約 [0,1] */
function fbm(s, t, fx, fy, seed, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(s, t, fx << o, fy << o, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// -----------------------------------------------------------------------------
// 烘焙：paint(s, t, u, v, out) → map + roughnessMap + normalMap (+ alphaMap)
// s,t ∈ [0,1) 為平鋪內座標；u,v 為公尺
// out = { r, g, b, h, rough, a }
// -----------------------------------------------------------------------------
function bake(id, { size = 512, worldW, worldH, paint, normalStrength = 1, alpha = false }) {
  const w = size, h = Math.max(8, Math.round(size * (worldH / worldW)));
  const n = w * h;
  const col = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const height = new Float32Array(n);
  const alphaData = alpha ? new Uint8Array(n * 4) : null;
  const out = { r: 0, g: 0, b: 0, h: 0, rough: 0.9, a: 1 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (x + 0.5) / w, t = (y + 0.5) / h;
      out.h = 0; out.rough = 0.9; out.a = 1;
      paint(s, t, s * worldW, t * worldH, out);
      const i = y * w + x, j = i * 4;
      // 轉 sRGB（輸入為線性色）
      col[j] = Math.round(255 * Math.pow(clamp01(out.r), 1 / 2.2));
      col[j + 1] = Math.round(255 * Math.pow(clamp01(out.g), 1 / 2.2));
      col[j + 2] = Math.round(255 * Math.pow(clamp01(out.b), 1 / 2.2));
      col[j + 3] = 255;
      const rv = Math.round(255 * clamp01(out.rough));
      rough[j] = rv; rough[j + 1] = rv; rough[j + 2] = rv; rough[j + 3] = 255;
      height[i] = out.h;
      if (alphaData) { const av = Math.round(255 * clamp01(out.a)); alphaData[j] = av; alphaData[j + 1] = av; alphaData[j + 2] = av; alphaData[j + 3] = 255; }
    }
  }
  // 高度 → 法線（高度單位：公尺）
  const nrm = new Uint8Array(n * 4);
  const texelU = worldW / w, texelV = worldH / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hl = height[y * w + mod(x - 1, w)], hr = height[y * w + mod(x + 1, w)];
      const hd = height[mod(y - 1, h) * w + x], hu = height[mod(y + 1, h) * w + x];
      let nx = -((hr - hl) / (2 * texelU)) * normalStrength;
      let ny = -((hu - hd) / (2 * texelV)) * normalStrength;
      const len = Math.hypot(nx, ny, 1);
      const j = (y * w + x) * 4;
      nrm[j] = Math.round(127.5 + 127.5 * (nx / len));
      nrm[j + 1] = Math.round(127.5 + 127.5 * (ny / len));
      nrm[j + 2] = Math.round(127.5 + 127.5 * (1 / len));
      nrm[j + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / worldW, 1 / worldH);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.name = id;
    tex.needsUpdate = true;
    return tex;
  };
  return {
    map: mk(col, true),
    roughnessMap: mk(rough, false),
    normalMap: mk(nrm, false),
    alphaMap: alphaData ? mk(alphaData, false) : null,
  };
}

// -----------------------------------------------------------------------------
// 圖案輔助
// -----------------------------------------------------------------------------
/** 預先產生可平鋪的砌石分塊：courses 層，每層長度隨機但總和剛好 worldW */
function makeCourses(seedName, worldW, worldH, courseH, minL, maxL) {
  const seed = hashString(seedName);
  const count = Math.round(worldH / courseH);
  const rows = [];
  for (let c = 0; c < count; c++) {
    const lens = [];
    let total = 0, k = 0;
    while (total < worldW) {
      const l = mix(minL, maxL, hash2(c, k++, seed));
      lens.push(l); total += l;
    }
    const scale = worldW / total;
    const offset = hash2(c, 999, seed) * worldW;
    let acc = 0;
    rows.push(lens.map((l, i) => { const x0 = acc; acc += l * scale; return { x0, x1: acc, id: c * 97 + i }; }).map((b) => ({ ...b, x0: b.x0 + offset, x1: b.x1 + offset })));
  }
  return { rows, courseH: worldH / count, worldW, seed };
}
/** 回傳某點所在石塊：{ id, edge }（edge = 到最近接縫的距離，公尺） */
function courseAt(C, u, v) {
  const ci = Math.min(C.rows.length - 1, Math.floor(v / C.courseH));
  const vy = v - ci * C.courseH;
  const edgeV = Math.min(vy, C.courseH - vy);
  const row = C.rows[ci];
  for (const b of row) {
    for (const shift of [0, -C.worldW, -2 * C.worldW]) {
      const x0 = b.x0 + shift, x1 = b.x1 + shift;
      if (u >= x0 && u < x1) return { id: b.id, edge: Math.min(edgeV, u - x0, x1 - u) };
    }
  }
  return { id: 0, edge: edgeV };
}

// 線性色（直接用於 paint）
const LIMESTONE = [0.62, 0.55, 0.42];      // 巴黎盧泰特石灰岩（受光時呈暖米色）
const LIMESTONE_LIGHT = [0.68, 0.62, 0.50];
const MORTAR = [0.58, 0.55, 0.48];

function ashlarPainter(name, { base, worldW, worldH, courseH, minL, maxL, tint = 0.07, grime = 0.18, lichen = 0, streaks = 0.12, roughBase = 0.88 }) {
  const C = makeCourses(name, worldW, worldH, courseH, minL, maxL);
  const seed = hashString(`${name}/noise`);
  const fx = Math.round(worldW * 2), fy = Math.round(worldH * 2);
  return (s, t, u, v, o) => {
    const b = courseAt(C, u, v);
    const bt = hash2(b.id, 7, seed) - 0.5;
    const grain = fbm(s, t, fx * 4, fy * 4, seed, 4);
    const big = fbm(s, t, fx, fy, seed + 5, 3);
    const streak = fbm(s, t, fx * 3, Math.max(1, Math.round(fy / 3)), seed + 9, 3);
    let c = base.map((ch) => ch * (1 + bt * 2 * tint) * (1 - grime * big * 0.6));
    c = c.map((ch) => ch * (1 - streaks * smooth(0.55, 0.85, streak)));
    if (lichen > 0) {
      const l = smooth(0.62, 0.72, fbm(s, t, fx * 2, fy * 2, seed + 21, 4));
      c = mixRGB(c, [0.22, 0.23, 0.17], l * lichen);
    }
    const joint = smooth(0.004, 0.012, b.edge); // 0 = 灰縫，1 = 石面
    c = mixRGB(MORTAR.map((m, i) => m * (base[i] / LIMESTONE[i]) * 0.95), c, joint);
    o.r = c[0]; o.g = c[1]; o.b = c[2];
    o.h = 0.006 * smooth(0.0, 0.03, b.edge) + 0.002 * grain + 0.001 * bt;
    o.rough = roughBase + 0.08 * (grain - 0.5) + (1 - joint) * 0.05;
  };
}

function slabPainter(name, { base, worldW, worldH, slabU, slabV, stagger = 0.5, tint = 0.06, joint = 0.006 }) {
  const seed = hashString(name);
  const fx = Math.round(worldW), fy = Math.round(worldH);
  return (s, t, u, v, o) => {
    const row = Math.floor(v / slabV);
    const uu = mod(u + (row % 2) * stagger * slabU, worldW);
    const col = Math.floor(uu / slabU);
    const eu = Math.min(uu - col * slabU, (col + 1) * slabU - uu);
    const ev = Math.min(v - row * slabV, (row + 1) * slabV - v);
    const id = row * 131 + col;
    const bt = hash2(id, 3, seed) - 0.5;
    const grain = fbm(s, t, fx * 8, fy * 8, seed, 4);
    const wear = fbm(s, t, fx * 2, fy * 2, seed + 3, 3);
    let c = base.map((ch) => ch * (1 + bt * 2 * tint) * (0.92 + 0.12 * wear) * (0.97 + 0.06 * grain));
    const j = smooth(joint * 0.4, joint, Math.min(eu, ev));
    c = c.map((ch) => ch * mix(0.55, 1, j));
    o.r = c[0]; o.g = c[1]; o.b = c[2];
    o.h = 0.003 * j + 0.0008 * grain;
    o.rough = 0.8 + 0.12 * (wear - 0.5);
  };
}

function seamMetalPainter(name, { base, worldW, worldH, seamSpacing, lapSpacing, streakColor, streakAmt = 0.25 }) {
  const seed = hashString(name);
  const fx = Math.round(worldW * 2), fy = Math.round(worldH);
  return (s, t, u, v, o) => {
    const du = Math.abs(mod(u + seamSpacing / 2, seamSpacing) - seamSpacing / 2);
    const seam = 1 - smooth(0.008, 0.02, du);
    const dv = mod(v, lapSpacing);
    const lap = 1 - smooth(0.0, 0.015, dv);
    const streak = smooth(0.55, 0.8, fbm(s, t, fx * 4, Math.max(1, fy / 2), seed, 3));
    const mottle = fbm(s, t, fx * 2, fy * 2, seed + 4, 4);
    let c = base.map((ch) => ch * (0.9 + 0.2 * mottle));
    c = mixRGB(c, streakColor, streak * streakAmt);
    c = c.map((ch) => ch * (1 + 0.15 * seam));
    o.r = c[0]; o.g = c[1]; o.b = c[2];
    o.h = 0.012 * seam + 0.004 * lap;
    o.rough = 0.5 + 0.15 * (mottle - 0.5) - 0.08 * seam;
  };
}

function plankPainter(name, { base, worldW, worldH, plankW }) {
  const seed = hashString(name);
  return (s, t, u, v, o) => {
    const p = Math.floor(u / plankW);
    const e = Math.min(u - p * plankW, (p + 1) * plankW - u);
    const bt = hash2(p, 1, seed) - 0.5;
    const grain = fbm(mod(s + bt * 0.37, 1), t, Math.round(worldW / plankW) * 24, Math.max(1, Math.round(worldH)), seed + p, 3);
    let c = base.map((ch) => ch * (1 + 0.25 * bt) * (0.8 + 0.4 * grain));
    const gap = smooth(0.002, 0.006, e);
    c = c.map((ch) => ch * mix(0.3, 1, gap));
    o.r = c[0]; o.g = c[1]; o.b = c[2];
    o.h = 0.004 * gap + 0.0008 * grain;
    o.rough = 0.65 + 0.15 * grain;
  };
}

function noisePainter(name, { colA, colB, freq = 8, worldW, worldH, rough = 0.9, bump = 0.002, octaves = 5, contrast = 1 }) {
  const seed = hashString(name);
  const fx = Math.round(freq * worldW), fy = Math.round(freq * worldH);
  return (s, t, u, v, o) => {
    const n = clamp01(0.5 + (fbm(s, t, fx, fy, seed, octaves) - 0.5) * contrast);
    const c = mixRGB(colA, colB, n);
    o.r = c[0]; o.g = c[1]; o.b = c[2];
    o.h = bump * n;
    o.rough = rough + 0.06 * (n - 0.5);
  };
}

// -----------------------------------------------------------------------------
// 材質定義
// -----------------------------------------------------------------------------
const std = (tex, params) => new THREE.MeshStandardMaterial({
  map: tex.map, roughnessMap: tex.roughnessMap, normalMap: tex.normalMap,
  roughness: 1, metalness: 0, ...params,
});

const DEFS = {
  // ---------- 石材 ----------
  stoneAshlar: () => std(bake('stoneAshlar', {
    size: 1024, worldW: 4.8, worldH: 3.6, normalStrength: 1.5,
    paint: ashlarPainter('mat/stoneAshlar', { base: LIMESTONE, worldW: 4.8, worldH: 3.6, courseH: 0.45, minL: 0.5, maxL: 1.3 }),
  }), { name: 'stoneAshlar' }),

  stoneCarved: () => std(bake('stoneCarved', {
    size: 512, worldW: 2, worldH: 2, normalStrength: 1.2,
    paint: noisePainter('mat/stoneCarved', { colA: [0.60, 0.55, 0.44], colB: LIMESTONE_LIGHT, freq: 6, worldW: 2, worldH: 2, rough: 0.86, bump: 0.002 }),
  }), { name: 'stoneCarved' }),

  stoneWeathered: () => std(bake('stoneWeathered', {
    size: 1024, worldW: 4.8, worldH: 3.6, normalStrength: 1.6,
    paint: ashlarPainter('mat/stoneWeathered', { base: [0.46, 0.42, 0.34], worldW: 4.8, worldH: 3.6, courseH: 0.45, minL: 0.5, maxL: 1.3, grime: 0.3, lichen: 0.5, streaks: 0.25, roughBase: 0.92 }),
  }), { name: 'stoneWeathered' }),

  stonePaving: () => std(bake('stonePaving', {
    size: 1024, worldW: 6.4, worldH: 4.0, normalStrength: 1.2,
    paint: slabPainter('mat/stonePaving', { base: [0.56, 0.53, 0.47], worldW: 6.4, worldH: 4.0, slabU: 1.6, slabV: 0.8 }),
  }), { name: 'stonePaving' }),

  stoneTrace: () => std(bake('stoneTrace', {
    size: 512, worldW: 6.4, worldH: 4.0, normalStrength: 1.2,
    paint: slabPainter('mat/stoneTrace', { base: [0.72, 0.70, 0.64], worldW: 6.4, worldH: 4.0, slabU: 1.6, slabV: 0.8, tint: 0.03 }),
  }), { name: 'stoneTrace' }),

  stoneQuay: () => std(bake('stoneQuay', {
    size: 1024, worldW: 6.0, worldH: 4.8, normalStrength: 2,
    paint: ashlarPainter('mat/stoneQuay', { base: [0.50, 0.47, 0.40], worldW: 6.0, worldH: 4.8, courseH: 0.6, minL: 0.8, maxL: 1.6, tint: 0.1, grime: 0.3, lichen: 0.3, streaks: 0.3, roughBase: 0.93 }),
  }), { name: 'stoneQuay' }),

  // ---------- 金屬 ----------
  leadRoof: () => std(bake('leadRoof', {
    size: 512, worldW: 2.4, worldH: 4.0, normalStrength: 1.5,
    paint: seamMetalPainter('mat/leadRoof', { base: [0.40, 0.43, 0.46], worldW: 2.4, worldH: 4.0, seamSpacing: 0.6, lapSpacing: 2.0, streakColor: [0.62, 0.64, 0.64] }),
  }), { name: 'leadRoof', metalness: 0.35 }),

  copperVerdigris: () => std(bake('copperVerdigris', {
    size: 256, worldW: 1, worldH: 1, normalStrength: 0.8,
    paint: noisePainter('mat/copperVerdigris', { colA: [0.10, 0.25, 0.20], colB: [0.30, 0.55, 0.45], freq: 10, worldW: 1, worldH: 1, rough: 0.7, contrast: 1.6 }),
  }), { name: 'copperVerdigris', metalness: 0.25 }),

  bronzeDark: () => std(bake('bronzeDark', {
    size: 256, worldW: 1, worldH: 1, normalStrength: 0.6,
    paint: noisePainter('mat/bronzeDark', { colA: [0.05, 0.035, 0.02], colB: [0.12, 0.16, 0.11], freq: 8, worldW: 1, worldH: 1, rough: 0.45, contrast: 1.4 }),
  }), { name: 'bronzeDark', metalness: 0.75 }),

  bronzePolished: () => new THREE.MeshStandardMaterial({ name: 'bronzePolished', color: new THREE.Color(0.55, 0.36, 0.14), metalness: 1, roughness: 0.28 }),

  ironWrought: () => std(bake('ironWrought', {
    size: 256, worldW: 1, worldH: 1, normalStrength: 0.5,
    paint: noisePainter('mat/ironWrought', { colA: [0.015, 0.014, 0.013], colB: [0.06, 0.04, 0.03], freq: 12, worldW: 1, worldH: 1, rough: 0.65 }),
  }), { name: 'ironWrought', metalness: 0.6 }),

  ironPainted: () => new THREE.MeshStandardMaterial({ name: 'ironPainted', color: new THREE.Color(0.012, 0.022, 0.016), metalness: 0.4, roughness: 0.45 }),

  // ---------- 門、玻璃 ----------
  doorWood: () => std(bake('doorWood', {
    size: 512, worldW: 1.0, worldH: 2.0, normalStrength: 1,
    paint: plankPainter('mat/doorWood', { base: [0.10, 0.065, 0.04], worldW: 1.0, worldH: 2.0, plankW: 0.25 }),
  }), { name: 'doorWood' }),

  doorRed: () => std(bake('doorRed', {
    size: 512, worldW: 1.0, worldH: 2.0, normalStrength: 1,
    paint: plankPainter('mat/doorRed', { base: [0.30, 0.025, 0.02], worldW: 1.0, worldH: 2.0, plankW: 0.25 }),
  }), { name: 'doorRed' }),

  // 彩繪玻璃從外面看：深色、帶藍紫反光，鉛條分格
  glassStained: () => {
    const seed = hashString('mat/glassStained');
    const palette = [[0.02, 0.03, 0.10], [0.08, 0.01, 0.02], [0.02, 0.05, 0.03], [0.07, 0.05, 0.01], [0.03, 0.03, 0.05]];
    const tex = bake('glassStained', {
      size: 512, worldW: 1.2, worldH: 1.2, normalStrength: 1.5,
      paint: (s, t, u, v, o) => {
        // 菱形格（鉛條）
        const a = (u + v) / 0.3, b = (u - v) / 0.3;
        const fa = Math.abs(a - Math.round(a)), fb = Math.abs(b - Math.round(b));
        const came = 1 - smooth(0.03, 0.06, Math.min(fa, fb));
        const cell = hash2(Math.floor(a), Math.floor(b), seed);
        const c = palette[Math.floor(cell * palette.length)];
        const n = fbm(s, t, 12, 12, seed, 3);
        const g = c.map((ch) => ch * (0.7 + 0.6 * n));
        o.r = mix(g[0], 0.02, came); o.g = mix(g[1], 0.02, came); o.b = mix(g[2], 0.02, came);
        o.h = 0.003 * came;
        o.rough = mix(0.12, 0.6, came);
      },
    });
    return std(tex, { name: 'glassStained', metalness: 0.1, envMapIntensity: 1.2 });
  },

  glassLamp: () => new THREE.MeshStandardMaterial({ name: 'glassLamp', color: new THREE.Color(0.8, 0.8, 0.75), roughness: 0.3, metalness: 0, transparent: true, opacity: 0.55 }),

  // ---------- 環境 ----------
  asphalt: () => std(bake('asphalt', {
    size: 512, worldW: 4, worldH: 4, normalStrength: 1,
    paint: noisePainter('mat/asphalt', { colA: [0.03, 0.03, 0.032], colB: [0.08, 0.08, 0.08], freq: 16, worldW: 4, worldH: 4, rough: 0.92, bump: 0.002 }),
  }), { name: 'asphalt' }),

  gardenSand: () => std(bake('gardenSand', {
    size: 512, worldW: 4, worldH: 4, normalStrength: 1,
    paint: noisePainter('mat/gardenSand', { colA: [0.36, 0.29, 0.19], colB: [0.52, 0.44, 0.30], freq: 16, worldW: 4, worldH: 4, rough: 0.95, bump: 0.003 }),
  }), { name: 'gardenSand' }),

  grass: () => std(bake('grass', {
    size: 512, worldW: 4, worldH: 4, normalStrength: 1,
    paint: noisePainter('mat/grass', { colA: [0.06, 0.10, 0.03], colB: [0.20, 0.24, 0.07], freq: 20, worldW: 4, worldH: 4, rough: 0.95, bump: 0.004, contrast: 1.5 }),
  }), { name: 'grass' }),

  // 塞納河：灰綠色、低粗糙度；normalMap 的 offset 由主程式依「影格時間」推進（不可用真實時間）
  water: () => {
    const seed = hashString('mat/water');
    const tex = bake('water', {
      size: 512, worldW: 12, worldH: 12, normalStrength: 2,
      paint: (s, t, u, v, o) => {
        const n = fbm(s, t, 6, 18, seed, 5) * 0.7 + fbm(s, t, 18, 6, seed + 7, 4) * 0.3;
        o.r = 0.035; o.g = 0.055; o.b = 0.05;
        o.h = 0.03 * n;
        o.rough = 0.06;
      },
    });
    const m = std(tex, { name: 'water', metalness: 0.0, envMapIntensity: 1.0 });
    m.userData.flow = [0.05, 0.12]; // 每秒 UV 位移（公尺），沿 +x 往下游
    return m;
  },

  barkPlane: () => {
    const seed = hashString('mat/barkPlane');
    const tex = bake('barkPlane', {
      size: 512, worldW: 1.0, worldH: 2.0, normalStrength: 1.2,
      paint: (s, t, u, v, o) => {
        const a = fbm(s, t, 4, 6, seed, 4), b = fbm(s, t, 6, 8, seed + 3, 4);
        let c = [0.30, 0.28, 0.20];
        if (a > 0.55) c = [0.48, 0.46, 0.36];
        if (b > 0.58) c = [0.16, 0.15, 0.10];
        const g = fbm(s, t, 24, 32, seed + 9, 3);
        o.r = c[0] * (0.85 + 0.3 * g); o.g = c[1] * (0.85 + 0.3 * g); o.b = c[2] * (0.85 + 0.3 * g);
        o.h = 0.002 * (a > 0.55 ? 1 : 0) + 0.001 * g;
        o.rough = 0.9;
      },
    });
    return std(tex, { name: 'barkPlane' });
  },

  // 3 月新芽：一張 0.5 m 平鋪的芽團 alpha 圖，貼在樹梢的小面片上（雙面、alphaTest）
  leafBud: () => {
    const seed = hashString('mat/leafBud');
    const buds = [];
    for (let i = 0; i < 40; i++) buds.push([hash2(i, 1, seed), hash2(i, 2, seed), 0.012 + 0.02 * hash2(i, 3, seed), hash2(i, 4, seed)]);
    const tex = bake('leafBud', {
      size: 256, worldW: 0.5, worldH: 0.5, normalStrength: 0.5, alpha: true,
      paint: (s, t, u, v, o) => {
        let best = 0, tone = 0;
        for (const [bx, by, r, k] of buds) {
          let dx = Math.abs(s - bx); dx = Math.min(dx, 1 - dx);
          let dy = Math.abs(t - by); dy = Math.min(dy, 1 - dy);
          const d = Math.hypot(dx * 0.5 / r * 0.5, dy * 0.5 / (r * 1.4) * 0.5);
          const m = 1 - smooth(0.6, 1.0, d);
          if (m > best) { best = m; tone = k; }
        }
        const c = mixRGB([0.20, 0.32, 0.04], [0.42, 0.50, 0.10], tone);
        o.r = c[0]; o.g = c[1]; o.b = c[2];
        o.a = best;
        o.h = 0.002 * best;
        o.rough = 0.7;
      },
    });
    return std(tex, { name: 'leafBud', alphaMap: tex.alphaMap, alphaTest: 0.5, side: THREE.DoubleSide });
  },

  facadeHaussmann: () => std(bake('facadeHaussmann', {
    size: 512, worldW: 4, worldH: 4, normalStrength: 1,
    paint: ashlarPainter('mat/facadeHaussmann', { base: [0.66, 0.60, 0.48], worldW: 4, worldH: 4, courseH: 0.5, minL: 0.9, maxL: 1.8, tint: 0.03, grime: 0.15, streaks: 0.15 }),
  }), { name: 'facadeHaussmann' }),

  zincRoof: () => std(bake('zincRoof', {
    size: 512, worldW: 2.0, worldH: 4.0, normalStrength: 1.5,
    paint: seamMetalPainter('mat/zincRoof', { base: [0.30, 0.32, 0.35], worldW: 2.0, worldH: 4.0, seamSpacing: 0.5, lapSpacing: 2.0, streakColor: [0.2, 0.2, 0.2], streakAmt: 0.2 }),
  }), { name: 'zincRoof', metalness: 0.45 }),

  windowDark: () => new THREE.MeshStandardMaterial({ name: 'windowDark', color: new THREE.Color(0.012, 0.014, 0.018), roughness: 0.12, metalness: 0.2 }),

  // ---------- 人物與動物（底色近白，實際顏色由頂點色決定：variant(name, { vertexColors: true })）----------
  fabric: () => std(bake('fabric', {
    size: 256, worldW: 0.5, worldH: 0.5, normalStrength: 0.6,
    paint: noisePainter('mat/fabric', { colA: [0.62, 0.62, 0.62], colB: [0.80, 0.80, 0.80], freq: 40, worldW: 0.5, worldH: 0.5, rough: 0.92, bump: 0.0006, octaves: 3 }),
  }), { name: 'fabric' }),
  skin: () => new THREE.MeshStandardMaterial({ name: 'skin', color: new THREE.Color(1, 1, 1), roughness: 0.55, metalness: 0 }),
  feather: () => std(bake('feather', {
    size: 256, worldW: 0.2, worldH: 0.2, normalStrength: 0.4,
    paint: noisePainter('mat/feather', { colA: [0.66, 0.66, 0.66], colB: [0.82, 0.82, 0.82], freq: 30, worldW: 0.2, worldH: 0.2, rough: 0.75, bump: 0.0003, octaves: 3 }),
  }), { name: 'feather' }),
  fur: () => std(bake('fur', {
    size: 256, worldW: 0.3, worldH: 0.3, normalStrength: 0.8,
    paint: noisePainter('mat/fur', { colA: [0.60, 0.60, 0.60], colB: [0.85, 0.85, 0.85], freq: 60, worldW: 0.3, worldH: 0.3, rough: 0.9, bump: 0.0005, octaves: 3, contrast: 1.4 }),
  }), { name: 'fur' }),
};

export const MATERIAL_NAMES = Object.freeze(Object.keys(DEFS));

// -----------------------------------------------------------------------------
// 匯出：lazy 建立、全專案共用同一個實例
// -----------------------------------------------------------------------------
const cache = new Map();
function get(name) {
  if (!DEFS[name]) throw new Error(`materials.js 沒有材質「${name}」。可用：${MATERIAL_NAMES.join(', ')}`);
  if (!cache.has(name)) cache.set(name, DEFS[name]());
  return cache.get(name);
}

export const materials = Object.freeze(
  Object.defineProperties({}, Object.fromEntries(MATERIAL_NAMES.map((n) => [n, { get: () => get(n), enumerable: true }]))),
);

const variants = new Map();
/**
 * 共用變體：只允許 vertexColors / side / alphaTest / flatShading。
 * 同樣參數回傳同一個實例。
 */
export function variant(name, opts = {}) {
  const allowed = ['vertexColors', 'side', 'alphaTest', 'flatShading'];
  for (const k of Object.keys(opts)) if (!allowed.includes(k)) throw new Error(`variant() 不允許參數 ${k}`);
  const key = `${name}|${allowed.map((k) => opts[k]).join('|')}`;
  if (!variants.has(key)) {
    const m = get(name).clone(); // clone 共用同一組貼圖
    Object.assign(m, opts);
    m.name = `${name}*`;
    variants.set(key, m);
  }
  return variants.get(key);
}

export default materials;
