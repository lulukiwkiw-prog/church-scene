// src/sculpture/sdfgargoyle.js — 滴水獸（SDF 雕刻）
// 嵌在牆裡的石塊伸出身體：背上有排水槽、拱起的脊椎與肋骨、前腳抓著、後腳蹲在石塊上、
// 折起的翅膀，頭往前下方探出、大張著嘴吐水。局部座標：根部在原點、+Z 為伸出方向、
// 長度約 1（呼叫者以 length 縮放）、+Y 為上。每種造型只建一次，60 隻共用（InstancedMesh）。
import * as THREE from 'three';
import { cone, ball, ell, smin, smax, noise3, bakeMesh } from './sdf.js';
import { HEADS } from './sdfbeast.js';

const { abs, sin, cos, max, min, sqrt } = Math;
const hyp = (a, b, c = 0) => sqrt(a * a + b * b + c * c);
const H_BODY = 0.022, H_HEAD = 0.0145;

// 圓角方塊
function box(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = abs(x - cx) - hx + r, qy = abs(y - cy) - hy + r, qz = abs(z - cz) - hz + r;
  return hyp(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r;
}

export const HEAD_AT = [0, 0.03, 0.8], PITCH = -0.3, HEAD_K = 1.5; // 頭的中心、往下俯的角度（負 = 低頭）與放大倍率（滴水獸的頭很大）

function bodyField(x, y, z) {
  const ax = abs(x);
  // 根部石塊（嵌在牆內）與身體
  let d = box(x, y, z, 0, 0, 0.12, 0.125, 0.085, 0.27, 0.02);
  d = smin(d, cone(ax, y, z, 0, 0.03, 0.12, 0, 0.04, 0.46, 0.098, 0.092), 0.04);
  d = smin(d, cone(ax, y, z, 0, 0.04, 0.46, 0, 0.045, 0.66, 0.092, 0.07), 0.04);
  // 背上的排水槽
  d = smax(d, -box(x, y, z, 0, 0.105, 0.42, 0.017, 0.016, 0.3, 0.008), 0.006);
  // 拱起的脊椎骨節與肋骨
  for (let k = 0; k < 7; k++) d = smin(d, ball(ax, y, z, 0.026, 0.1, 0.14 + k * 0.07, 0.014), 0.012);
  d -= 0.004 * max(0, sin(z * 85)) * max(0, min(ax / 0.07, 1)) * (y > 0.0 ? 0.4 : 1);
  // 後腿（蹲在石塊上）
  d = smin(d, ell(ax, y, z, 0.105, 0.005, 0.22, 0.062, 0.075, 0.095), 0.03);
  d = smin(d, cone(ax, y, z, 0.108, -0.04, 0.24, 0.105, -0.082, 0.35, 0.036, 0.028), 0.02);
  for (let k = -1; k <= 1; k++) d = smin(d, cone(ax, y, z, 0.105 + k * 0.022, -0.08, 0.35, 0.105 + k * 0.026, -0.088, 0.41, 0.016, 0.004), 0.006);
  // 前腳（抓著向前下伸）
  d = smin(d, cone(ax, y, z, 0.09, 0.0, 0.5, 0.1, -0.095, 0.6, 0.048, 0.036), 0.025);
  d = smin(d, ball(ax, y, z, 0.1, -0.09, 0.6, 0.034), 0.02);
  for (let k = -1; k <= 1; k++) {
    d = smin(d, cone(ax, y, z, 0.1 + k * 0.022, -0.115, 0.625, 0.1 + k * 0.028, -0.17, 0.665, 0.0145, 0.009), 0.008);
    d = smin(d, cone(ax, y, z, 0.1 + k * 0.028, -0.17, 0.665, 0.1 + k * 0.03, -0.205, 0.68, 0.009, 0.002), 0.004);
  }
  // 折起的翅膀：貼在身側的長片，帶羽紋
  const wy = y - 0.06, wz = z - 0.29;
  let w = ell(ax, wy, wz, 0.098, 0.0, 0.0, 0.016, 0.092, 0.19);
  w -= 0.0045 * max(0, sin((wz) * 55 + wy * 20)) * (wz > -0.12 ? 1 : 0);
  d = smin(d, w, 0.02);
  return (abs(d) < 0.04 ? d + 0.0012 * (noise3(x * 110, y * 110, z * 110) - 0.5) : d);
}

function headField(x, y, z, kind) {
  let head = HEADS[kind](x, y, z);
  head = smax(head, -ell(abs(x), y, z, 0, -0.05, 0.13, 0.03, 0.014, 0.055), 0.008);   // 張開的嘴（出水口）
  return head + 0.0008 * (noise3(x * 150, y * 150, z * 150) - 0.5);
}

const cache = new Map();
/** 回傳 { body, head }（兩個快取網格）。head 在「頭的局部座標」，用 headMatrix() 放到身體上 */
export function sdfGargoyle(kind) {
  if (!cache.has(kind)) {
    cache.set(kind, {
      body: bakeMesh(bodyField, [-0.2, -0.26, -0.16, 0.2, 0.3, 0.78], H_BODY, { aoDist: 0.04, minTris: 150, smooth: 1, block: 4 }),
      head: bakeMesh((x, y, z) => headField(x, y, z, kind), [-0.25, -0.2, -0.26, 0.25, 0.26, 0.3], H_HEAD, { aoDist: 0.02, minTris: 100, smooth: 1, block: 4 }),
    });
  }
  return cache.get(kind);
}

/** 頭的局部座標 → 滴水獸座標：先放大、再繞 X 軸低頭、最後平移 */
export function headMatrix() {
  return new THREE.Matrix4().makeTranslation(...HEAD_AT).multiply(new THREE.Matrix4().makeRotationX(-PITCH)).multiply(new THREE.Matrix4().makeScale(HEAD_K, HEAD_K, HEAD_K));
}
