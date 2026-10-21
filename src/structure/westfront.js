// src/structure/westfront.js — 西立面與雙塔量體（x 0→13）
import { frame, slab, archPts, circlePts, rectPts, box, stackY, regularPoly, recessedColumn } from './geom.js';

// 模組內部的造型常數（比例，不是位置）
const GROUND_SINK = 0.3;     // 牆體往地下多延伸一點，讓落地的門洞成為封閉的洞
const BELFRY_WALL = 1.9;     // 鐘樓殼牆厚（受「窗距塔角 1.95 m」限制）
const SLOPE_K = 1.5;         // 水盤斜面：高 = 1.5 × 退縮量

export function buildWestFront(ctx) {
  const { L, M, plinth } = ctx;
  const wf = L.westFront;
  const { x0, x1, z0, z1 } = wf;
  const depth = x1 - x0;
  const kings = wf.galleryOfKings;
  const rose = wf.roseTier;
  const gg = wf.grandGallery;
  const galleryX = ctx.galleryRecessX;                    // 大迴廊層牆面 x = 1.5
  const W = frame([x0, 0], [0, 1], [-1, 0]);              // 正面：u = z、法線朝廣場（-X）
  const a = M.ashlar;

  // ---- 1. 門層（地面 → 國王廊底）：三座門洞，洞底封牆讓立面模組放門 ----
  a.tone = 1.0;
  const portalHoles = wf.portals.map((p) => ({
    pts: archPts(p.z, p.outerWidth, 0, p.outerApex, 16),
    depth: p.splayDepth, capShade: 0.8, revealShade: 0.88,
  }));
  slab(a, W, rectPts(z0, z1, -GROUND_SINK, kings.yBottom), 0, -depth, portalHoles);
  // 勒腳：門與門之間
  const cuts = wf.portals.map((p) => [p.z - p.outerWidth / 2 - 0.05, p.z + p.outerWidth / 2 + 0.05]);
  plinth(a, [x0, z1], [x0, z0], [-1, 0], cuts.map(([u0, u1]) => [z1 - u1, z1 - u0]));
  // 塔側（南北面）與背面勒腳
  plinth(a, [x0, z0], [x1, z0], [0, -1]);
  plinth(a, [x1, z1], [x0, z1], [0, 1]);

  // ---- 2. 國王廊：整條內縮 recessX ----
  box(a, x0 + kings.recessX, x1, kings.yBottom, rose.terrace.y, z0, z1, { top: false });
  // ---- 3. 聖母露臺平台（國王廊頂）----
  a.tone = 1.03;
  box(a, x0 - rose.terrace.depth, x0 + kings.recessX, kings.yTop, rose.terrace.y, z0, z1, { bottom: true });
  a.tone = 1.0;

  // ---- 4. 玫瑰窗層：西玫瑰窗（圓洞，深約 1 m）＋兩側塔窗（大尖拱內兩尖窗＋圓窗）----
  const wr = rose.westRose;
  const holes4 = [{ pts: circlePts(wr.z, wr.y, wr.diameter / 2, 72), depth: 1.0, cap: M.dark, revealShade: 0.85 }];
  for (const tw of rose.towerWindows) holes4.push(towerWindowHole(tw.z, tw, M));
  const sideEdge = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && (Math.abs(p[0] - z0) < 1e-6 || Math.abs(p[0] - z1) < 1e-6);
  slab(a, W, rectPts(z0, z1, rose.terrace.y, gg.yBottom), 0, -depth, holes4, { skipEdge: sideEdge });
  // 塔的外側面（南北）：同一層也有一座大尖拱（照片：南塔南面的長窗）
  for (const [zs, s] of [[z0, -1], [z1, 1]]) {
    const tw = rose.towerWindows.find((q) => Math.sign(q.z) === s);
    a.tone = s < 0 ? 0.95 : 1.0;
    const Fs = frame([x0, zs], [1, 0], [0, s]);
    slab(a, Fs, rectPts(0, depth, rose.terrace.y, gg.yBottom), 0, -1.6, [towerWindowHole(depth / 2, tw, M)]);
  }
  a.tone = 1.0;

  // ---- 5. 大迴廊層 y 38–46：牆面退到 x = 1.5 ----
  box(a, x0 + galleryX, x1, gg.yBottom, wf.centerSectionTop, z0, z1);

  // ---- 6. 立面扶壁（含退縮與水盤）----
  for (const b of wf.buttresses) buildFacadeButtress(ctx, b);

  // ---- 7. 鐘樓（46–68 中空殼）、塔角扶壁、樓梯小塔 ----
  for (const t of wf.towers) buildBelfry(ctx, t);
  for (const s of wf.stairTurrets) {
    const t = wf.towers.find((q) => q.id === s.tower);
    a.tone = 0.98;
    stackY(a, [
      { y: t.belfry.yBottom, foot: regularPoly(s.x, s.z, s.radius, 12) },
      { y: s.top, foot: regularPoly(s.x, s.z, s.radius, 12) },
    ]);
    a.tone = 1.0;
  }
}

