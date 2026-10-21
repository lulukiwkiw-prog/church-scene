// src/environment/geom.js — 環境模組的幾何工具（第 5 號分身專用）
// 所有幾何以「非索引三角形」累積在 Geo 裡，最後依材質合併成少數幾個 Mesh。
// UV 一律 1 單位 = 1 公尺。
import * as THREE from 'three';

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 三角形累積器 */
export class Geo {
  constructor(colored = false) {
    this.pos = []; this.nor = []; this.uv = [];
    this.col = colored ? [] : null;
    this.c = [1, 1, 1];
  }
  setColor(r, g, b) { this.c = [r, g, b]; }
  v(p, n, t) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(t[0], t[1]);
    if (this.col) this.col.push(this.c[0], this.c[1], this.c[2]);
  }
  /** 平面三角形；out 給定時自動翻轉成法線朝 out */
  tri(a, b, c, ta, tb, tc, out) {
    let n = cross(sub(b, a), sub(c, a));
    if (out && dot(n, out) < 0) { [b, c] = [c, b]; [tb, tc] = [tc, tb]; n = scl(n, -1); }
    n = norm(n);
    this.v(a, n, ta); this.v(b, n, tb); this.v(c, n, tc);
  }
  quad(a, b, c, d, ta, tb, tc, td, out) { this.tri(a, b, c, ta, tb, tc, out); this.tri(a, c, d, ta, tc, td, out); }
  /** 平滑法線三角形（呼叫者負責順序） */
  triN(a, b, c, na, nb, nc, ta, tb, tc) { this.v(a, na, ta); this.v(b, nb, tb); this.v(c, nc, tc); }
  get count() { return this.pos.length / 9; }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * 依「群組/材質」分桶。key 形如 'buildings/zincRoof'；材質名稱後加 ':vc' 代表頂點色變體。
 */
export class Buckets {
  constructor() { this.map = new Map(); }
  get(part, mat) {
    const key = `${part}/${mat}`;
    if (!this.map.has(key)) this.map.set(key, new Geo(mat.endsWith(':vc')));
    return this.map.get(key);
  }
  emit(group, materials, variant, opts = {}) {
    for (const [key, geo] of this.map) {
      if (geo.count === 0) continue;
      const mat = key.slice(key.indexOf('/') + 1);
      const material = mat.endsWith(':vc') ? variant(mat.slice(0, -3), { vertexColors: true }) : materials[mat];
      const mesh = new THREE.Mesh(geo.toGeometry(), material);
      mesh.name = `environment/${key}`;
      const o = opts[key] || opts[mat];
      if (o) Object.assign(mesh, o);
      group.add(mesh);
    }
  }
}

// -----------------------------------------------------------------------------
// 座標框架：local (a, b, c) → world = o + a*ax + b*ay + c*az
// -----------------------------------------------------------------------------
export const frame = (o, ax, ay, az) => ({ o, ax, ay, az });
export const ID = frame([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
/** 繞 Y 旋轉的框架；ang 為 a 軸在 xz 平面的角度（a = (cos, 0, sin)） */
export const yFrame = (x, y, z, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return frame([x, y, z], [c, 0, s], [0, 1, 0], [-s, 0, c]);
};
/** 立面框架：o 在牆角，u 沿牆（dir），v 向上，c 向外（out） */
export const P = (f, a, b, c) => [
  f.o[0] + a * f.ax[0] + b * f.ay[0] + c * f.az[0],
  f.o[1] + a * f.ax[1] + b * f.ay[1] + c * f.az[1],
  f.o[2] + a * f.ax[2] + b * f.ay[2] + c * f.az[2],
];
export const D = (f, a, b, c) => [
  a * f.ax[0] + b * f.ay[0] + c * f.az[0],
  a * f.ax[1] + b * f.ay[1] + c * f.az[1],
  a * f.ax[2] + b * f.ay[2] + c * f.az[2],
];

/** 框架內的長方體；skip = { a0, a1, b0, b1, c0, c1 } 省略某面 */
export function fbox(g, f, a0, a1, b0, b1, c0, c1, skip = {}) {
  const p = (a, b, c) => P(f, a, b, c);
  if (!skip.a1) g.quad(p(a1, b0, c0), p(a1, b0, c1), p(a1, b1, c1), p(a1, b1, c0), [c0, b0], [c1, b0], [c1, b1], [c0, b1], f.ax);
  if (!skip.a0) g.quad(p(a0, b0, c0), p(a0, b0, c1), p(a0, b1, c1), p(a0, b1, c0), [c0, b0], [c1, b0], [c1, b1], [c0, b1], scl(f.ax, -1));
  if (!skip.b1) g.quad(p(a0, b1, c0), p(a1, b1, c0), p(a1, b1, c1), p(a0, b1, c1), [a0, c0], [a1, c0], [a1, c1], [a0, c1], f.ay);
  if (!skip.b0) g.quad(p(a0, b0, c0), p(a1, b0, c0), p(a1, b0, c1), p(a0, b0, c1), [a0, c0], [a1, c0], [a1, c1], [a0, c1], scl(f.ay, -1));
  if (!skip.c1) g.quad(p(a0, b0, c1), p(a1, b0, c1), p(a1, b1, c1), p(a0, b1, c1), [a0, b0], [a1, b0], [a1, b1], [a0, b1], f.az);
  if (!skip.c0) g.quad(p(a0, b0, c0), p(a1, b0, c0), p(a1, b1, c0), p(a0, b1, c0), [a0, b0], [a1, b0], [a1, b1], [a0, b1], scl(f.az, -1));
}
/** 世界軸向長方體 */
export const box = (g, x0, x1, y0, y1, z0, z1, skip) => fbox(g, ID, x0, x1, y0, y1, z0, z1, skip);

/** 框架內 (a,b) 平面上的多邊形（可有洞），位於 c，法線朝 sign*az；UV = (a,b) */
export function fpoly(g, f, outer, holes = [], c = 0, sign = 1, uvf = null) {
  const v2 = (pts) => pts.map(([a, b]) => new THREE.Vector2(a, b));
  const tris = THREE.ShapeUtils.triangulateShape(v2(outer), holes.map(v2));
  const all = [...outer, ...holes.flat()];
  const out = scl(f.az, sign);
  for (const [i, j, k] of tris) {
    const A = all[i], B = all[j], C = all[k];
    const uv = uvf || ((q) => q);
    g.tri(P(f, A[0], A[1], c), P(f, B[0], B[1], c), P(f, C[0], C[1], c), uv(A), uv(B), uv(C), out);
  }
}
const GROUND = frame([0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
/** 水平地面多邊形 [[x,z]...]，UV = (x, z) */
export const groundPoly = (g, outer, holes, y) => fpoly(g, GROUND, outer, holes, y, 1);
export const groundRect = (g, x0, x1, z0, z1, y) => groundPoly(g, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [], y);

const signedArea = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % pts.length]; s += a * d - c * b; } return s / 2; };

/** 把 (a,b) 多邊形沿 c 擠出 c0..c1；側面 UV = (c, 周長) */
export function extrude(g, f, pts, c0, c1, { caps = true, sides = true } = {}) {
  if (caps) { fpoly(g, f, pts, [], c0, -1); fpoly(g, f, pts, [], c1, 1); }
  if (!sides) return;
  const ccw = signedArea(pts) > 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    const da = B[0] - A[0], db = B[1] - A[1], l = Math.hypot(da, db);
    if (l < 1e-6) continue;
    const n = ccw ? [db, -da] : [-db, da];
    const out = D(f, n[0], n[1], 0);
    g.quad(P(f, A[0], A[1], c0), P(f, B[0], B[1], c0), P(f, B[0], B[1], c1), P(f, A[0], A[1], c1), [c0, s], [c0, s + l], [c1, s + l], [c1, s], out);
    s += l;
  }
}

