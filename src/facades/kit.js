// src/facades/kit.js — 立面模組共用的幾何工具（掃掠、尖拱、平板窗花、合併批次）
// 局部座標慣例（「牆面座標」）：X = 往牆內的深度（正值往內），Y = 上，Z = 沿牆面的橫向。
// 西立面的世界座標本身就是這個慣例（x 往東 = 往牆內）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// -----------------------------------------------------------------------------
// 矩陣小工具
// -----------------------------------------------------------------------------
export const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
export const S = (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z);
export const Ry = (a) => new THREE.Matrix4().makeRotationY(a);
export const Rx = (a) => new THREE.Matrix4().makeRotationX(a);
export const Rz = (a) => new THREE.Matrix4().makeRotationZ(a);
export const I = () => new THREE.Matrix4();
/** mul(A, B, C) = A·B·C（右邊先作用） */
export function mul(...ms) {
  const r = new THREE.Matrix4();
  for (const m of ms) if (m) r.multiply(m);
  return r;
}
/** 牆面座標 → 世界：原點 (ox,oy,oz)，inward = 往牆內的水平單位向量 [dx,dz] */
export function frame(ox, oy, oz, dx, dz) {
  const m = new THREE.Matrix4();
  m.makeBasis(V(dx, 0, dz), V(0, 1, 0), V(-dz, 0, dx));
  m.setPosition(ox, oy, oz);
  return m;
}
/** 平板（Shape 的 s=橫向、t=上，往 +Z 擠出）→ 牆面座標（擠出方向 = 深度 X，從 x0 開始） */
export function plateM(x0 = 0) {
  const m = new THREE.Matrix4();
  m.makeBasis(V(0, 0, 1), V(0, 1, 0), V(1, 0, 0));
  m.setPosition(x0, 0, 0);
  return m;
}
/** 鏡射橫向（Z） */
export const mirrorZ = () => S(1, 1, -1);

// -----------------------------------------------------------------------------
// 批次：依材質收集幾何，最後合併成少量網格
// -----------------------------------------------------------------------------
function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (az >= ay) uv.setXY(i, p.getX(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getZ(i));
  }
}

/** 鏡射矩陣（行列式 < 0）會反轉三角形繞向；法線已由法線矩陣正確轉換，所以把繞向翻回來 */
export function applyM(g, m) {
  g.applyMatrix4(m);
  if (m.determinant() < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
  }
  return g;
}

export function prep(src, matrix, uvMode = 'box') {
  const g = new THREE.BufferGeometry();
  const pos = src.getAttribute('position');
  g.setAttribute('position', pos.clone());
  const nrm = src.getAttribute('normal');
  if (nrm) g.setAttribute('normal', nrm.clone());
  const uv = src.getAttribute('uv');
  g.setAttribute('uv', uv && uvMode !== 'box' ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  else g.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: pos.count }, (_, i) => i), 1));
  if (!nrm) g.computeVertexNormals();
  if (matrix) applyM(g, matrix);
  if (uvMode === 'box') boxUV(g);
  return g;
}

export class Batch {
  constructor(name) { this.name = name; this.parts = new Map(); this.tris = 0; }
  /** key = 材質鍵；uv: 'box'（世界投影，公尺）或 'keep'（幾何自帶的公尺 UV） */
  add(key, geo, matrix = null, uv = 'box') {
    const g = prep(geo, matrix, uv);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return g;
  }
  /** 把同一個樣板放到多個矩陣（合併成一個幾何再加入） */
  addMany(key, geo, matrices, uv = 'box') {
    if (!matrices.length) return;
    const list = matrices.map((m) => prep(geo, m, uv));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(...list);
  }
  toGroup(mats) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [key, list] of [...this.parts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      // 分塊合併，避免單一緩衝過大
      const chunks = [];
      let cur = [], verts = 0;
      for (const g of list) {
        cur.push(g); verts += g.attributes.position.count;
        if (verts > 600000) { chunks.push(cur); cur = []; verts = 0; }
      }
      if (cur.length) chunks.push(cur);
      chunks.forEach((c, i) => {
        const merged = mergeGeometries(c, false);
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mats[key]);
        mesh.name = `${this.name}/${key}${chunks.length > 1 ? i : ''}`;
        mesh.castShadow = key !== 'glass';
        mesh.receiveShadow = true;
        group.add(mesh);
      });
    }
    return group;
  }
}