/** 塔窗：大尖拱（淺凹）內兩扇尖窗＋一個圓窗（暗色洞底） */
function towerWindowHole(uc, tw, M) {
  const apex = tw.sill + tw.height;
  const gap = (tw.width - tw.lancets * tw.lancetWidth) / (tw.lancets + 1);
  const kids = [];
  for (let i = 0; i < tw.lancets; i++) {
    const c = uc - tw.width / 2 + gap + tw.lancetWidth / 2 + i * (tw.lancetWidth + gap);
    kids.push({ pts: archPts(c, tw.lancetWidth, tw.sill + 0.6, tw.sill + tw.lancetHeight, 10), depth: 0.7, cap: M.dark, revealShade: 0.8 });
  }
  kids.push({ pts: circlePts(uc, tw.oculusY, tw.oculusDiameter / 2, 32), depth: 0.7, cap: M.dark, revealShade: 0.8 });
  return { pts: archPts(uc, tw.width, tw.sill, apex, 16), depth: 0.9, capShade: 0.82, children: kids };
}

/** 立面扶壁：斷面 (x, y) 沿 z 擠出 */
function buildFacadeButtress(ctx, b) {
  const { L, M } = ctx;
  const wf = L.westFront;
  const kings = wf.galleryOfKings;
  const rose = wf.roseTier;
  const gg = wf.grandGallery;
  const x0 = wf.x0;
  const galleryX = x0 + ctx.galleryRecessX;
  const F = frame([0, b.z], [1, 0], [0, 1]);   // u = x、擠出沿 z
  const hw = b.width / 2;
  const pl = wf.plinth.height;
  const a = M.ashlar;
  a.tone = 1.02;

  // 下段：地面 → 國王廊底
  const lowerSet = b.setbacks.filter((s) => s.y <= kings.yBottom);
  const upperSet = b.setbacks.filter((s) => s.y >= rose.terrace.y);
  let p = b.projection;
  const lowTop = lowerSet.length ? lowerSet[lowerSet.length - 1].y : kings.yBottom;
  const front = [];  // 由下往上的正面點
  front.push([x0 - p - 0.3, -0.3], [x0 - p - 0.3, pl - 0.25], [x0 - p, pl]);
  for (const s of lowerSet) {
    front.push([x0 - p, s.y - SLOPE_K * (p - s.projection)]);
    front.push([x0 - s.projection, s.y]);
    p = s.projection;
  }
  const lower = [[x0, -0.3], [x0, lowTop], ...front.slice().reverse()];
  slab(a, F, lower, hw, -hw);

  // 上段：露臺 → top
  if (upperSet.length) {
    let q = upperSet[0].projection;
    const y0 = upperSet[0].y;
    const fr = [[x0 - q, y0]];
    for (const s of upperSet.slice(1)) {
      fr.push([x0 - q, s.y - SLOPE_K * (q - s.projection)]);
      fr.push([x0 - s.projection, s.y]);
      q = s.projection;
    }
    fr.push([x0 - q, b.top]);
    // 背面：大迴廊層以上貼 x = 1.5，以下貼 x = 0
    const back = b.top > gg.yBottom
      ? [[galleryX, b.top], [galleryX, gg.yBottom], [x0, gg.yBottom], [x0, y0]]
      : [[x0, b.top], [x0, y0]];
    slab(a, F, [...fr, ...back], hw, -hw);
  }
  a.tone = 1.0;
}

