// src/facades/flanks.js — 側面與後殿：高窗、禮拜堂窗、樓廊圓窗的窗花與玻璃；禮拜堂山花；
// 高牆簷口欄杆與托檐；袖廊立面（門、透光尖窗帶、玫瑰窗、山牆圓窗、山牆壓頂）；紅門。
import * as THREE from 'three';
import { pointedArch } from '../../layout.js';
import {
  PI, T, S, mul, frame, sweep, arcPts, archBand, archPts, cuspedArchPts, foilPts, circlePts,
  plate, box, colonnette, planSweep, crocket, finial, Batch,
} from './kit.js';
import { rose, tracedWindow, steppedFrame, balustrade, corbelRow } from './parts.js';
import { buildPortal } from './portal.js';
import { stringCourse } from './westfront.js';

const DEG = PI / 180;

/** 斜邊壓頂 + 捲葉（山花、山牆共用）：p0 → p1 為牆面座標 (z, y)，深度 x0 */
function rakeCoping(batch, M, p0, p1, x0, { crockets = true, scale = 1, spacing = 0.6 } = {}) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const tz = (p1[0] - p0[0]) / L, ty = (p1[1] - p0[1]) / L;
  let nz = -ty, ny = tz;
  if (ny < 0) { nz = -nz; ny = -ny; }
  const k = scale;
  const cop = [[[0, 0], [0, -0.12 * k]], [[0, -0.12 * k], [0.06 * k, -0.17 * k], [0.15 * k, -0.17 * k]], arcPts(0.18 * k, -0.12 * k, 0.05 * k, 1.2 * PI, 2.3 * PI, 4), [[0.22 * k, -0.07 * k], [0.22 * k, 0.05]]];
  batch.add('carved', sweep(cop, 2, (i, a, b) => {
    const t = i ? 1.0 : 0;
    return [x0 + b, p0[1] + (p1[1] - p0[1]) * t + ny * (a - 0.1 * k), p0[0] + (p1[0] - p0[0]) * t + nz * (a - 0.1 * k)];
  }), M, 'keep');
  if (!crockets) return;
  const cnt = Math.floor(L / spacing);
  const ms = [];
  for (let i = 1; i < cnt; i++) {
    const t = i / cnt;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, ty, tz), new THREE.Vector3(0, ny, nz), new THREE.Vector3(1, 0, 0));
    m.setPosition(x0 - 0.08 * k, p0[1] + (p1[1] - p0[1]) * t + ny * 0.1 * k, p0[0] + (p1[0] - p0[0]) * t + nz * 0.1 * k);
    ms.push(mul(M, m, S(1.4 * k)));
  }
  batch.addMany('carved', crocket(), ms);
}

/** 平面線段依「往外」方向擺正（planSweep 的往外 = 行進左側） */
function orient(p0, p1, out) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const n = [-dz, dx];
  return n[0] * out[0] + n[1] * out[1] >= 0 ? [p0, p1] : [p1, p0];
}

