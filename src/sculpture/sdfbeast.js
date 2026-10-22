// src/sculpture/sdfbeast.js — 怪獸與福音書象徵獸（SDF 雕刻）
// 共用沉思者的身體（蹲坐的軀幹、後腿、骨感肩胛與肋骨、有爪的腳、翅膀），
// 換上不同的頭（獅、羊、鷹、狼、牛）、翅膀（蝙蝠翼 / 羽翼）和前臂擱在石欄上的姿勢。
// 局部座標同 stryge.js：+Z = 面向、+Y = 上、腳底 y = 0，高度約 1。每種組合只建一次並快取。
import * as THREE from 'three';
import { cone, ball, ell, smin, smax, noise3, sstep, bakeMesh } from './sdf.js';
import { torso, leg, wing, WING, weather } from './stryge.js';
import { addMesh } from './sdfhuman.js';

const { abs, sin, max, sqrt } = Math;
const hyp = (a, b, c = 0) => sqrt(a * a + b * b + c * c);
const SC = 0.87, H = 0.0155;
const C = [0, 0.77, 0.32];             // 頭部中心（與沉思者相同）

// ---- 前臂擱在石欄上、手垂在前面（沉思者是托腮）----
function armRest(x, y, z, s) {
  const ax = x * s;
  let d = cone(ax, y, z, 0.19, 0.60, 0.04, 0.155, 0.35, 0.13, 0.062, 0.05);                 // 上臂
  d = smin(d, cone(ax, y, z, 0.155, 0.35, 0.13, 0.13, 0.12, 0.30, 0.052, 0.036), 0.03);        // 前臂（平放向前）
  d = smin(d, ball(ax, y, z, 0.16, 0.36, 0.13, 0.05), 0.03);                                 // 肘
  d = smin(d, ell(ax, y, z, 0.128, 0.105, 0.335, 0.038, 0.032, 0.05), 0.02);                  // 掌
  for (let k = -1; k <= 1; k++) {                                                            // 三根帶爪的指
    const fx = 0.128 + k * 0.026;
    d = smin(d, cone(ax, y, z, fx, 0.105, 0.345, fx + k * 0.006, 0.08, 0.405, 0.0145, 0.01), 0.01);
    d = smin(d, cone(ax, y, z, fx + k * 0.006, 0.08, 0.405, fx + k * 0.009, 0.062, 0.44, 0.01, 0.002), 0.006);
  }
  return d;
}