/** 鐘樓：四面牆板（每面 2 扇尖窗貫穿）＋頂板＋塔角扶壁 */
function buildBelfry(ctx, t) {
  const { L, M } = ctx;
  const a = M.ashlar;
  const bf = t.belfry;
  const op = bf.openings;
  const xa = t.x0 + ctx.galleryRecessX;      // 西面與大迴廊牆面齊
  const xb = t.x1;
  const za = t.z0 + ctx.galleryRecessX;      // 南北兩側留同寬的走道（怪獸迴廊）
  const zb = t.z1 - ctx.galleryRecessX;
  const T = BELFRY_WALL;
  const y0 = bf.yBottom, y1 = bf.yTop;
  const zc = (za + zb) / 2, xc = (xa + xb) / 2;
  const north = t.z0 < 0;
  a.tone = north ? 0.97 : 1.0;

  const opening = (c) => ({ pts: archPts(c, op.width, op.sill, op.sill + op.height, 14), through: true, revealShade: 0.8 });
  const twoAt = (c) => [-1, 1].slice(0, op.perFace).map((s) => opening(c + s * op.offset));

  // 西、東面：沿 z 全長
  const Fw = frame([xa, 0], [0, 1], [-1, 0]);
  slab(a, Fw, rectPts(za, zb, y0, y1), 0, -T, twoAt(zc));
  const Fe = frame([xb, 0], [0, -1], [1, 0]);
  slab(a, Fe, rectPts(-zb, -za, y0, y1), 0, -T, twoAt(-zc));
  // 北、南面：夾在東西面之間
  const Fn = frame([0, za], [-1, 0], [0, -1]);
  slab(a, Fn, rectPts(-(xb - T), -(xa + T), y0, y1), 0, -T, twoAt(-xc));
  const Fs = frame([0, zb], [1, 0], [0, 1]);
  slab(a, Fs, rectPts(xa + T, xb - T, y0, y1), 0, -T, twoAt(xc));
  // 頂板：鐘樓尖窗以上封頂（平台地坪 = yTop）
  const slabBottom = op.sill + op.height + 1.0;
  a.shade = 0.75;
  box(a, xa + T, xb - T, slabBottom, y1, za + T, zb - T, { top: true, bottom: true });
  a.shade = 1;

  // 塔角扶壁：在鐘樓四角往外推，但不超出塔的平面範圍；樓梯小塔那一角省略
  const cb = t.cornerButtresses;
  const h = cb.size / 2;
  const push = 0.3;
  const turret = L.westFront.stairTurrets.find((s) => s.tower === t.id);
  for (const [cx, cz, sx, sz] of [[xa, za, -1, -1], [xa, zb, -1, 1], [xb, za, 1, -1], [xb, zb, 1, 1]]) {
    const px = Math.min(Math.max(cx + sx * push, t.x0 + h), t.x1 - h);
    const pz = Math.min(Math.max(cz + sz * push, t.z0 + h), t.z1 - h);
    if (turret && Math.hypot(turret.x - px, turret.z - pz) < turret.radius + h) continue;
    const sq = (s) => [[px - s, pz - s], [px + s, pz - s], [px + s, pz + s], [px - s, pz + s]];
    const mid = (y0 + cb.top) / 2;
    // 照片：塔角扶壁滿佈細長盲拱 → 每面一道淺凹尖拱
    const blind = (ya, yb) => (i, len) => [{ pts: archPts(len / 2, len * 0.42, ya + 0.6, yb - 0.5, 6), depth: 0.14, capShade: 0.85, revealShade: 0.9 }];
    recessedColumn(a, sq(h), y0, mid, blind(y0, mid), { top: false });
    stackY(a, [{ y: mid, foot: sq(h) }, { y: mid + 0.35, foot: sq(h - 0.15) }], { top: false });
    recessedColumn(a, sq(h - 0.15), mid + 0.35, cb.top, blind(mid + 0.35, cb.top));
    ctx.report.cornerButtresses.push({ tower: t.id, x: +px.toFixed(2), z: +pz.toFixed(2), size: cb.size, topSize: +(cb.size - 0.3).toFixed(2) });
  }
  a.tone = 1.0;
}
