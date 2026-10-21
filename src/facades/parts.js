// src/facades/parts.js — 可重複使用的立面部件：玫瑰窗、雙尖窗＋圓窗窗花、欄杆、托檐、葉形圓章
// 全部以「牆面座標」建（X = 往牆內深度、Y = 上、Z = 橫向），再由呼叫者給矩陣 M 放到世界。
import * as THREE from 'three';
import { pointedArch } from '../../layout.js';
import {
  PI, T, S, Ry, Rx, mul, plateM, sweep, arcPts, archBand, ringBand, archPts, cuspedArchPts, foilPts, circlePts,
  plate, shapeOf, extrude, box, colonnette, prep, mergeGeometries, crocket, finial,
} from './kit.js';

// -----------------------------------------------------------------------------
// 線腳剖面
// -----------------------------------------------------------------------------
/**
 * 階梯式框線（玫瑰窗框、大圓拱）：k 道，每道一個滾邊。剖面 (r 往外, d 深度)。
 * 從 (0, dBack) 起（貼玻璃那側的內襯），往外一階一階走到 (fw, dFront)。
 */
export function steppedFrame(fw, dBack, dFront, k) {
  const strips = [];
  const step = fw / k;
  const dz = (dBack - dFront) / (k + 0.5);
  let d = dBack - dz * 0.5;
  strips.push([[0, dBack], [0, d]]);
  for (let i = 0; i < k; i++) {
    const r0 = i * step;
    const rr = Math.min(step * 0.28, dz * 0.45);
    // 滾邊
    strips.push(arcPts(r0 + rr, d - rr * 0.2, rr, PI, 2.1 * PI, 7));
    const d1 = d - dz;
    strips.push([[r0 + 2 * rr * 0.98, d - rr * 0.1], [r0 + step * 0.55, d - dz * 0.15], [r0 + step * 0.62, d1 + dz * 0.2]]);
    strips.push([[r0 + step * 0.62, d1 + dz * 0.2], [r0 + step * 0.66, d1], [r0 + step, d1]]);
    d = d1;
  }
  strips.push([[fw, d], [fw + 0.05, dFront + 0.0], [fw + 0.05, dFront + 0.25]]);
  return strips;
}

/** 窗外的帽線（hood mould）：小滾邊 + 斜面 */
export function hoodStrips(s = 1) {
  return [
    [[0, 0.06 * s], [0, -0.06 * s]],
    arcPts(0.07 * s, -0.06 * s, 0.07 * s, PI, 2 * PI, 6),
    [[0.14 * s, -0.06 * s], [0.2 * s, 0.02 * s], [0.2 * s, 0.08 * s]],
  ];
}