// -----------------------------------------------------------------------------
// 掃掠：strips = 多條剖面折線（每條內部平滑、條與條之間為銳角）
// at(i, a, b) → [x,y,z]：第 i 列（沿路徑）、剖面座標 (a,b)
// -----------------------------------------------------------------------------
export function sweep(strips, rows, at) {
  const pos = [], uv = [], idx = [];
  for (const s of strips) {
    const m = s.length;
    if (m < 2) continue;
    const base = pos.length / 3;
    const vacc = [0];
    for (let j = 1; j < m; j++) vacc[j] = vacc[j - 1] + Math.hypot(s[j][0] - s[j - 1][0], s[j][1] - s[j - 1][1]);
    let uacc = 0, prev = null;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < m; j++) {
        const p = at(i, s[j][0], s[j][1], j);
        if (j === 0) { if (prev) uacc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]); prev = p; }
        pos.push(p[0], p[1], p[2]);
        uv.push(uacc, vacc[j]);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = base + i * m + j, b = a + m;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 剖面輔助：圓弧點（中心 cx,cy，半徑 r，角度 a0→a1，n 段） */
export function arcPts(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

/**
 * 尖拱帶（左右兩半 + 起拱線以下的直段）。剖面 (r, d)：r = 徑向往外（往實牆），d = 深度（往牆內）。
 * span/spring = 中心線的跨度與起拱高；R = 圓弧半徑（等邊尖拱 R = span；半圓拱 R = span/2）。
 * 每個剖面點各自算拱頂的交會角，兩半在中線剛好密合。
 */
export function archBand(strips, { span, spring, x0 = 0, yStart = null, R = null, n = 40, mod = null }) {
  R = R ?? span;
  const cz = R - span / 2; // 左半弧圓心（橫向）
  const y0 = yStart ?? spring;
  const parts = [];
  const left = sweep(strips, n + 1, (i, r, d) => {
    const rho = R + r;
    const te = Math.acos(Math.max(-1, Math.min(1, -cz / rho)));
    const ts = y0 > spring ? PI - Math.asin(Math.min(1, (y0 - spring) / rho)) : PI;
    const t = i / n;
    const th = ts + (te - ts) * t;
    let dz = 0, dd = 0;
    if (mod) [dz, dd] = mod(t, r, d);
    const rr = rho + dz;
    return [x0 + d + dd, spring + rr * Math.sin(th), cz + rr * Math.cos(th)];
  });
  parts.push(left);
  if (y0 < spring - 1e-3) {
    parts.push(sweep(strips, 2, (i, r, d) => [x0 + d, i === 0 ? y0 : spring, -(span / 2 + r)]));
  }
  const half = parts.length > 1 ? mergeGeometries(parts, false) : left;
  const right = applyM(half.clone(), mirrorZ());
  return mergeGeometries([half, right], false);
}

/** 完整圓環掃掠（玫瑰窗框）：圓心 (cz, cy)、半徑 R0，剖面 (r, d) */
export function ringBand(strips, { cz = 0, cy = 0, R0, x0 = 0, n = 96, a0 = 0, a1 = 2 * PI }) {
  return sweep(strips, n + 1, (i, r, d) => {
    const a = a0 + (a1 - a0) * (i / n);
    return [x0 + d, cy + (R0 + r) * Math.sin(a), cz + (R0 + r) * Math.cos(a)];
  });
}

/**
 * 平面折線掃掠（水平線腳）：pts = [[x,z],…]，往外法線 = 行進方向的左側 (-tz, tx)。
 * 剖面 (o, h)：o = 往外、h = 往上。轉角斜接（miter），轉角為銳角邊。
 */
export function planSweep(pts, y0, strips, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts;
  const nseg = P.length - 1;
  const normals = [];
  for (let k = 0; k < nseg; k++) {
    const dx = P[k + 1][0] - P[k][0], dz = P[k + 1][1] - P[k][1];
    const L = Math.hypot(dx, dz);
    normals.push([-dz / L, dx / L]);
  }
  const miter = (k) => { // 頂點 k 的斜接向量
    let a, b;
    if (k === 0) { if (!closed) return normals[0]; a = normals[nseg - 1]; b = normals[0]; }
    else if (k === nseg) { if (!closed) return normals[nseg - 1]; a = normals[nseg - 1]; b = normals[0]; }
    else { a = normals[k - 1]; b = normals[k]; }
    const dot = a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / (1 + dot), (a[1] + b[1]) / (1 + dot)];
  };
  const geos = [];
  for (let k = 0; k < nseg; k++) {
    const m0 = miter(k), m1 = miter(k + 1);
    geos.push(sweep(strips, 2, (i, o, h) => {
      const p = P[k + i], m = i === 0 ? m0 : m1;
      return [p[0] + m[0] * o, y0 + h, p[1] + m[1] * o];
    }));
  }
  return mergeGeometries(geos, false);
}