// ---- 各種頭（頭部局部座標，中心在原點）----
function eyes(d, ax, y, z, r, ex, ey, ez) {
  d = smax(d, -ball(ax, y, z, ex, ey, ez, r), r * 0.5);
  return smin(d, ball(ax, y, z, ex, ey, ez - r * 0.35, r * 0.74), 0.004);
}
function headLion(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, 0, 0, 0, 0.115, 0.11, 0.12);
  d = smin(d, ell(ax, y, z, 0, -0.05, 0.12, 0.072, 0.052, 0.082), 0.03);                      // 口鼻
  d = smin(d, ball(ax, y, z, 0, -0.012, 0.19, 0.03), 0.015);                                  // 鼻頭
  d = smin(d, cone(ax, y, z, 0, 0.05, 0.085, 0.1, 0.045, 0.07, 0.03, 0.026), 0.02);           // 眉骨
  d = eyes(d, ax, y, z, 0.021, 0.056, 0.03, 0.095);
  d = smin(d, ell(ax, y, z, 0, -0.09, 0.1, 0.055, 0.03, 0.07), 0.02);                         // 下顎
  d = smax(d, -ell(ax, y, z, 0, -0.07, 0.15, 0.052, 0.011, 0.06), 0.008);                     // 張嘴
  for (const k of [-1, 1]) d = smin(d, cone(ax, y, z, 0.034 * k, -0.062, 0.155, 0.034 * k, -0.098, 0.162, 0.009, 0.001), 0.003); // 獠牙
  d = smin(d, ball(ax, y, z, 0.095, 0.095, -0.03, 0.03), 0.01);                               // 圓耳
  // 鬃毛：頭後一圈厚厚的波浪
  const mane = ell(x, y, z, 0, -0.03, -0.06, 0.185, 0.2, 0.1) - 0.007 * max(0, sin(Math.atan2(y + 0.03, x) * 11 + z * 25));
  return smin(d, smax(mane, -ell(x, y, z, 0, -0.01, 0.07, 0.1, 0.1, 0.08), 0.02), 0.02);
}
function headGoat(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, 0, 0, 0, 0.085, 0.1, 0.1);
  d = smin(d, cone(ax, y, z, 0, -0.02, 0.06, 0, -0.065, 0.2, 0.055, 0.034), 0.03);            // 長吻
  d = smin(d, ball(ax, y, z, 0, -0.07, 0.205, 0.034), 0.015);
  d = eyes(d, ax, y, z, 0.017, 0.062, 0.035, 0.07);
  d = smin(d, cone(ax, y, z, 0.05, 0.085, -0.02, 0.09, 0.19, -0.1, 0.034, 0.026), 0.015);     // 大彎角
  d = smin(d, cone(ax, y, z, 0.09, 0.19, -0.1, 0.075, 0.2, -0.22, 0.026, 0.012), 0.012);
  d -= 0.0035 * max(0, sin(y * 90)) * sstep(0.1, 0.19, y) * sstep(0.02, 0.07, ax);               // 角的環紋
  d = smin(d, cone(ax, y, z, 0.085, 0.03, -0.02, 0.18, 0.045, -0.045, 0.02, 0.008), 0.01);     // 橫向的耳
  d = smin(d, cone(ax, y, z, 0, -0.09, 0.14, 0, -0.18, 0.125, 0.02, 0.005), 0.01);            // 山羊鬍
  return smax(d, -ell(ax, y, z, 0, -0.085, 0.17, 0.02, 0.006, 0.05), 0.004);
}
function headEagle(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, 0, 0, 0, 0.09, 0.09, 0.1);
  d = smin(d, cone(ax, y, z, 0, 0.005, 0.07, 0, -0.012, 0.19, 0.056, 0.03), 0.02);            // 上喙
  d = smin(d, cone(ax, y, z, 0, -0.012, 0.19, 0, -0.075, 0.232, 0.03, 0.007), 0.01);          // 鉤
  d = smin(d, cone(ax, y, z, 0, -0.04, 0.09, 0, -0.045, 0.185, 0.032, 0.013), 0.012);         // 下喙
  d = smin(d, cone(ax, y, z, 0, 0.055, 0.05, 0.09, 0.05, 0.035, 0.03, 0.024), 0.015);         // 厚眉
  d = eyes(d, ax, y, z, 0.018, 0.058, 0.025, 0.06);
  for (let k = 0; k < 4; k++) d = smin(d, cone(x, y, z, 0, 0.07, -0.03 - k * 0.02, 0, 0.155 - k * 0.012, -0.075 - k * 0.04, 0.016, 0.004), 0.008); // 冠羽
  d -= 0.0025 * max(0, sin(y * 110 + abs(x) * 40)) * sstep(0.02, -0.05, z - 0.0);                // 羽紋
  return d;
}
function headDog(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, 0, 0, 0, 0.09, 0.095, 0.1);
  d = smin(d, cone(ax, y, z, 0, -0.03, 0.07, 0, -0.045, 0.215, 0.056, 0.032), 0.03);          // 狼吻
  d = smin(d, ball(ax, y, z, 0, -0.035, 0.225, 0.026), 0.012);
  d = smin(d, cone(ax, y, z, 0.03, 0.05, 0.075, 0.09, 0.052, 0.06, 0.026, 0.022), 0.015);
  d = eyes(d, ax, y, z, 0.017, 0.056, 0.03, 0.075);
  d = smin(d, ell(ax, y, z, 0, -0.085, 0.12, 0.045, 0.026, 0.085), 0.02);                     // 下顎
  d = smax(d, -ell(ax, y, z, 0, -0.065, 0.17, 0.048, 0.009, 0.07), 0.007);                    // 咆哮的嘴
  for (const k of [-1, 1]) for (const zz of [0.17, 0.2]) d = smin(d, cone(ax, y, z, 0.03 * k, -0.06, zz, 0.03 * k, -0.095, zz + 0.004, 0.007, 0.001), 0.002);
  d = smin(d, cone(ax, y, z, 0.06, 0.07, -0.03, 0.075, 0.2, -0.05, 0.04, 0.008), 0.012);      // 尖耳
  return d;
}
function headOx(x, y, z) {
  const ax = abs(x);
  let d = ell(x, y, z, 0, 0, 0, 0.1, 0.105, 0.11);
  d = smin(d, ell(ax, y, z, 0, -0.055, 0.125, 0.078, 0.06, 0.07), 0.03);                      // 寬口鼻
  for (const k of [-1, 1]) d = smax(d, -ball(ax, y, z, 0.03 * k, -0.045, 0.19, 0.011), 0.005);  // 鼻孔
  d = eyes(d, ax, y, z, 0.02, 0.074, 0.035, 0.075);
  d = smin(d, cone(ax, y, z, 0.07, 0.085, 0.0, 0.17, 0.1, 0.02, 0.03, 0.026), 0.015);         // 角：先向外
  d = smin(d, cone(ax, y, z, 0.17, 0.1, 0.02, 0.19, 0.21, 0.1, 0.026, 0.009), 0.015);         // 再向前上彎
  d = smin(d, cone(ax, y, z, 0.1, 0.03, -0.03, 0.2, 0.012, -0.045, 0.026, 0.01), 0.012);      // 耳
  return d - 0.0018 * (noise3(x * 120, y * 120, z * 120) - 0.5) * 2;
}
export const HEADS = { lion: headLion, goat: headGoat, eagle: headEagle, dog: headDog, ox: headOx };

