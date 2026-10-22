// src/sculpture/stryge.js — 沉思者 Le Stryge（SDF 雕刻）
// 照片中的特徵：厚重的眉骨與深陷的眼窩、鉤狀鼻、突出的下巴與外伸的舌、尖耳、短粗有稜的角、
// 一手托腮、骨感的肩胛與肋骨、蹲坐的後腿與抓住石緣的趾爪、背後大而圓的羽翼（扇形肋紋、鋸齒邊）。
// 局部座標：+Z = 面向、+Y = 上、腳底在 y = 0；高度約 1。
// 做法：把各部位當成圓滑融合的實心塊（有向距離場），疊上風化起伏，再用 Surface Nets 轉成網格；
// 頂點色是從場算出來的環境遮蔽（凹處較暗）。全部確定性。
import { cone, ball, ell, smin, smax, noise3, sstep, clamp, surfaceNets, dropFragments, smoothMesh, vertexNormals } from './sdf.js';

const { abs, sin, cos, atan2, sqrt, max, min } = Math;
const hypot = (a, b, c = 0) => sqrt(a * a + b * b + c * c); // Math.hypot 太慢
const SC = 0.87;           // 模型座標 → 輸出座標的縮放（讓整體高度約 1）
const H = 0.0105;          // 取樣間距（模型座標）
const C = [0, 0.77, 0.32]; // 頭部中心

// ---- 翅膀座標系（每側一個）----
function wingFrame(s) {
  const O = [s * 0.11, 0.56, -0.15];
  let U = [s * 0.30, 0.93, -0.20]; const ul = hypot(...U); U = U.map((v) => v / ul);
  // V：朝後（-z），與 U 正交
  let V0 = [0, 0, -1]; const d = V0[0] * U[0] + V0[1] * U[1] + V0[2] * U[2]; V0 = V0.map((v, i) => v - d * U[i]); const vl = hypot(...V0); V0 = V0.map((v) => v / vl);
  // 後緣向外張開
  let out = [s, 0, 0]; const o1 = out[0] * U[0] + out[1] * U[1] + out[2] * U[2]; out = out.map((v, i) => v - o1 * U[i]);
  const o2 = out[0] * V0[0] + out[1] * V0[1] + out[2] * V0[2]; out = out.map((v, i) => v - o2 * V0[i]); const ol = hypot(...out); out = out.map((v) => v / ol);
  let V = V0.map((v, i) => v + 0.36 * out[i]); const vl2 = hypot(...V); V = V.map((v) => v / vl2);
  const N = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
  return { O, U, V, N };
}
export const WING = { '-1': wingFrame(-1), 1: wingFrame(1) };

export function wing(x, y, z, s, bat = false) {
  const { O, U, V, N } = WING[s];
  const px = x - O[0], py = y - O[1], pz = z - O[2];
  const u = px * U[0] + py * U[1] + pz * U[2], v = px * V[0] + py * V[1] + pz * V[2], t = px * N[0] + py * N[1] + pz * N[2];
  // 平面輪廓：蛋形，前緣（v<0）筆直、後緣（v>0）鋸齒
  const q = (u - 0.29) / 0.31;
  const wf = q * q < 1 ? sqrt(1 - q * q) : 0;
  const w = 0.15 * wf * (1 - 0.2 * q);
  const dv = v - 0.02;
  const scal = dv > 0 ? (bat ? 1 - 0.34 * Math.pow(abs(sin(u * 11)), 0.7) : 1 + 0.075 * sin(u * 38)) : 1;
  const d2 = max(abs(dv) - w * scal, abs(u - 0.29) - 0.31);
  const th = bat ? 0.016 : 0.036 - 0.014 * sstep(0, 0.14, dv);
  let d = smax(d2, abs(t) - th, 0.016);
  // 扇形肋紋與羽列
  const ang = atan2(v + 0.05, u + 0.04), r = hypot(u + 0.10, v);
  if (!bat) {
    d -= 0.0055 * max(0, sin(ang * 19 + 0.6)) * sstep(0.06, 0.16, u);
    d -= 0.0040 * max(0, sin(r * 58)) * sstep(0.12, 0.25, u) * sstep(0.0, 0.05, dv + 0.10);
  }
  // 前緣的粗骨
  const bx = (a, b) => [O[0] + U[0] * a + V[0] * b, O[1] + U[1] * a + V[1] * b, O[2] + U[2] * a + V[2] * b];
  const b0 = bx(0.03, -0.07), b1 = bx(0.56, -0.03);
  d = smin(d, cone(x, y, z, b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 0.034, 0.014), 0.03);
  if (bat) { // 蝙蝠翼的指骨：從腕部呈扇形散開
    const w0 = bx(0.5, -0.03);
    for (const [a, b] of [[0.16, 0.2], [0.28, 0.27], [0.42, 0.25]]) {
      const t = bx(a, b);
      d = smin(d, cone(x, y, z, w0[0], w0[1], w0[2], t[0], t[1], t[2], 0.013, 0.006), 0.012);
    }
  }
  return d;
}

