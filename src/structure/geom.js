// src/structure/geom.js — 結構模組的幾何工具（平面多邊形擠出、開洞、放樣）
// 全部輸出非索引三角形、平面法線、公尺 UV（牆面 U 水平、V 往上；水平面 U=x、V=z）
// 以及頂點色（作為材質的明暗微調）。
import * as THREE from 'three';

const V2 = (u, v) => new THREE.Vector2(u, v);

/** 自動 UV：近水平面 → (x, z)；其他 → (沿水平切線, y) */
function autoUV(p, n) {
  if (Math.abs(n[1]) > 0.75) return [p[0], p[2]];
  let tx = n[2], tz = -n[0];
  const l = Math.hypot(tx, tz) || 1;
  tx /= l; tz /= l;
  return [p[0] * tx + p[2] * tz, p[1]];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 2D 多邊形有號面積（>0 = 逆時針） */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
const ccw = (pts) => (signedArea(pts) < 0 ? pts.slice().reverse() : pts);

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = [];
    this.tone = 1;      // 目前的明暗係數（乘上高度漸層）
    this.shade = 1;     // 局部陰影（洞底等）
  }

  _vcol(p) {
    // 地面附近略暗（濺污）、高處略亮
    const ground = 1 - 0.16 * Math.exp(-p[1] / 3.5);
    const c = Math.max(0, Math.min(1.2, this.tone * this.shade * ground));
    return c;
  }

  /** 三角形；want = 期望的法線方向（用來決定繞序） */
  tri(a, b, c, want) {
    let n = cross(sub(b, a), sub(c, a));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-10) return;
    if (want && dot(n, want) < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
    n = norm(n);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      const uv = autoUV(p, n);
      this.uv.push(uv[0], uv[1]);
      const k = this._vcol(p);
      this.col.push(k, k, k);
    }
  }

  quad(a, b, c, d, want) { this.tri(a, b, c, want); this.tri(a, c, d, want); }

  get triCount() { return this.pos.length / 9; }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// -----------------------------------------------------------------------------
// 框架：平面 = (水平方向 u, 垂直 y)，擠出方向 n（水平）。
// map(u, v, d) = o + u·u + d·n，y = v
// -----------------------------------------------------------------------------
export function frame(o, u, n) {
  const ul = Math.hypot(u[0], u[1]), nl = Math.hypot(n[0], n[1]);
  u = [u[0] / ul, u[1] / ul]; n = [n[0] / nl, n[1] / nl];
  return {
    o, u, n,
    map: (uu, v, d) => [o[0] + u[0] * uu + n[0] * d, v, o[1] + u[1] * uu + n[1] * d],
    dir: (du, dv) => [u[0] * du, dv, u[1] * du], // 平面內方向 → 3D
    n3: [n[0], 0, n[1]],
  };
}

/** 平面多邊形（含洞）在深度 d 的一面，法線 = sign·n */
export function planarFace(mb, F, outline, holes, d, sign) {
  const contour = outline.map((p) => V2(p[0], p[1]));
  const hs = holes.map((h) => h.map((p) => V2(p[0], p[1])));
  const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
  const all = [...outline, ...holes.flat()];
  const want = [F.n3[0] * sign, 0, F.n3[2] * sign];
  for (const [i, j, k] of faces) {
    mb.tri(F.map(all[i][0], all[i][1], d), F.map(all[j][0], all[j][1], d), F.map(all[k][0], all[k][1], d), want);
  }
}

/** 沿多邊形邊、從深度 d0 到 d1 的側壁；outward = true 法線朝多邊形外，否則朝內（洞的側壁） */
export function ring(mb, F, pts, d0, d1, outward, skip) {
  const P = ccw(pts);
  for (let i = 0; i < P.length; i++) {
    if (skip && skip(P[i], P[(i + 1) % P.length])) continue;
    const a = P[i], b = P[(i + 1) % P.length];
    const du = b[0] - a[0], dv = b[1] - a[1];
    // 逆時針多邊形：邊的外法線 = (dv, -du)
    let w = F.dir(dv, -du);
    if (!outward) w = [-w[0], -w[1], -w[2]];
    mb.quad(F.map(a[0], a[1], d0), F.map(b[0], b[1], d0), F.map(b[0], b[1], d1), F.map(a[0], a[1], d1), w);
  }
}

/**
 * 有厚度的平板（牆、扶壁斷面擠出…），正面在 dFront（法線 +n），背面在 dBack。
 * holes: [{ pts, depth?, through?, cap?: MeshBuilder, capShade?, children? }]
 *   through：貫穿（背面也開洞）；否則開到 depth 深，洞底封一面（cap 指定用哪個 builder）。
 */
export function slab(mb, F, outline, dFront, dBack, holes = [], opts = {}) {
  outline = ccw(outline);
  const top = holes.map((h) => h.pts);
  planarFace(mb, F, outline, top, dFront, +1);
  if (opts.back !== false) planarFace(mb, F, outline, holes.filter((h) => h.through).map((h) => h.pts), dBack, -1);
  if (opts.edges !== false) ring(mb, F, outline, dFront, dBack, true, opts.skipEdge);
  for (const h of holes) cutHole(mb, F, h, dFront, dBack);
}

function cutHole(mb, F, h, d0, dBack) {
  const dEnd = h.through ? dBack : d0 - h.depth;
  const saved = mb.shade;
  mb.shade = saved * (h.revealShade ?? 0.9);
  ring(mb, F, h.pts, d0, dEnd, false);
  mb.shade = saved;
  if (!h.through) {
    const cap = h.cap || mb;
    const s2 = cap.shade;
    cap.shade = s2 * (h.capShade ?? 0.85);
    const kids = h.children || [];
    planarFace(cap, F, ccw(h.pts), kids.map((k) => k.pts), dEnd, +1);
    cap.shade = s2;
    for (const k of kids) cutHole(mb, F, k, dEnd, dBack);
  }
}

