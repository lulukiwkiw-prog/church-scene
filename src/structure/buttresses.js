// src/structure/buttresses.js — 扶壁墩（culée）、中間柱（palée）、飛扶壁
import { frame, slab, stackY, orientedRect } from './geom.js';

const DEG = Math.PI / 180;

export function buildButtresses(ctx) {
  const { L, M } = ctx;
  const H = L.heights;
  const a = M.ashlar, w = M.weathered;
  const r = ctx.rng('structure/buttress/tone');

  // ---- 扶壁墩：下段（含勒腳）石材較新，側廊屋頂以上用風化石 ----
  const stepY = H.aisleRoofLow - 0.8;     // 下段頂（在禮拜堂簷口下方）
  for (const p of L.buttressPiers) {
    const ang = p.rotationDeg !== undefined ? p.rotationDeg * DEG : (p.z < 0 ? -Math.PI / 2 : Math.PI / 2);
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const foot = (dw, dOut, dIn = 0) => orientedRect(p.x, p.z, dx, dz, p.width + dw, p.depth + dOut + dIn, (dOut - dIn) / 2);
    const north = p.z < -0.5;
    a.tone = north ? 0.94 : 1.0;
    stackY(a, [
      { y: -0.3, foot: foot(0.6, 1.0) },
      { y: L.westFront.plinth.height - 0.2, foot: foot(0.6, 1.0) },
      { y: L.westFront.plinth.height + 0.2, foot: foot(0.4, 0.7) },
      { y: stepY, foot: foot(0.4, 0.7) },
    ], { top: false });
    // 水盤斜面
    w.tone = (north ? 0.9 : 1.0) * r.range(0.95, 1.04);
    stackY(w, [
      { y: stepY, foot: foot(0.4, 0.7) },
      { y: stepY + 1.05, foot: foot(0, 0) },
      { y: (stepY + p.top) / 2, foot: foot(0, 0) },
      { y: (stepY + p.top) / 2 + 0.5, foot: foot(-0.2, -0.35) },
      { y: p.top, foot: foot(-0.2, -0.35) },
    ], { top: true });
  }
  ctx.report.culeeTopSize = { widthLoss: 0.2, depthLoss: 0.35, note: '扶壁墩上段斷面縮小 0.2 × 0.35（外側退縮），中心向內偏 0.175' };

  // ---- 中間柱 ----
  for (const p of L.paleePiers) {
    const dz = Math.sign(p.z);
    const foot = (k) => orientedRect(p.x, p.z, 0, dz, p.width + k, p.depth + k);
    w.tone = (p.z < 0 ? 0.9 : 1.0) * r.range(0.95, 1.04);
    stackY(w, [
      { y: H.aisleRoofLow, foot: foot(0.2) },
      { y: H.tribuneRoofLow - 0.3, foot: foot(0.2) },
      { y: H.tribuneRoofLow + 0.2, foot: foot(0) },
      { y: p.top, foot: foot(0) },
    ], { top: true });
  }

  // ---- 飛扶壁 ----
  for (const fb of L.flyingButtresses) {
    for (const f of fb.flights) {
      const north = f.foot[2] < 0;
      w.tone = (north ? 0.88 : 0.98) * r.range(0.95, 1.04);
      flight(w, f.foot, f.head, fb.thickness, fb.archDepth);
    }
  }
  a.tone = 1; w.tone = 1;
}

/**
 * 一段飛扶壁：上緣為 foot→head 的直線斜坡，下緣為與上緣平行線（距離 archDepth）相切的圓弧，
 * 兩端往下落到扶壁墩 / 牆面上。斷面沿水平法線擠出 thickness。
 */
export function flight(mb, foot, head, thickness, archDepth) {
  const dx = head[0] - foot[0], dz = head[2] - foot[2];
  const Lh = Math.hypot(dx, dz);
  const yf = foot[1], yh = head[1];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const dropF = archDepth + clamp(0.2 * Lh, 0.8, 3.0);
  const dropH = archDepth + clamp(0.12 * Lh, 0.6, 2.0);
  const arc = tangentArc([0, yf], [Lh, yh], [0, yf - dropF], [Lh, yh - dropH], archDepth, 16);
  const outline = [[0, yf], [Lh, yh], ...arc.slice().reverse()];
  const F = frame([foot[0], foot[2]], [dx, dz], [-dz, dx]);
  slab(mb, F, outline, thickness / 2, -thickness / 2);
}

/** 求過 A、B 且與「上緣線往下平移 d」相切的圓弧（由 A 到 B 的點列，含端點） */
function tangentArc(P, Q, A, B, d, seg) {
  // 旋轉座標：上緣線為 x' 軸
  const th = Math.atan2(Q[1] - P[1], Q[0] - P[0]);
  const c = Math.cos(th), s = Math.sin(th);
  const toR = (p) => [(p[0] - P[0]) * c + (p[1] - P[1]) * s, -(p[0] - P[0]) * s + (p[1] - P[1]) * c];
  const fromR = (p) => [P[0] + p[0] * c - p[1] * s, P[1] + p[0] * s + p[1] * c];
  const a = toR(A), b = toR(B);
  // 圓心 (cx, cy)，半徑 R = -d - cy（頂點落在 y' = -d）
  const ka = a[1] + d, kb = b[1] + d; // 皆 < 0
  const p = a[0], q = b[0];
  // kb(p-cx)^2 - ka(q-cx)^2 = ka·kb·(b.y - a.y)
  const qa = kb - ka, qb = -2 * (kb * p - ka * q), qc = kb * p * p - ka * q * q - ka * kb * (b[1] - a[1]);
  let cx;
  if (Math.abs(qa) < 1e-9) cx = -qc / qb;
  else {
    const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
    const r1 = (-qb + disc) / (2 * qa), r2 = (-qb - disc) / (2 * qa);
    cx = (r1 > p && r1 < q) ? r1 : r2;
  }
  const cy = ((a[0] - cx) ** 2 + a[1] * a[1] - d * d) / (2 * ka);
  const R = -d - cy;
  let angA = Math.atan2(a[1] - cy, a[0] - cx);
  if (angA < Math.PI / 2) angA += 2 * Math.PI; // 由左側經過頂點掃到右側
  const angB = Math.atan2(b[1] - cy, b[0] - cx);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = angA + (angB - angA) * (i / seg);
    pts.push(fromR([cx + R * Math.cos(t), cy + R * Math.sin(t)]));
  }
  return pts;
}