// ---- 頭 ----
function head(x, y, z) {
  const [cx, cy, cz] = C;
  const ax = abs(x);
  let d = ell(x, y, z, cx, cy, cz, 0.115, 0.12, 0.125);
  // 臉部（眉骨、顴骨、鼻、口鼻、下顎、眼窩、嘴、舌）：離臉太遠就不算
  if (hypot(ax, y - (cy - 0.04), z - (cz + 0.1)) < 0.21) {
    d = smin(d, cone(ax, y, z, 0, cy + 0.05, cz + 0.095, 0.105, cy + 0.045, cz + 0.082, 0.028, 0.026), 0.03);   // 眉骨
    d = smin(d, ball(ax, y, z, 0.088, cy - 0.04, cz + 0.085, 0.034), 0.03);                                   // 顴骨
    d = smin(d, cone(ax, y, z, 0, cy - 0.005, cz + 0.118, 0, cy - 0.048, cz + 0.168, 0.025, 0.019), 0.02);   // 鉤鼻
    d = smin(d, ball(ax, y, z, 0.018, cy - 0.055, cz + 0.152, 0.015), 0.01);                                  // 鼻翼
    d = smin(d, ell(ax, y, z, 0, cy - 0.078, cz + 0.118, 0.056, 0.036, 0.05), 0.02);                          // 上唇與口鼻部
    d = smin(d, ell(ax, y, z, 0, cy - 0.108, cz + 0.08, 0.088, 0.068, 0.098), 0.03);                          // 下顎
    d = smin(d, ball(ax, y, z, 0, cy - 0.14, cz + 0.148, 0.032), 0.02);                                       // 下巴
    d = smax(d, -ball(ax, y, z, 0.052, cy + 0.012, cz + 0.12, 0.029), 0.012);                                 // 眼窩
    d = smin(d, ball(ax, y, z, 0.05, cy + 0.008, cz + 0.104, 0.021), 0.006);                                  // 眼球
    d = smax(d, -ball(ax, y, z, 0.011, cy - 0.063, cz + 0.166, 0.008), 0.006);                                // 鼻孔
    d = smax(d, -ell(ax, y, z, 0, cy - 0.103, cz + 0.155, 0.062, 0.013, 0.05), 0.008);                        // 嘴裂
    d = smin(d, cone(ax, y, z, 0, cy - 0.106, cz + 0.115, 0, cy - 0.15, cz + 0.205, 0.017, 0.013), 0.012);    // 舌
    const fz = sstep(0.04, 0.12, z - cz) * sstep(0.2, 0.06, abs(y - (cy + 0.075)));
    d -= 0.0035 * max(0, sin((y - cy) * 150)) * fz;                                                           // 額頭皺紋
  }
  // 耳
  if (hypot(ax - 0.13, y - cy, z - (cz - 0.05)) < 0.14) d = smin(d, cone(ax, y, z, 0.118, cy - 0.03, cz - 0.03, 0.14, cy + 0.075, cz - 0.075, 0.022, 0.007), 0.016);
  // 角：粗短、向後彎，表面有一圈圈稜
  if (hypot(ax - 0.075, y - (cy + 0.16), z - (cz - 0.07)) < 0.17) {
    const h1 = cone(ax, y, z, 0.062, cy + 0.095, cz - 0.015, 0.08, cy + 0.195, cz - 0.075, 0.04, 0.026);
    const h2 = cone(ax, y, z, 0.08, cy + 0.195, cz - 0.075, 0.085, cy + 0.255, cz - 0.14, 0.026, 0.012);
    let horn = smin(h1, h2, 0.015);
    horn -= 0.0045 * max(0, sin((y - cy) * 95));
    d = smin(d, horn, 0.03);
  }
  return d;
}