// -----------------------------------------------------------------------------
// 洞口輪廓（2D，u 水平、v 往上；回傳逆時針）
// -----------------------------------------------------------------------------
/** 等邊（或指定半徑）尖拱：中心 uc、寬 w、底 v0、拱頂 apex */
export function archPts(uc, w, v0, apex, seg = 10) {
  const r = w;                                   // 等邊尖拱：半徑 = 跨度（與 layout.pointedArch 相同）
  const rise = w * Math.sqrt(3) / 2;
  let spring = apex - rise;
  const pts = [[uc - w / 2, v0], [uc + w / 2, v0]];
  if (spring < v0) spring = v0;                  // 太矮的洞直接從底部起拱
  // 右側：圓心在左起拱點 (uc - w/2)，由 0° 掃到 60°
  const a1 = Math.asin(Math.min(1, (apex - spring) / r));
  pts.push([uc + w / 2, spring]);
  for (let i = 1; i < seg; i++) {
    const a = (a1 * i) / seg;
    pts.push([uc - w / 2 + r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  pts.push([uc, apex]);
  for (let i = seg - 1; i >= 1; i--) {
    const a = (a1 * i) / seg;
    pts.push([uc + w / 2 - r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  pts.push([uc - w / 2, spring]);
  return dedupe(pts);
}

export function circlePts(uc, vc, r, seg = 32) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2 - Math.PI / 2;
    pts.push([uc + r * Math.cos(a), vc + r * Math.sin(a)]);
  }
  return pts;
}

export function rectPts(u0, u1, v0, v1) { return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; }

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
  return out;
}

// -----------------------------------------------------------------------------
// 沿 Y 放樣：levels = [{ y, foot: [[x,z]…] }]，各層頂點數相同（逆時針俯視 x→z 不拘）
// -----------------------------------------------------------------------------
export function stackY(mb, levels, { top = true, bottom = false } = {}) {
  const fix = (f) => {
    // 確保俯視 (x, z) 為同一繞向
    const a = signedArea(f);
    return a < 0 ? f.slice().reverse() : f;
  };
  const L = levels.map((l) => ({ y: l.y, f: fix(l.foot) }));
  for (let k = 0; k < L.length - 1; k++) {
    const A = L[k], B = L[k + 1];
    const n = A.f.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = [A.f[i][0], A.y, A.f[i][1]], a1 = [A.f[j][0], A.y, A.f[j][1]];
      const b0 = [B.f[i][0], B.y, B.f[i][1]], b1 = [B.f[j][0], B.y, B.f[j][1]];
      // (x,z) 平面有號面積 >0：邊 (dx,dz) 的外法線 = (dz, -dx)
      const dx = A.f[j][0] - A.f[i][0], dz = A.f[j][1] - A.f[i][1];
      const w = [dz, 0, -dx];
      mb.quad(a0, a1, b1, b0, w);
    }
  }
  const capF = (lv, up) => {
    const contour = lv.f.map((p) => V2(p[0], p[1]));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [i, j, k] of faces) {
      mb.tri([lv.f[i][0], lv.y, lv.f[i][1]], [lv.f[j][0], lv.y, lv.f[j][1]], [lv.f[k][0], lv.y, lv.f[k][1]], [0, up ? 1 : -1, 0]);
    }
  };
  if (top) capF(L[L.length - 1], true);
  if (bottom) capF(L[0], false);
}

/** 以中心、徑向方向、寬（切向）、深（徑向）求矩形平面 */
export function orientedRect(cx, cz, dirX, dirZ, width, depth, rOff = 0) {
  const l = Math.hypot(dirX, dirZ);
  const rx = dirX / l, rz = dirZ / l;      // 徑向
  const tx = -rz, tz = rx;                 // 切向
  const r0 = -depth / 2 + rOff, r1 = depth / 2 + rOff;
  const w = width / 2;
  return [
    [cx + rx * r0 - tx * w, cz + rz * r0 - tz * w],
    [cx + rx * r1 - tx * w, cz + rz * r1 - tz * w],
    [cx + rx * r1 + tx * w, cz + rz * r1 + tz * w],
    [cx + rx * r0 + tx * w, cz + rz * r0 + tz * w],
  ];
}

export function regularPoly(cx, cz, r, n, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
}

/** 軸對齊方塊 */
export function box(mb, x0, x1, y0, y1, z0, z1, { top = true, bottom = false } = {}) {
  const f = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  stackY(mb, [{ y: y0, foot: f }, { y: y1, foot: f }], { top, bottom });
}

/**
 * 直立柱體，每個側面可開淺洞（盲拱）：footprint 俯視逆時針；holesFor(i, len) 回傳該面洞口（u 沿邊、v = y）
 */
export function recessedColumn(mb, footprint, y0, y1, holesFor, { top = true } = {}) {
  const f = signedArea(footprint) < 0 ? footprint.slice().reverse() : footprint;
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const F = frame(a, [dx, dz], [dz, -dx]);
    const holes = holesFor ? holesFor(i, len) : [];
    slab(mb, F, rectPts(0, len, y0, y1), 0, -0.01, holes, { back: false, edges: false });
  }
  if (top) stackY(mb, [{ y: y1, foot: f }, { y: y1, foot: f }], { top: true }); // 只有頂蓋（側面退化被略過）
}
