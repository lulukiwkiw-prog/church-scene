// src/roofs/geom.js — 屋頂模組共用的幾何累積器與小零件（3 號分身專用）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _bt = new THREE.Vector3();

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** 平移 + 繞 Y 旋轉 + 縮放 */
export function T(x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().makeRotationY(rotY);
  m.scale(new THREE.Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}

/** 以三軸（已正交）與原點組成矩陣，軸長即縮放 */
export function basis(o, x, y, z) {
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(o);
  return m;
}

/** 依面法線做「1 單位 = 1 公尺」的平面投影 UV：U 水平沿面、V 沿面往上（屋頂即往屋脊） */
export function planarUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _c.fromBufferAttribute(p, i + 2);
    _n.subVectors(_c, _b).cross(_t.subVectors(_a, _b)).normalize();
    if (_n.lengthSq() < 0.5) _n.set(0, 1, 0);
    if (Math.abs(_n.y) > 0.999) _t.set(1, 0, 0);
    else _t.crossVectors(UP, _n).normalize();
    _bt.crossVectors(_n, _t);
    if (_bt.y < 0 || (Math.abs(_bt.y) < 1e-6 && _bt.z < 0)) _bt.negate();
    for (let k = 0; k < 3; k++) {
      _a.fromBufferAttribute(p, i + k);
      uv[(i + k) * 2] = _a.dot(_t);
      uv[(i + k) * 2 + 1] = _a.dot(_bt);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** 幾何累積器：收集三角形與基本幾何，最後合併成一個非索引幾何（位置、法線、UV、可選頂點色） */
export class Acc {
  constructor({ colors = false } = {}) {
    this.colors = colors;
    this.color = [1, 1, 1];
    this.geos = [];
    this.pos = []; this.nrm = []; this.col = [];
  }
  setColor(c) { this.color = typeof c === 'number' ? [c, c, c] : c; return this; }

  /** 單一三角形（平面法線） */
  tri(a, b, c) {
    _n.subVectors(c, b).cross(_t.subVectors(a, b)).normalize();
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      if (this.colors) this.col.push(...this.color);
    }
  }
  /** 凸多邊形（扇形三角化）；hint 為期望的法線方向 */
  poly(pts, hint = UP) {
    _n.subVectors(pts[2], pts[1]).cross(_t.subVectors(pts[0], pts[1]));
    let q = pts;
    if (_n.dot(hint) < 0) q = [...pts].reverse();
    for (let i = 1; i < q.length - 1; i++) this.tri(q[0], q[i], q[i + 1]);
  }
  /** 加入 three 幾何（會轉成非索引；預設重算平面法線） */
  add(geo, matrix, { keepNormals = false } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const hadColor = !!g.attributes.color;
    for (const k of Object.keys(g.attributes)) {
      if (k === 'position' || (k === 'normal' && keepNormals) || (k === 'color' && this.colors)) continue;
      g.deleteAttribute(k);
    }
    if (matrix) g.applyMatrix4(matrix);
    if (!keepNormals || !g.attributes.normal) g.computeVertexNormals();
    if (this.colors && !hadColor) {
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set(this.color, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    this.geos.push(g);
    return this;
  }
  /** 把另一個累積器的結果（已建好的幾何）以矩陣放進來 */
  addBuilt(geo, matrix) { return this.add(geo, matrix, { keepNormals: true }); }

  get empty() { return this.geos.length === 0 && this.pos.length === 0; }

  build({ uv = true } = {}) {
    const list = [...this.geos];
    if (this.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
      if (this.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      list.push(g);
    }
    if (!list.length) return null;
    for (const g of list) if (g.attributes.uv) g.deleteAttribute('uv');
    const merged = mergeGeometries(list, false);
    if (uv) planarUV(merged);
    merged.computeBoundingSphere();
    return merged;
  }
}

// -----------------------------------------------------------------------------
// 基本零件
// -----------------------------------------------------------------------------
const OCTA = new THREE.OctahedronGeometry(1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** 兩點之間的方柱（截面 w × h，h 沿 upHint） */
export function beam(acc, a, b, w, h, upHint = UP) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const x = d.clone().normalize();
  let y = upHint.clone().addScaledVector(x, -upHint.dot(x));
  if (y.lengthSq() < 1e-6) y = new THREE.Vector3(1, 0, 0).addScaledVector(x, -x.x);
  y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const o = a.clone().add(b).multiplyScalar(0.5);
  acc.add(BOX, basis(o, x.multiplyScalar(len), y.multiplyScalar(h), z.multiplyScalar(w)));
}

/** 方塊：中心、尺寸、繞 Y 角度 */
export function box(acc, cx, cy, cz, sx, sy, sz, rotY = 0) {
  acc.add(BOX, T(cx, cy, cz, rotY, sx, sy, sz));
}

/** 八角柱（頂點在 22.5° + k·45°，面朝 0°,45°…）；r 為外接圓半徑 */
export function octPrism(acc, cx, cz, r0, r1, y0, y1, segs = 8, start = 22.5) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, segs, 1, false, (90 - start) * DEG - (segs === 8 ? 0 : 0));
  acc.add(g, T(cx, (y0 + y1) / 2, cz));
  g.dispose();
}

/** 捲葉（crocket）：在 p 點往 out 方向長出、往上捲的葉片 */
export function crocket(acc, p, out, size, up = UP) {
  const o = out.clone().normalize();
  let y = up.clone().addScaledVector(o, -up.dot(o));
  if (y.lengthSq() < 1e-6) y.set(0, 1, 0);
  y.normalize();
  const ax = o.clone().multiplyScalar(0.85).addScaledVector(y, 0.5).normalize();
  let ay = y.clone().addScaledVector(ax, -y.dot(ax)).normalize();
  const az = new THREE.Vector3().crossVectors(ax, ay);
  const c1 = p.clone().addScaledVector(ax, 0.42 * size);
  acc.add(OCTA, basis(c1, ax.clone().multiplyScalar(0.48 * size), ay.clone().multiplyScalar(0.13 * size), az.clone().multiplyScalar(0.3 * size)));
  const c2 = p.clone().addScaledVector(ax, 0.78 * size).addScaledVector(ay, 0.16 * size);
  acc.add(OCTA, basis(c2, ax.clone().multiplyScalar(0.17 * size), ay.clone().multiplyScalar(0.2 * size), az.clone().multiplyScalar(0.2 * size)));
}

/** 頂飾（fleuron / finial）：p 為底，總高約 size */
export function fleuron(acc, p, size) {
  octPrism(acc, p.x, p.z, size * 0.07, size * 0.06, p.y, p.y + size * 0.55, 4, 45);
  for (let k = 0; k < 4; k++) {
    const a = k * 90 * DEG + 45 * DEG;
    crocket(acc, v3(p.x, p.y + size * 0.3, p.z), v3(Math.cos(a), 0, Math.sin(a)), size * 0.42);
  }
  acc.add(OCTA, T(p.x, p.y + size * 0.62, p.z, Math.PI / 4, size * 0.13, size * 0.13, size * 0.13));
  const cone = new THREE.ConeGeometry(size * 0.08, size * 0.3, 4);
  acc.add(cone, T(p.x, p.y + size * 0.85, p.z, Math.PI / 4));
  cone.dispose();
}

/** 等高尖拱（任意拱高）的輪廓點：左右起拱點 (±hw, 0)，拱頂 (0, H) */
export function pointedArchPts(cx, hw, y0, H, seg = 5) {
  const c = (H * H - hw * hw) / (2 * hw); // 圓心距中線
  const R = hw + c;
  const pts = [];
  // 左弧：圓心 (cx + c, y0)，從 (cx - hw, y0) 到 (cx, y0 + H)
  const a0 = Math.PI, a1 = Math.atan2(H, -c);
  for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * (i / seg); pts.push([cx + c + R * Math.cos(a), y0 + R * Math.sin(a)]); }
  // 右弧：圓心 (cx - c, y0)
  const b0 = Math.atan2(H, c), b1 = 0;
  for (let i = 1; i <= seg; i++) { const a = b0 + (b1 - b0) * (i / seg); pts.push([cx - c + R * Math.cos(a), y0 + R * Math.sin(a)]); }
  return pts;
}

/** 尖拱窗洞路徑：寬 w，窗台 sill，起拱 spring，拱頂 apex（2D） */
export function lancetPath(cx, w, sill, spring, apex) {
  const hw = w / 2;
  const top = pointedArchPts(cx, hw, spring, apex - spring, 5);
  const pts = [[cx - hw, sill], ...top, [cx + hw, sill]];
  return pts.map(([x, y]) => new THREE.Vector2(x, y));
}

/** 在一個豎直平面上擠出 2D 形狀：origin 為形狀座標 (0,0) 所在、n 為朝外法線，形狀前面在 origin 平面 */
export function extrudeOnPlane(acc, shape, origin, n, depth, curveSegments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  const nn = n.clone().normalize();
  const t = new THREE.Vector3().crossVectors(UP, nn).normalize();
  const o = origin.clone().addScaledVector(nn, -depth);
  acc.add(g, basis(o, t, UP.clone(), nn));
  g.dispose();
}

/** 三角山花（wimperg）：底邊中心 base、朝外法線 n、寬 w、高 h，含捲葉與頂飾 */
export function gable(acc, base, n, { w, h, thick = 0.15, hole = 0, crockets = 3, crocketSize = 0.3, finial = 0.5 }) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  if (hole > 0) {
    const hp = new THREE.Path();
    hp.absarc(0, h * 0.36, hole, 0, Math.PI * 2, true);
    s.holes.push(hp);
  }
  extrudeOnPlane(acc, s, base, n, thick, 8);
  const nn = n.clone().normalize();
  const t = new THREE.Vector3().crossVectors(UP, nn).normalize();
  const L = Math.hypot(w / 2, h);
  for (const side of [-1, 1]) {
    // 斜邊外法線（平面內）
    const ou = side * h / L, ov = (w / 2) / L;
    const out = t.clone().multiplyScalar(ou).addScaledVector(UP, ov).addScaledVector(nn, 0.25);
    for (let j = 1; j <= crockets; j++) {
      const f = j / (crockets + 1);
      const u = side * (w / 2) * (1 - f), v = h * f;
      const p = base.clone().addScaledVector(t, u).addScaledVector(UP, v).addScaledVector(nn, -thick / 2);
      crocket(acc, p, out, crocketSize);
    }
  }
  if (finial > 0) fleuron(acc, base.clone().addScaledVector(UP, h * 0.97).addScaledVector(nn, -thick / 2), finial);
}

/** 沿肋線排捲葉：a→b，數量 n，大小由 s0 漸變到 s1，out(p) 給出外向 */
export function crocketRib(acc, a, b, n, s0, s1, outFn, phase = 0) {
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5 + phase) / n;
    if (f > 1) continue;
    const p = a.clone().lerp(b, f);
    crocket(acc, p, outFn(p), s0 + (s1 - s0) * f);
  }
}