/**
 * 旋轉體。profile = [[r, y]...]，由外下往上、往內收（實體在左側）。
 * segs 段，phase 起始角。UV：U = 角度 × 半徑，V = 剖面長度。
 */
export function lathe(g, cx, cy, cz, profile, segs, phase = 0) {
  let vacc = [0];
  for (let k = 1; k < profile.length; k++) vacc.push(vacc[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
  for (let j = 0; j < segs; j++) {
    const t0 = phase + (j / segs) * Math.PI * 2, t1 = phase + ((j + 1) / segs) * Math.PI * 2, tm = (t0 + t1) / 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    for (let k = 0; k < profile.length - 1; k++) {
      const [ra, ya] = profile[k], [rb, yb] = profile[k + 1];
      const dr = rb - ra, dy = yb - ya;
      const out = [dy * Math.cos(tm), -dr, dy * Math.sin(tm)];
      const pa0 = [cx + ra * c0, cy + ya, cz + ra * s0], pa1 = [cx + ra * c1, cy + ya, cz + ra * s1];
      const pb0 = [cx + rb * c0, cy + yb, cz + rb * s0], pb1 = [cx + rb * c1, cy + yb, cz + rb * s1];
      const ua0 = t0 * ra, ua1 = t1 * ra, ub0 = t0 * rb, ub1 = t1 * rb;
      if (ra > 1e-6 && rb > 1e-6) g.quad(pa0, pa1, pb1, pb0, [ua0, vacc[k]], [ua1, vacc[k]], [ub1, vacc[k + 1]], [ub0, vacc[k + 1]], out);
      else if (ra > 1e-6) g.tri(pa0, pa1, pb0, [ua0, vacc[k]], [ua1, vacc[k]], [ub0, vacc[k + 1]], out);
      else if (rb > 1e-6) g.tri(pa0, pb1, pb0, [ua0, vacc[k]], [ub1, vacc[k + 1]], [ub0, vacc[k + 1]], out);
    }
  }
}

/** 四角錐（頂點在上），底為框架內 a0..a1 × c0..c1、高 b0..b1 */
export function fpyramid(g, f, a0, a1, c0, c1, b0, b1) {
  const am = (a0 + a1) / 2, cm = (c0 + c1) / 2;
  const apex = P(f, am, b1, cm);
  const ring = [[a0, c0], [a1, c0], [a1, c1], [a0, c1]];
  const ctr = P(f, am, (b0 + b1) / 2, cm);
  for (let i = 0; i < 4; i++) {
    const [pa, pc] = ring[i], [qa, qc] = ring[(i + 1) % 4];
    const A = P(f, pa, b0, pc), B = P(f, qa, b0, qc);
    const mid = scl(add(A, B), 0.5);
    g.tri(A, B, apex, [0, 0], [Math.hypot(qa - pa, qc - pc), 0], [Math.hypot(qa - pa, qc - pc) / 2, b1 - b0], sub(mid, ctr));
  }
}