export function buildFlanks(C, rng) {
  const sides = new Batch('flanks-windows');
  const eaves = new Batch('flanks-eaves');
  const trans = new Batch('transepts');
  const red = new Batch('porte-rouge');

  // ---------------- 窗 ----------------
  const winFrame = (w) => {
    if (w.angleDeg !== undefined) {
      const a = w.angleDeg * DEG;
      return frame(w.x, 0, w.z, -Math.cos(a), -Math.sin(a));
    }
    return frame(w.x, 0, w.z, 0, -Math.sign(w.z));
  };
  for (const w of C.windows.clerestory) {
    tracedWindow(sides, mul(winFrame(w), T(0, 0, 0)), { width: w.width, sill: w.sill, height: w.height, lancets: w.lancets, oculus: w.oculus, x0: 0.15, depth: 0.25 });
  }
  for (const w of C.windows.chapel) {
    tracedWindow(sides, winFrame(w), { width: w.width, sill: w.sill, height: w.height, lancets: w.lancets, oculus: w.oculus, x0: 0.15, depth: 0.25 });
  }
  for (const o of C.windows.tribuneOculi) {
    rose(sides, frame(o.x, 0, o.z, 0, -Math.sign(o.z)), { R: o.diameter / 2, cy: o.y, cz: 0, x0: 0.15, nIn: 6, nOut: 12, oculusR: 0.35, frameW: 0.28, frameFront: -0.12, frameK: 2, inset: 0.03 });
  }

  // ---------------- 禮拜堂山花 ----------------
  for (const g of C.chapelGablets) {
    const M = frame(g.x, 0, g.z, 0, -Math.sign(g.z));
    const W2 = g.width / 2;
    const cyF = g.base + (g.apex - g.base) * 0.36;
    const rF = Math.min(0.55, (g.apex - g.base) * 0.2);
    sides.add('carved', plate([[-W2, g.base - 0.3], [W2, g.base - 0.3], [W2, g.base], [0, g.apex], [-W2, g.base]], [], 0.45, -0.2), M);
    sides.add('carved', plate(foilPts(3, rF, 0.36, { rot: PI / 2, cy: cyF, seg: 60 }), [foilPts(3, rF - 0.09, 0.38, { rot: PI / 2, cy: cyF, seg: 60 })], 0.07, -0.27), M);
    for (const s of [-1, 1]) rakeCoping(sides, M, [s * (W2 + 0.05), g.base - 0.05], [0, g.apex + 0.02], -0.22, { spacing: 0.7 });
    sides.add('carved', finial(1.2), mul(M, T(-0.1, g.apex - 0.05, 0)));
  }

  // ---------------- 高牆簷口：托檐 + 欄杆 ----------------
  const R = C.roof;
  const eZ = R.eaveZ, eY = R.eave;
  const runs = [];
  for (const s of [-1, 1]) runs.push(orient([C.nave.x0, s * eZ], [C.nave.x1, s * eZ], [0, s]));
  // 詩班席＋後殿：一條折線
  const apx = C.apse.cx;
  const choirPath = [[C.choir.x0, eZ], [apx, eZ]];
  for (const a of [...C.apse.vertexAnglesDeg].reverse().slice(1)) choirPath.push([apx + eZ * Math.cos(a * DEG), eZ * Math.sin(a * DEG)]);
  choirPath.push([C.choir.x0, -eZ]);
  for (let i = 0; i < choirPath.length - 1; i++) runs.push([choirPath[i], choirPath[i + 1]]);
  // 袖廊兩翼東西側（避開轉角小塔）
  for (const tf of C.transept.facades) {
    const s = Math.sign(tf.z);
    const zEnd = tf.z - s * (tf.cornerTurrets[0].size / 2 + 0.1);
    runs.push(orient([tf.x0, s * eZ], [tf.x0, zEnd], [-1, 0]));
    runs.push(orient([tf.x1, s * eZ], [tf.x1, zEnd], [1, 0]));
  }
  for (const [p0, p1] of runs) {
    eaves.add('carved', planSweep([p0, p1], eY - 0.5, stringCourse(0.5, 0.3)), null, 'keep');
    corbelRow(eaves, p0, p1, eY - 0.95, { proj: 0.22, h: 0.42, w: 0.18, spacing: 0.75 });
    // 欄杆：中心線在牆外皮內 0.12
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L;
    const off = -0.12;
    balustrade(eaves, [p0[0] + nx * off, p0[1] + nz * off], [p1[0] + nx * off, p1[1] + nz * off], eY, R.eaveBalustrade.height, 'quatrefoil', 0.2, 1.3);
  }

  // ---------------- 袖廊立面 ----------------
  for (const tf of C.transept.facades) {
    const s = Math.sign(tf.z);
    const P = tf.portal;
    const M = frame(P.x, 0, tf.z, 0, -s); // 橫向 Z' = (s, 0, 0)·…（左右對稱，不影響）
    buildPortal(trans, { ...P, id: tf.id }, M, { statues: null, r: rng(`facades/transept/${tf.id}`) });
    const lat = (x) => (x - P.x) * s; // 世界 x → 牆面橫向
    const wd = tf.x1 - tf.x0;
    const turret = tf.cornerTurrets[0].size / 2;
    const zL = lat(tf.x0 + turret), zR = lat(tf.x1 - turret);
    const [za, zb] = [Math.min(zL, zR), Math.max(zL, zR)];
    // 門層頂線腳
    const cv = tf.claireVoie;
    trans.add('carved', sweep(stringCourse(0.55, 0.3).map((st) => st.map(([o, h]) => [o, h])), 2, (i, o, h) => [-o, cv.yBottom - 0.8 + h, i ? zb : za]), M, 'keep');
    // 透光尖窗帶：細柱 + 玻璃 + 拱頭滾邊（洞由結構開，位置相同）
    const rw = tf.rose.diameter;
    const pitch = rw / cv.lancets;
    const lw = pitch * 0.72;
    const la = pointedArch(lw, cv.yTop);
    const colH = Math.max(0.3, la.springing - cv.yBottom);
    for (let i = 0; i < cv.lancets; i++) {
      const uc = lat(tf.rose.x - rw / 2 + (i + 0.5) * pitch);
      trans.add('glass', plate(archPts(lw + 0.1, la.springing, { n: 10, yBottom: cv.yBottom - 0.05, R: lw + 0.1 }), [], 0.02, 0.5), mul(M, T(0, 0, uc)));
      trans.add('carved', archBand([arcPts(0, 0, 0.05, PI * 0.5, PI * 1.5, 4)], { span: lw + 0.08, spring: la.springing, x0: -0.02, yStart: cv.yBottom, n: 12 }), mul(M, T(0, 0, uc)), 'keep');
    }
    for (let i = 0; i <= cv.lancets; i++) {
      const uc = lat(tf.rose.x - rw / 2 + i * pitch);
      trans.add('carved', colonnette(0.09, colH, 8), mul(M, T(-0.1, cv.yBottom, uc)));
    }
    trans.add('carved', box(0.4, 0.15, rw + 0.4, -0.3, cv.yBottom - 0.15, -rw / 2 - 0.2), mul(M, T(0, 0, lat(tf.rose.x))));
    // 玫瑰窗
    rose(trans, M, {
      R: rw / 2, cy: tf.rose.y, cz: lat(tf.rose.x), x0: 0.2, nIn: tf.rose.petals, nOut: tf.rose.petals * 2,
      oculusR: rw * 0.08, frameW: 0.6, frameFront: -0.18, frameK: 3, inset: 0.04,
    });
    // 玫瑰窗外的方框（兩側與上緣），下緣接透光尖窗帶
    {
      const h = rw / 2 + 0.75;
      const zc = lat(tf.rose.x);
      const yTop = tf.rose.y + h;
      const prof = [[[0, 0], [-0.2, 0.0]], arcPts(-0.2, 0.08, 0.08, -PI / 2, PI / 2, 4), [[-0.2, 0.16], [0, 0.22]]];
      for (const side of [-1, 1]) {
        trans.add('carved', sweep(prof, 2, (i, a, b) => [a, i ? yTop : cv.yTop + 0.2, zc + side * h + b * side]), M, 'keep');
      }
      trans.add('carved', sweep(prof, 2, (i, a, b) => [a, yTop + b - 0.11, zc + (i ? h : -h)]), M, 'keep');
    }
    // 山牆圓窗
    const go = tf.gableOculus;
    rose(trans, M, { R: go.diameter / 2, cy: go.y, cz: lat(go.x), x0: 0.15, nIn: 6, nOut: 12, oculusR: 0.4, frameW: 0.35, frameFront: -0.15, frameK: 2, inset: 0.03 });
    // 山牆底的鏤空欄杆走道 + 山牆斜邊壓頂與捲葉
    const wallTop = C.heights.wallTop;
    trans.add('carved', box(0.75, 0.3, zb - za, -0.7, wallTop - 0.3, za), M);
    {
      const pA = [za, wallTop], pB = [zb, wallTop];
      // 欄杆（牆面座標 → 世界：用 M 的平面座標）
      const w0 = new THREE.Vector3(-0.55, 0, za).applyMatrix4(M), w1 = new THREE.Vector3(-0.55, 0, zb).applyMatrix4(M);
      balustrade(trans, [w0.x, w0.z], [w1.x, w1.z], wallTop, 1.0, 'arcade', 0.2, 1.3);
      const apex = [lat((tf.x0 + tf.x1) / 2), tf.gableApex];
      const pa0 = [za, wallTop + (tf.gableApex - wallTop) * (turret / (wd / 2))];
      const pb0 = [zb, wallTop + (tf.gableApex - wallTop) * (turret / (wd / 2))];
      void pA; void pB;
      rakeCoping(trans, M, pa0, apex, -0.05, { scale: 1.6, spacing: 0.9 });
      rakeCoping(trans, M, pb0, apex, -0.05, { scale: 1.6, spacing: 0.9 });
    }
  }

  // ---------------- 紅門 ----------------
  {
    const pr = C.porteRouge;
    const M = frame(pr.x, 0, pr.z, 0, -Math.sign(pr.z));
    const rec = 0.6;
    const oa = pointedArch(pr.width, pr.apex);
    // 門洞側壁的兩道拱圈與細柱
    const fw = 0.42;
    const st = steppedFrame(fw, rec - 0.02, -0.14, 2).map((q) => q.map(([r, d]) => [r - fw - 0.03, d]));
    red.add('carved', archBand(st, { span: pr.width, spring: oa.springing, yStart: 0.4, n: 30 }), M, 'keep');
    for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) red.add('carved', colonnette(0.07, oa.springing - 0.5, 8), mul(M, T(rec * (0.65 - i * 0.4), 0.45, sd * (pr.width / 2 - fw + 0.12 + i * 0.18))));
    // 門楣板（門頂到拱頂）
    red.add('carved', plate(archPts(pr.width, oa.springing, { n: 18, yBottom: pr.height }), [], 0.1, rec - 0.15), M);
    red.add('carved', box(0.3, 0.2, pr.width, rec - 0.35, pr.height - 0.1, -pr.width / 2), M);
    red.add('carved', plate(foilPts(4, 0.35, 0.3, { rot: PI / 4, cy: (pr.height + pr.apex) / 2 + 0.1, seg: 48 }), [foilPts(4, 0.27, 0.3, { rot: PI / 4, cy: (pr.height + pr.apex) / 2 + 0.1, seg: 48 })], 0.06, rec - 0.21), M);
    // 紅色門扇兩扇＋鐵件
    const lw = (pr.width - 0.06) / 2;
    for (const sd of [-1, 1]) {
      const z0 = sd < 0 ? -pr.width / 2 : 0.03;
      red.add('red', box(0.09, pr.height - 0.1, lw, rec - 0.1, 0, z0), M);
      for (const yy of [0.6, pr.height * 0.5, pr.height - 0.8]) red.add('iron', box(0.025, 0.07, lw * 0.8, rec - 0.125, yy, sd < 0 ? z0 : z0 + lw * 0.2), M);
    }
    // 三角楣
    const apex = pr.apex + 2.6, W2 = pr.width / 2 + 0.9, base = oa.springing - 0.2;
    const inner = archPts(pr.width + 0.5, oa.springing, { n: 18, R: pr.width + 0.5 }).filter(([, y]) => y >= base + 0.01);
    const outline = [[-W2, base], [0, apex], [W2, base], ...inner.reverse()];
    red.add('carved', plate(outline, [], 0.3, -0.25), M);
    for (const sd of [-1, 1]) rakeCoping(red, M, [sd * (W2 + 0.05), base], [0, apex + 0.02], -0.25, { spacing: 0.55 });
    red.add('carved', finial(1.3), mul(M, T(-0.12, apex - 0.05, 0)));
    // 帽線
    red.add('carved', archBand([[[0, 0.05], [0, -0.12]], arcPts(0.07, -0.12, 0.07, PI, 2 * PI, 5), [[0.14, -0.12], [0.18, 0.0]]], { span: pr.width + 0.3, spring: oa.springing, x0: -0.02, yStart: 0.3, n: 26 }), M, 'keep');
  }

  return [sides, eaves, trans, red];
}