// -----------------------------------------------------------------------------
// 玫瑰窗：中心小圓 → 內圈放射細柱 → 尖拱環 → 外圈細柱 → 外緣尖瓣拱環 → 框線
// -----------------------------------------------------------------------------
export function rose(batch, M, o) {
  const { R, cz = 0, cy, x0 = 0, nIn, nOut, oculusR = R * 0.19, frameW = R * 0.1, frameFront = -0.12, frameK = 2, glass = true, inset = 0 } = o;
  const k = R / 4.8;
  const t = 0.3 * Math.max(0.6, k);
  const add = (key, g, m, uv) => batch.add(key, g, mul(M, T(0, cy, cz), m), uv);
  const r1 = R * 0.53, aH1 = R * 0.1, band1 = R * 0.06;
  const r2 = R * 0.9, aH2 = R * 0.09;

  if (glass) add('glass', new THREE.CircleGeometry(R + 0.03, 72).applyMatrix4(plateM(x0 + t + 0.03)), null);
  // 中心小圓
  add('carved', plate(circlePts(oculusR + R * 0.06, 48), [foilPts(Math.min(nIn, 12), oculusR, 0.22, { seg: 96 })], t, x0));
  add('carved', plate(foilPts(Math.min(nIn, 12), oculusR * 0.55, 0.3, { seg: 48 }), [circlePts(oculusR * 0.4, 24)], t * 0.6, x0 + t * 0.2));

  // 拱環（內、外）
  const arcadeRing = (nSec, rTop, aH, bandW, cuspK, rOut) => {
    const inner = [];
    const seg = nSec * 16;
    for (let i = 0; i < seg; i++) {
      const phi = (i / seg) * 2 * PI;
      const psi = ((phi / (2 * PI)) * nSec) % 1;
      const pointed = Math.pow(Math.max(0, 1 - Math.abs(2 * psi - 1)), 0.5);
      const bump = (u) => Math.pow(Math.max(0, 1 - Math.abs(u)), 1.8);
      const cusp = cuspK * (bump((psi - 0.3) / 0.13) + bump((psi - 0.7) / 0.13));
      const rr = rTop - aH + aH * pointed - cusp;
      inner.push([rr * Math.cos(phi), rr * Math.sin(phi)]);
    }
    return plate(circlePts(rOut ?? rTop + bandW, seg), [inner], t, x0);
  };
  add('carved', arcadeRing(nIn, r1, aH1, band1, aH1 * 0.35));
  add('carved', arcadeRing(nOut, r2, aH2, 0, aH2 * 0.4, R + 0.03));

  // 放射細柱
  const spokes = (n, rA, rB, rad, phase) => {
    const len = rB - rA;
    const col = colonnette(rad, len, 8);
    const ms = [];
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * 2 * PI + phase;
      ms.push(mul(M, T(0, cy, cz), T(x0 + t / 2, rA * Math.sin(phi), rA * Math.cos(phi)), Rx(PI / 2 - phi)));
    }
    batch.addMany('carved', col, ms);
  };
  spokes(nIn, oculusR + R * 0.05, r1 - aH1 + 0.02, 0.075 * Math.max(0.7, k), 0);
  spokes(nOut, r1 + band1 - 0.02, r2 - aH2 + 0.02, 0.065 * Math.max(0.7, k), PI / nOut);
  // 外圈每個尖瓣裡的小圓孔飾（只在大玫瑰窗）
  if (R > 3) {
    const ms = [];
    const ring = mergeGeometries([prep(plate(circlePts(R * 0.035, 16), [circlePts(R * 0.022, 16)], t * 0.5, x0 + t * 0.25))], false);
    for (let i = 0; i < nOut; i++) {
      const phi = ((i + 0.5) / nOut) * 2 * PI + PI / nOut;
      const rr = r2 - aH2 * 0.25;
      ms.push(mul(M, T(0, cy + rr * Math.sin(phi), cz + rr * Math.cos(phi))));
    }
    batch.addMany('carved', ring, ms);
  }
  // 框
  add('carved', ringBand(steppedFrame(frameW, x0 + t, frameFront, frameK), { R0: R - inset, n: 128 }), null, 'keep');
}

// -----------------------------------------------------------------------------
// 雙尖窗＋圓窗（高窗、禮拜堂窗、袖廊等）：平板窗花 + 玻璃 + 帽線
// 原點在牆面窗洞底部中線；X 往牆內
// -----------------------------------------------------------------------------
const windowCache = new Map();
export function tracedWindowGeo({ width, sill, height, lancets = 2, oculus = true, depth = 0.25, x0 = 0.12, hood = true }) {
  const key = [width, sill, height, lancets, oculus, depth, x0, hood].join('|');
  if (windowCache.has(key)) return windowCache.get(key);
  const top = sill + height;
  const oa = pointedArch(width, top);
  const outline = archPts(width, oa.springing, { n: 28, yBottom: sill });
  const m = Math.max(0.16, width * 0.06);
  const lw = (width - (lancets + 1) * m) / lancets;
  const lApex = sill + height * (oculus ? 0.66 : 0.9);
  const la = pointedArch(lw, lApex);
  const holes = [];
  const lancetCenters = [];
  for (let i = 0; i < lancets; i++) {
    const cx = -width / 2 + m + lw / 2 + i * (lw + m);
    lancetCenters.push(cx);
    holes.push(cuspedArchPts(lw, la.springing, { n: 14, yBottom: sill + 0.06, cx, cusp: lw * 0.07 }));
  }
  let oc = null;
  if (oculus) {
    const cyO = (lApex + top) / 2 - height * 0.02;
    const rO = Math.min((top - lApex) * 0.36, width * 0.29);
    oc = { cy: cyO, r: rO };
    holes.push(foilPts(6, rO, 0.18, { cy: cyO, seg: 72, rot: PI / 2 }));
  }
  const parts = [];
  const carved = [prep(plate(outline, holes, depth, x0))];
  // 細尖窗的細滾邊
  for (const cx of lancetCenters) {
    const g = archBand([arcPts(0, 0, 0.04, PI * 0.5, PI * 1.5, 4)], { span: lw + 0.06, spring: la.springing, x0: x0 - 0.0, yStart: sill + 0.06, n: 14 });
    carved.push(prep(g.translate(0, 0, cx)));
  }
  if (oc) carved.push(prep(plate(circlePts(oc.r + 0.07, 36, 0, oc.cy), [circlePts(oc.r + 0.0, 36, 0, oc.cy)], 0.08, x0 - 0.06)));
  // 帽線
  if (hood) {
    carved.push(prep(archBand(hoodStrips(1), { span: width + 0.06, spring: oa.springing, x0: -0.02, yStart: oa.springing - height * 0.12, n: 28 }), null, 'keep'));
  }
  // 窗台
  carved.push(prep(box(0.32, 0.12, width + 0.2, -0.2, sill - 0.12, -width / 2 - 0.1)));
  const glass = prep(plate(outline, [], 0.02, x0 + depth + 0.04));
  const out = { carved: mergeGeometries(carved, false), glass };
  windowCache.set(key, out);
  return out;
}
export function tracedWindow(batch, M, o) {
  const g = tracedWindowGeo(o);
  batch.add('carved', g.carved, M);
  batch.add('glass', g.glass, M);
}