// ---- 手與手指 ----
function handCheek(x, y, z) { // 托在臉頰上的右手：手掌貼頰、四指沿頰向上
  const ax = x;
  let d = ell(ax, y, z, 0.125, 0.665, 0.305, 0.02, 0.046, 0.05);
  for (let i = 0; i < 4; i++) {
    const zz = 0.268 + i * 0.03, tip = 0.80 - 0.012 * abs(i - 1.5);
    d = smin(d, cone(ax, y, z, 0.126, 0.70, zz, 0.115, tip, zz + 0.006, 0.0125, 0.0095), 0.01);
  }
  d = smin(d, cone(ax, y, z, 0.126, 0.645, 0.352, 0.104, 0.642, 0.402, 0.016, 0.012), 0.012); // 拇指
  return d;
}
function handChin(x, y, z) { // 托住下巴的左手
  let d = ell(x, y, z, -0.04, 0.602, 0.385, 0.046, 0.019, 0.042);
  for (let i = 0; i < 4; i++) {
    const xx = -0.075 + i * 0.026;
    d = smin(d, cone(x, y, z, xx, 0.606, 0.41, xx - 0.004, 0.598, 0.468 - 0.004 * abs(i - 1.5), 0.0125, 0.0095), 0.01);
  }
  d = smin(d, cone(x, y, z, -0.0, 0.612, 0.362, 0.014, 0.628, 0.412, 0.015, 0.011), 0.012);
  return d;
}

// ---- 軀幹、腿、手臂 ----
export function torso(x, y, z) {
  const xs = x * 0.88; // 胸比較寬
  let d = cone(xs, y, z, 0, 0.25, -0.20, 0, 0.42, -0.15, 0.14, 0.175);
  d = smin(d, cone(xs, y, z, 0, 0.42, -0.15, 0, 0.55, -0.04, 0.175, 0.185), 0.05);
  d = smin(d, cone(xs, y, z, 0, 0.55, -0.04, 0, 0.63, 0.08, 0.185, 0.14), 0.05);
  d *= 0.9;
  d = smin(d, ell(x, y, z, 0, 0.19, -0.19, 0.2, 0.145, 0.175), 0.05);                    // 骨盆
  d = smin(d, cone(x, y, z, 0, 0.63, 0.08, 0, 0.70, 0.21, 0.14, 0.078), 0.04);              // 頸
  const ax = abs(x);
  d = smin(d, ball(ax, y, z, 0.19, 0.615, 0.03, 0.085), 0.04);                              // 肩
  d = smin(d, ell(ax, y, z, 0.13, 0.57, -0.10, 0.09, 0.11, 0.06), 0.04);                    // 肩胛
  d = smin(d, cone(ax, y, z, 0, 0.665, 0.10, 0.19, 0.625, 0.03, 0.06, 0.06), 0.04);          // 斜方肌
  // 脊椎骨節
  const sp = [[0.30, -0.345], [0.37, -0.33], [0.44, -0.30], [0.51, -0.23], [0.57, -0.14], [0.62, -0.05]];
  for (const [yy, zz] of sp) d = smin(d, ball(ax, y, z, 0, yy, zz, 0.021), 0.02);
  // 肋骨
  const rib = max(0, sin(y * 72 + 1)) * sstep(0.04, 0.12, ax) * sstep(0.34, 0.42, y) * sstep(0.62, 0.54, y);
  d -= 0.0065 * rib;
  return d;
}
export function leg(x, y, z, s) {
  const ax = x * s; // 單側
  let d = cone(ax, y, z, 0.135, 0.20, -0.19, 0.20, 0.31, 0.08, 0.10, 0.07);                  // 大腿
  d = smin(d, cone(ax, y, z, 0.20, 0.31, 0.08, 0.15, 0.055, 0.21, 0.06, 0.032), 0.03);       // 小腿
  d = smin(d, ball(ax, y, z, 0.185, 0.22, 0.14, 0.045), 0.03);                              // 腓腸肌
  d = smin(d, ball(ax, y, z, 0.155, 0.05, 0.185, 0.04), 0.02);                              // 腳跟
  d = smin(d, cone(ax, y, z, 0.15, 0.055, 0.21, 0.14, 0.035, 0.275, 0.032, 0.028), 0.02);   // 腳背
  for (let k = -1; k <= 1; k++) {
    const bx = 0.14 + k * 0.032, tx = 0.14 + k * 0.04;
    d = smin(d, cone(ax, y, z, bx, 0.038, 0.275, tx, 0.022, 0.345, 0.02, 0.014), 0.012);    // 趾
    d = smin(d, cone(ax, y, z, tx, 0.022, 0.345, tx, 0.012, 0.395, 0.012, 0.003), 0.006);   // 爪
  }
  return d;
}
function arm(x, y, z, s) {
  const ax = x * s;
  const W = s > 0 ? [0.105, 0.595, 0.29] : [0.07, 0.56, 0.34]; // 右手托腮、左手托下巴（ax 已乘 s，左手也用正值）
  let d = cone(ax, y, z, 0.19, 0.60, 0.04, 0.155, 0.355, 0.14, 0.062, 0.05);                  // 上臂
  d = smin(d, cone(ax, y, z, 0.155, 0.355, 0.14, W[0], W[1], W[2], 0.052, 0.034), 0.03);       // 前臂
  d = smin(d, ball(ax, y, z, 0.16, 0.36, 0.14, 0.05), 0.03);                                   // 肘
  const m = [0.155 + (W[0] - 0.155) * 0.3, 0.355 + (W[1] - 0.355) * 0.3, 0.14 + (W[2] - 0.14) * 0.3];
  d = smin(d, ball(ax, y, z, m[0], m[1], m[2], 0.05), 0.04);                                   // 前臂肌肉
  return d;
}