function creatureField(x, y, z, P) {
  const G = (cx, cy, cz, R, fn) => { const lb = hyp(x - cx, y - cy, z - cz) - R; return lb > 0.12 ? lb : fn(); };
  let d = G(0, 0.42, -0.05, 0.45, () => torso(x, y, z));
  d = smin(d, G(-0.16, 0.14, 0.1, 0.3, () => leg(x, y, z, -1)), 0.035);
  d = smin(d, G(0.16, 0.14, 0.1, 0.3, () => leg(x, y, z, 1)), 0.035);
  d = smin(d, G(-0.13, 0.3, 0.25, 0.4, () => armRest(x, y, z, -1)), 0.03);
  d = smin(d, G(0.13, 0.3, 0.25, 0.4, () => armRest(x, y, z, 1)), 0.03);
  // 尾巴：從臀部繞到身側
  d = smin(d, G(0.1, 0.1, -0.3, 0.3, () => smin(cone(x, y, z, 0, 0.2, -0.3, 0.14, 0.06, -0.42, 0.045, 0.03), cone(x, y, z, 0.14, 0.06, -0.42, 0.26, 0.035, -0.2, 0.03, 0.012), 0.02)), 0.02);
  const head = HEADS[P.kind];
  d = smin(d, G(C[0], C[1], C[2], 0.36, () => head(x - C[0], y - C[1], z - C[2])), 0.025);
  if (P.wings) for (const s of [-1, 1]) {
    const { O, U } = WING[s];
    d = smin(d, G(O[0] + U[0] * 0.29, O[1] + U[1] * 0.29, O[2] + U[2] * 0.29, 0.45, () => wing(x, y, z, s, P.wings === 'bat')), 0.03);
  }
  return abs(d) < 0.05 ? d + weather(x, y, z) : d;
}

const cache = new Map();
/** kind: 'lion' | 'goat' | 'eagle' | 'dog' | 'ox'；wings: 'bat' | 'feather' | null */
export function sdfCreature(M, kind, wings) {
  const key = `${kind}|${wings}`;
  if (!cache.has(key)) {
    const P = { kind, wings };
    cache.set(key, bakeMesh((x, y, z) => creatureField(x, y, z, P), [-0.40, -0.02, -0.46, 0.40, 1.14, 0.54], H, { aoDist: 0.045, minTris: 300, smooth: 2, block: 4 }));
  }
  const m = cache.get(key);
  M.push(new THREE.Matrix4().makeScale(SC, SC, SC));
  const n = addMesh(M, m);
  M.pop();
  return n;
}