// -----------------------------------------------------------------------------
// 欄杆：鏤空石板（尖拱列或四葉形），樣板沿 +X 長 L、高 H、厚度沿 Z 置中
// -----------------------------------------------------------------------------
const balCache = new Map();
export function balustradeModule(L, H, style = 'arcade', th = 0.2) {
  const key = `${L.toFixed(2)}|${H}|${style}|${th}`;
  if (balCache.has(key)) return balCache.get(key);
  const base = Math.min(0.14, H * 0.13), cop = Math.min(0.16, H * 0.15);
  const y0 = base, y1 = H - cop;
  const ih = y1 - y0;
  const holes = [];
  if (style === 'arcade') {
    const k = Math.max(1, Math.round(L / 0.32));
    const post = 0.075;
    const ow = L / k - post;
    for (let i = 0; i < k; i++) {
      const cx = (i + 0.5) * (L / k);
      const pa = pointedArch(ow, y1 - 0.05);
      holes.push(cuspedArchPts(ow, pa.springing, { n: 8, yBottom: y0 + 0.04, cx, cusp: ow * 0.12 }));
    }
  } else {
    const k = Math.max(1, Math.round(L / (ih * 0.95)));
    const cell = L / k;
    const rr = Math.min(cell, ih) * 0.42;
    for (let i = 0; i < k; i++) holes.push(foilPts(4, rr, 0.3, { cx: (i + 0.5) * cell, cy: (y0 + y1) / 2, seg: 32, rot: PI / 4 }));
  }
  const g = extrude(shapeOf([[0, y0 - 0.01], [L, y0 - 0.01], [L, y1 + 0.01], [0, y1 + 0.01]], holes), th);
  g.translate(0, 0, -th / 2);
  // 底座與壓頂（壓頂兩側略出挑、上緣倒角）
  const coping = extrude(shapeOf([[-th / 2 - 0.05, 0], [th / 2 + 0.05, 0], [th / 2 + 0.05, cop * 0.55], [th / 2 - 0.02, cop], [-th / 2 + 0.02, cop], [-th / 2 - 0.05, cop * 0.55]]), L);
  coping.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
  coping.translate(0, y1, 0);
  const plinth = box(L, base, th + 0.08, 0, 0, -th / 2 - 0.04);
  const out = mergeGeometries([prep(g), prep(coping), prep(plinth)], false);
  balCache.set(key, out);
  return out;
}
/** 沿平面線段 p0→p1（[x,z]）放欄杆，底高 y0；回傳使用的矩陣數 */
export function balustrade(batch, p0, p1, y0, H, style = 'arcade', th = 0.2, modLen = 1.3) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return;
  const cnt = Math.max(1, Math.round(len / modLen));
  const L = len / cnt;
  const tmpl = balustradeModule(L, H, style, th);
  const th0 = Math.atan2(-dz, dx);
  const ms = [];
  for (let i = 0; i < cnt; i++) ms.push(mul(T(p0[0] + (dx * i) / cnt, y0, p0[1] + (dz * i) / cnt), Ry(th0)));
  // 每段兩端的小墩
  const post = box(0.3, H + 0.08, 0.3, -0.15, 0, -0.15);
  batch.addMany('carved', tmpl, ms);
  batch.addMany('carved', post, [T(p0[0], y0, p0[1]), T(p1[0], y0, p1[1])]);
}
/** 沿折線放欄杆 */
export function balustradePath(batch, pts, y0, H, style, th, modLen) {
  for (let i = 0; i < pts.length - 1; i++) balustrade(batch, pts[i], pts[i + 1], y0, H, style, th, modLen);
}

