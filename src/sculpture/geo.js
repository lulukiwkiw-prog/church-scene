// src/sculpture/geo.js — 雕刻模組的程式幾何工具
// Mesher：累積頂點（位置 + 灰階 AO 色）與索引；有矩陣堆疊，所有基本形都在「目前座標系」下發出。
// 慣例：網格 u 繞一圈（x → z 方向）、v 往上 → 法線朝外。
import * as THREE from 'three';

const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

export class Mesher {
  constructor() {
    this.P = []; this.C = []; this.I = [];
    this.m = new THREE.Matrix4();
    this.stack = [];
    this.flip = false;
    this.tone = 1; // 全域色調乘數（髒污）
  }
  push(mat) { this.stack.push([this.m.clone(), this.flip, this.tone]); this.m.multiply(mat); this.flip = this.m.determinant() < 0; return this; }
  pop() { const [m, f, t] = this.stack.pop(); this.m = m; this.flip = f; this.tone = t; return this; }
  /** 平移 + 旋轉(弧度, 'YXZ') + 縮放 */
  pushTRS(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    return this.push(m);
  }
  get count() { return this.P.length / 3; }
  v(x, y, z, c = 1) {
    const e = this.m.elements, P = this.P;
    P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    this.C.push(c * this.tone);
    return P.length / 3 - 1;
  }
  t(a, b, c) { if (this.flip) this.I.push(a, c, b); else this.I.push(a, b, c); }
  q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }

  /**
   * 參數網格。fn(u, v, out, i, j) 寫入 out = [x, y, z, c]；u ∈ [0,1)（wrap）或 [0,1]、v ∈ [0,1]。
   * opts: wrap（u 閉合）, cap0 / cap1（v=0 / v=1 端封口）, rev（反轉法線）
   */
  grid(nu, nv, fn, opts = {}) {
    const wrap = opts.wrap !== false;
    const cols = wrap ? nu : nu + 1;
    const base = this.count;
    const out = [0, 0, 0, 1];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i < cols; i++) {
        fn(i / nu, v, out, i, j);
        this.v(out[0], out[1], out[2], out[3]);
      }
    }
    const id = (i, j) => base + j * cols + (wrap ? i % nu : i);
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = id(i, j), b = id(i, j + 1), c = id(i + 1, j + 1), d = id(i + 1, j);
        if (opts.rev) this.q(a, d, c, b); else this.q(a, b, c, d);
      }
    }
    const P = this.P;
    const capRow = (j, top) => {
      let sx = 0, sy = 0, sz = 0, sc = 0;
      for (let i = 0; i < cols; i++) { const k = id(i, j); sx += P[3 * k]; sy += P[3 * k + 1]; sz += P[3 * k + 2]; sc += this.C[k]; }
      P.push(sx / cols, sy / cols, sz / cols); this.C.push(sc / cols);
      const c = P.length / 3 - 1;
      const n = wrap ? nu : nu;
      for (let i = 0; i < n; i++) {
        const a = id(i, j), b = id(i + 1, j);
        // 直接以世界座標推入，不再經過 flip（rev 決定方向）
        const fwd = top !== !!opts.rev;
        if (fwd !== this.flip) this.I.push(c, b, a); else this.I.push(c, a, b);
      }
    };
    if (opts.cap0) capRow(0, false);
    if (opts.cap1) capRow(nv, true);
    return this;
  }

  /** 方塊（每面獨立頂點，硬邊） */
  box(cx, cy, cz, sx, sy, sz, c = 1) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const F = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    for (const [n, t1, t2] of F) {
      const px = cx + n[0] * hx, py = cy + n[1] * hy, pz = cz + n[2] * hz;
      const corner = (a, b) => this.v(px + (a * t1[0] + b * t2[0]) * hx, py + (a * t1[1] + b * t2[1]) * hy, pz + (a * t1[2] + b * t2[2]) * hz, c);
      const v0 = corner(-1, -1), v1 = corner(1, -1), v2 = corner(1, 1), v3 = corner(-1, 1);
      this.q(v0, v1, v2, v3);
    }
    return this;
  }

  /** 橢球（中心、三半徑），disp(dx,dy,dz) 回傳 [半徑倍率, 色] 可選 */
  ellipsoid(cx, cy, cz, rx, ry, rz, nu = 12, nv = 8, c = 1, disp = null) {
    return this.grid(nu, nv, (u, v, o) => {
      const th = Math.PI * (1 - v), ph = u * TAU;
      const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
      let k = 1, cc = c;
      if (disp) { const r = disp(dx, dy, dz); k = r[0]; cc = r[1]; }
      o[0] = cx + rx * dx * k; o[1] = cy + ry * dy * k; o[2] = cz + rz * dz * k; o[3] = cc;
    });
  }

  /** 旋轉體：profile = [[r, y], ...]（外側由下往上），sx/sz 橢圓縮放 */
  lathe(profile, nu = 12, c = 1, opts = {}) {
    const n = profile.length - 1;
    const sx = opts.sx || 1, sz = opts.sz || 1;
    const cc = opts.colors;
    return this.grid(nu, n, (u, v, o, i, j) => {
      const [r, y] = profile[j];
      const ph = u * TAU;
      o[0] = r * Math.cos(ph) * sx; o[1] = y; o[2] = r * Math.sin(ph) * sz; o[3] = cc ? cc[j] : c;
    }, { cap0: opts.cap0, cap1: opts.cap1 });
  }

  /** 沿路徑的管（Catmull-Rom），pts = [[x,y,z],...]，radii 與 pts 等長 */
  tube(pts, radii, nu = 8, nseg = 12, c = 1, opts = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const frames = curve.computeFrenetFrames(nseg, false);
    const P = curve.getSpacedPoints(nseg);
    const sx = opts.sx || 1, sy = opts.sy || 1;
    const cols = opts.colors;
    return this.grid(nu, nseg, (u, v, o, i, j) => {
      const t = v * (radii.length - 1);
      const k = Math.min(radii.length - 2, Math.floor(t));
      const r = lerp(radii[k], radii[k + 1], t - k);
      const N = frames.normals[j], B = frames.binormals[j], p = P[j];
      const a = u * TAU, ca = Math.cos(a) * r * sx, sa = -Math.sin(a) * r * sy;
      o[0] = p.x + N.x * ca + B.x * sa; o[1] = p.y + N.y * ca + B.y * sa; o[2] = p.z + N.z * ca + B.z * sa;
      o[3] = cols ? cols(v, u) : c;
    }, { cap0: opts.cap0 !== false, cap1: opts.cap1 !== false });
  }

  /** 兩點間圓柱 */
  rod(a, b, r0, r1 = r0, nu = 6, c = 1) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A); const L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.push(new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)));
    this.lathe([[0, 0], [r0, 0], [r1, L], [0, L]], nu, c);
    this.pop();
    return this;
  }

  /** 平面多邊形擠出（xy 平面，厚度沿 z，置中） */
  extrude(poly, thick, c = 1, cBack = c) {
    let pts = poly.map(([x, y]) => new THREE.Vector2(x, y));
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    const h = thick / 2;
    const f = pts.map((p) => this.v(p.x, p.y, h, c));
    for (const [a, b, d] of tris) this.t(f[a], f[b], f[d]);
    const bk = pts.map((p) => this.v(p.x, p.y, -h, cBack));
    for (const [a, b, d] of tris) this.t(bk[a], bk[d], bk[b]);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const a = this.v(p.x, p.y, h, c * 0.85), b = this.v(p.x, p.y, -h, c * 0.85), cc = this.v(q.x, q.y, -h, c * 0.85), d = this.v(q.x, q.y, h, c * 0.85);
      this.q(a, b, cc, d);
    }
    return this;
  }

  /** 併入另一個 Mesher（套用目前矩陣） */
  absorb(other) {
    const base = this.count;
    const P = other.P;
    for (let k = 0; k < P.length; k += 3) this.v(P[k], P[k + 1], P[k + 2], other.C[k / 3]);
    const flip = this.flip;
    for (let k = 0; k < other.I.length; k += 3) {
      if (flip) this.I.push(base + other.I[k], base + other.I[k + 2], base + other.I[k + 1]);
      else this.I.push(base + other.I[k], base + other.I[k + 1], base + other.I[k + 2]);
    }
    return this;
  }

  /** 轉成 BufferGeometry：position / normal / uv（1 單位 = 1 m，依法線三向投影）/ color */
  toGeometry(tint = [1, 1, 1], uvScale = 1) {
    const g = new THREE.BufferGeometry();
    const n = this.count;
    const pos = new Float32Array(this.P);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    g.computeVertexNormals();
    const nor = g.attributes.normal.array;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const x = pos[3 * k], y = pos[3 * k + 1], z = pos[3 * k + 2];
      const ax = Math.abs(nor[3 * k]), ay = Math.abs(nor[3 * k + 1]), az = Math.abs(nor[3 * k + 2]);
      if (ay > ax && ay > az) { uv[2 * k] = x * uvScale; uv[2 * k + 1] = z * uvScale; }
      else if (ax > az) { uv[2 * k] = z * uvScale; uv[2 * k + 1] = y * uvScale; }
      else { uv[2 * k] = x * uvScale; uv[2 * k + 1] = y * uvScale; }
      const c = clamp(this.C[k], 0, 1.2);
      col[3 * k] = c * tint[0]; col[3 * k + 1] = c * tint[1]; col[3 * k + 2] = c * tint[2];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
}

/** 以基底向量 + 位置建立矩陣（xAxis, yAxis, zAxis 為陣列） */
export function basis(pos, X, Y, Z, s = 1) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...X).multiplyScalar(s), new THREE.Vector3(...Y).multiplyScalar(s), new THREE.Vector3(...Z).multiplyScalar(s));
  m.setPosition(pos[0], pos[1], pos[2]);
  return m;
}

/** 站在 pos、面向水平方向 (fx, fz)、縮放 s 的矩陣（局部 +Z = 面向、+Y = 上） */
export function facing(pos, fx, fz, s = 1, sz = s) {
  const L = Math.hypot(fx, fz) || 1;
  const Z = [fx / L, 0, fz / L];
  const X = [Z[2], 0, -Z[0]]; // Y × Z
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...X).multiplyScalar(s), new THREE.Vector3(0, s, 0), new THREE.Vector3(...Z).multiplyScalar(sz));
  m.setPosition(pos[0], pos[1], pos[2]);
  return m;
}

export const scaleM = (sx, sy = sx, sz = sx) => new THREE.Matrix4().makeScale(sx, sy, sz);
export const transM = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