// -----------------------------------------------------------------------------
// 2D 輪廓
// -----------------------------------------------------------------------------
/** 尖拱輪廓點（左起拱 → 拱頂 → 右起拱），可指定底部 yBottom 加直段。R 預設等邊。 */
export function archPts(span, spring, { n = 24, R = null, yBottom = null, cx = 0, off = 0 } = {}) {
  R = R ?? span;
  const cz = R - span / 2;
  const rho = R + off;
  const te = Math.acos(Math.max(-1, Math.min(1, -cz / rho)));
  const left = [];
  if (yBottom !== null && yBottom < spring) left.push([cx - cz - rho, yBottom]);
  for (let i = 0; i <= n; i++) {
    const th = PI + (te - PI) * (i / n);
    left.push([cx + cz + rho * Math.cos(th), spring + rho * Math.sin(th)]);
  }
  const right = left.slice(0, -1).reverse().map(([z, y]) => [2 * cx - z, y]);
  return [...left, ...right];
}

/** 尖拱在高度 y 的半寬（中心線，等邊或指定 R） */
export function archHalfWidth(span, spring, y, R = null, off = 0) {
  R = R ?? span;
  const cz = R - span / 2, rho = R + off;
  if (y <= spring) return span / 2 + off;
  const dy = y - spring;
  if (dy >= rho) return 0;
  return Math.max(0, Math.sqrt(rho * rho - dy * dy) - cz);
}

/** 帶尖瓣（cusp）的尖拱：在拱腹 1/3、2/3 處往內長出尖角，成三葉形拱頭 */
export function cuspedArchPts(span, spring, { n = 36, yBottom = null, cx = 0, cusp = 0.12, R = null } = {}) {
  R = R ?? span;
  const cz = R - span / 2;
  const te = Math.acos(-cz / R);
  const pts = [];
  if (yBottom !== null && yBottom < spring) pts.push([cx - span / 2, yBottom]);
  const bump = (t) => Math.pow(Math.max(0, 1 - Math.abs(t)), 1.6);
  const total = 2 * n;
  for (let k = 0; k <= total; k++) {
    const s = k / total;
    const left = s <= 0.5;
    const t = left ? s * 2 : (1 - s) * 2;
    const th = PI + (te - PI) * t;
    const ccz = left ? cx + cz : cx - cz;
    const sx = left ? 1 : -1;
    const px = ccz + sx * R * Math.cos(th) * (left ? 1 : 1);
    // 左半：圓心在 cx+cz，點 = 圓心 + R(cos,sin)；右半鏡射
    const z = left ? cx + cz + R * Math.cos(th) : cx - cz - R * Math.cos(th);
    const y = spring + R * Math.sin(th);
    const delta = cusp * (bump((s - 1 / 3) / 0.15) + bump((s - 2 / 3) / 0.15));
    const nz = (left ? cx + cz : cx - cz) - z, ny = spring - y; // 往圓心
    const L = Math.hypot(nz, ny) || 1;
    void px;
    pts.push([z + (nz / L) * delta, y + (ny / L) * delta]);
  }
  if (yBottom !== null && yBottom < spring) pts.push([cx + span / 2, yBottom]);
  return pts;
}