// -----------------------------------------------------------------------------
// 托檐（corbel table）：沿線段每隔 spacing 放一個托石；托石沿 +X（往外）挑出 proj
// 線段的往外方向 = 行進方向左側 (-tz, tx)
// -----------------------------------------------------------------------------
const corbelCache = new Map();
function corbelGeo(proj, h, w) {
  const key = `${proj}|${h}|${w}`;
  if (corbelCache.has(key)) return corbelCache.get(key);
  const prof = [[0, 0], [0, h]];
  prof.push([proj, h], [proj, h * 0.72]);
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (PI / 2);
    prof.push([proj - proj * 0.85 * Math.sin(a) * 1.0 + 0, h * 0.72 - h * 0.62 * (1 - Math.cos(a))].map((v, j) => (j === 0 ? Math.max(0.02, proj * (1 - Math.sin(a) * 0.85)) : v)));
  }
  const g = extrude(shapeOf(prof), w);
  g.translate(0, 0, -w / 2);
  // 形狀 (s = 往外, t = 上)，擠出 = 沿線
  const out = prep(g);
  corbelCache.set(key, out);
  return out;
}
export function corbelRow(batch, p0, p1, y, { proj = 0.3, h = 0.4, w = 0.2, spacing = 0.6, inset = 0.3 } = {}) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz);
  const tx = dx / len, tz = dz / len;
  const nx = -tz, nz = tx;
  const cnt = Math.max(1, Math.floor((len - 2 * inset) / spacing) + 1);
  const g = corbelGeo(proj, h, w);
  const ms = [];
  for (let i = 0; i < cnt; i++) {
    const s = cnt === 1 ? len / 2 : inset + ((len - 2 * inset) * i) / (cnt - 1);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(nx, 0, nz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx, 0, tz));
    m.setPosition(p0[0] + tx * s, y, p0[1] + tz * s);
    ms.push(m);
  }
  batch.addMany('carved', g, ms);
}

// -----------------------------------------------------------------------------
// 葉形盲飾圓章（壁面三葉圓章）：三個小圓環組成三葉形 + 外框
// -----------------------------------------------------------------------------
export function foilRosetteGeo(D, lobes = 3, depth = 0.12) {
  const R = D / 2;
  const parts = [];
  parts.push(prep(plate(foilPts(lobes, R, 0.32, { rot: PI / 2, seg: 96 }), [foilPts(lobes, R - 0.09, 0.34, { rot: PI / 2, seg: 96 })], depth, -depth)));
  const lr = R * 0.36, ld = R * 0.5;
  for (let i = 0; i < lobes; i++) {
    const a = PI / 2 + (i / lobes) * 2 * PI;
    const cx = ld * Math.cos(a), cy = ld * Math.sin(a);
    parts.push(prep(plate(circlePts(lr, 28, cx, cy), [foilPts(4, lr - 0.06, 0.28, { cx, cy, seg: 40 })], depth * 0.8, -depth * 0.8)));
    parts.push(prep(plate(circlePts(lr * 0.35, 12, cx, cy), [], depth * 0.4, -depth * 0.4)));
  }
  parts.push(prep(plate(circlePts(R * 0.14, 16), [], depth * 0.7, -depth * 0.7)));
  return mergeGeometries(parts, false);
}

export { crocket, finial };