// ---- 風化起伏（細顆粒 + 大坑洞）----
export function weather(x, y, z) {
  return 0.0035 * (noise3(x * 34, y * 34, z * 34) - 0.5) * 2 + 0.008 * (noise3(x * 11 + 5, y * 11, z * 11) - 0.5) * 2;
}

/** 整個場：回傳到雕像表面的（近似）距離，內部為負 */
export function strygeField(x, y, z) {
  const G = (cx, cy, cz, R, fn) => { const lb = hypot(x - cx, y - cy, z - cz) - R; return lb > 0.12 ? lb : fn(); };
  let d = G(0, 0.42, -0.05, 0.45, () => torso(x, y, z));
  d = smin(d, G(-0.16, 0.14, 0.1, 0.3, () => leg(x, y, z, -1)), 0.035);
  d = smin(d, G(0.16, 0.14, 0.1, 0.3, () => leg(x, y, z, 1)), 0.035);
  d = smin(d, G(-0.12, 0.45, 0.2, 0.34, () => arm(x, y, z, -1)), 0.03);
  d = smin(d, G(0.12, 0.45, 0.2, 0.34, () => arm(x, y, z, 1)), 0.03);
  d = smin(d, G(0.125, 0.70, 0.32, 0.14, () => handCheek(x, y, z)), 0.012);
  d = smin(d, G(-0.04, 0.60, 0.40, 0.12, () => handChin(x, y, z)), 0.012);
  d = smin(d, G(0, 0.8, 0.28, 0.32, () => head(x, y, z)), 0.025);
  for (const s of [-1, 1]) {
    const { O, U } = WING[s];
    d = smin(d, G(O[0] + U[0] * 0.29, O[1] + U[1] * 0.29, O[2] + U[2] * 0.29, 0.45, () => wing(x, y, z, s)), 0.03);
  }
  return Math.abs(d) < 0.05 ? d + weather(x, y, z) : d;
}

let CACHE = null;

/** 把沉思者網格加進 Mesher M（目前座標系），回傳 { vertices, triangles } */
export function stryge(M) {
  if (!CACHE) {
    const x0 = -0.40, y0 = -0.02, z0 = -0.46;
    const nx = Math.ceil(0.80 / H), ny = Math.ceil(1.16 / H), nz = Math.ceil(1.00 / H);
    const raw = surfaceNets(strygeField, x0, y0, z0, H, nx, ny, nz, 4);
    const idx = dropFragments(raw.pos, raw.idx, 300);
    const pos = raw.pos;
    smoothMesh(pos, idx, 2);
    const nrm = vertexNormals(pos, idx);
    const n = pos.length / 3, col = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], nxn = nrm[3 * i], nyn = nrm[3 * i + 1], nzn = nrm[3 * i + 2];
      const open = clamp(strygeField(x + nxn * 0.045, y + nyn * 0.045, z + nzn * 0.045) / 0.045);   // 1 = 開闊、0 = 凹縫
      let c = 0.55 + 0.45 * Math.pow(open, 0.7);
      c *= 0.9 + 0.1 * (nyn * 0.5 + 0.5);                                         // 朝上的面稍亮
      c *= 0.92 + 0.08 * noise3(x * 5, y * 18, z * 5);                            // 雨水流過的直紋
      col[i] = clamp(c, 0.3, 1);
    }
    CACHE = { pos, idx, col };
  }
  const { pos, idx, col } = CACHE;
  const base = M.count;
  for (let i = 0; i < col.length; i++) M.v(pos[3 * i] * SC, pos[3 * i + 1] * SC, pos[3 * i + 2] * SC, col[i]);
  for (let i = 0; i < idx.length; i += 3) M.t(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
  return { vertices: col.length, triangles: idx.length / 3 };
}
void min;