/** n 瓣葉形（foil）極座標輪廓：瓣中心 r = R，瓣間尖角 r = R(1-depth) */
export function foilPts(nLobes, R, depth, { rot = 0, seg = 96, cx = 0, cy = 0, p = 0.55 } = {}) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * 2 * PI;
    const c = Math.abs(Math.cos((nLobes * (a - rot)) / 2));
    const r = R * (1 - depth * (1 - Math.pow(c, p)));
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
export function circlePts(R, seg = 48, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) { const a = (i / seg) * 2 * PI; out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  return out;
}

/** 由點陣列建立 Shape（點需為逆時針或順時針皆可，THREE 會處理） */
export function shapeOf(outer, holes = []) {
  const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}
export function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4, steps: 1 });
}
/** 平板：輪廓 + 孔，厚 depth，放在牆面座標深度 x0 起 */
export function plate(outer, holes, depth, x0 = 0) {
  return applyM(prep(extrude(shapeOf(outer, holes), depth), null, 'keep'), plateM(x0));
}

// -----------------------------------------------------------------------------
// 基本件
// -----------------------------------------------------------------------------
export function box(w, h, d, x = 0, y = 0, z = 0) {
  // w = 深度(X), h = 高(Y), d = 橫向(Z)；(x,y,z) = 最小角
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x + w / 2, y + h / 2, z + d / 2);
  return g;
}
export function cyl(r0, r1, h, seg = 8, y = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, false);
  g.translate(0, y + h / 2, 0);
  return g;
}
/** 細柱：柱礎 + 柱身 + 葉形柱頭 + 柱頂板（沿 +Y，底在 0） */
const colCache = new Map();
export function colonnette(r, h, seg = 8) {
  const key = `${r.toFixed(3)}|${h.toFixed(3)}|${seg}`;
  if (colCache.has(key)) return colCache.get(key);
  const baseH = Math.min(0.25, h * 0.08), capH = Math.min(r * 3.2, h * 0.15);
  const parts = [
    cyl(r * 1.55, r * 1.45, baseH * 0.45, seg, 0),
    cyl(r * 1.45, r * 1.05, baseH * 0.55, seg, baseH * 0.45),
    cyl(r, r, h - baseH - capH, seg, baseH),
    cyl(r * 1.0, r * 1.7, capH * 0.8, seg, h - capH),
    box(r * 3.6, capH * 0.2, r * 3.6, -r * 1.8, h - capH * 0.2, -r * 1.8),
  ].map((g) => prep(g, null));
  const g = mergeGeometries(parts, false);
  colCache.set(key, g);
  return g;
}

/** 管：沿 3D 點列 */
export function tube(pts, radius, radial = 4, segs = null) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segs ?? Math.max(4, pts.length * 2), radius, radial, false);
}

/** 捲葉飾（crocket）：一顆往外捲的葉球，沿 +Y 長、往 +X 捲 */
let crocketGeo = null;
export function crocket() {
  if (crocketGeo) return crocketGeo;
  const leaf = new THREE.SphereGeometry(1, 6, 4);
  leaf.scale(0.05, 0.11, 0.12);
  leaf.rotateZ(-0.5);
  leaf.translate(0.05, 0.1, 0);
  const curl = new THREE.SphereGeometry(1, 5, 3);
  curl.scale(0.06, 0.045, 0.08);
  curl.translate(0.12, 0.17, 0);
  const stem = cyl(0.035, 0.03, 0.12, 5, 0);
  crocketGeo = mergeGeometries([prep(leaf), prep(curl), prep(stem)], false);
  return crocketGeo;
}

/** 頂飾（finial）：葉形十字花，底在 0，沿 +Y */
let finialGeo = null;
export function finial(scale = 1) {
  if (!finialGeo) {
    const parts = [cyl(0.07, 0.06, 0.35, 6, 0), cyl(0.06, 0.16, 0.12, 6, 0.3), cyl(0.16, 0.02, 0.45, 6, 0.42)];
    for (let k = 0; k < 4; k++) {
      const l = new THREE.SphereGeometry(1, 5, 3); l.scale(0.14, 0.07, 0.07); l.translate(0.13, 0.42, 0); l.rotateY((k * PI) / 2);
      parts.push(l);
    }
    finialGeo = mergeGeometries(parts.map((g) => prep(g)), false);
  }
  return scale === 1 ? finialGeo : finialGeo.clone().applyMatrix4(S(scale));
}

export { mergeGeometries };
