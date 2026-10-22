// src/sculpture/sdf.js — 有向距離場（SDF）雕刻工具：圓滑融合的基本形 + 表面網格抽取（Surface Nets）
// 用來做需要有機形體的雕像（沉思者）。全部確定性：雜訊是整數雜湊，沒有隨機數。
const { abs, min, max, sqrt, floor } = Math;
// Math.hypot 很慢（熱路徑上差 5–10 倍），自己寫
const hypot = (a, b, c = 0) => sqrt(a * a + b * b + c * c);

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** 多項式平滑聯集 / 差集（k = 融合範圍） */
export const smin = (a, b, k) => { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

/** 圓錐形膠囊（兩端半徑不同）：a → b */
export function cone(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz));
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
  return sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
}
export const ball = (px, py, pz, cx, cy, cz, r) => hypot(px - cx, py - cy, pz - cz) - r;
/** 橢球（近似距離） */
export function ell(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = sqrt(x * x + y * y + z * z);
  const k1 = sqrt((x / rx) * (x / rx) + (y / ry) * (y / ry) + (z / rz) * (z / rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
}

/** 3D 值雜訊（整數雜湊，三線性＋smoothstep），回傳 [0,1) */
function hash3(ix, iy, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const ix = floor(x), iy = floor(y), iz = floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz), b = hash3(ix + 1, iy, iz), c = hash3(ix, iy + 1, iz), d = hash3(ix + 1, iy + 1, iz);
  const e = hash3(ix, iy, iz + 1), f = hash3(ix + 1, iy, iz + 1), g = hash3(ix, iy + 1, iz + 1), h = hash3(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}

/**
 * Surface Nets：在 [x0, x0+nx·h] × … 的網格上取樣 f，回傳 { pos: Float32Array, idx: Uint32Array }。
 * f(x, y, z) < 0 為內部。三角形法線朝外（f 增加的方向）。
 * block：先用 block³ 的粗格判斷這塊離表面多遠，遠的整塊略過（不逐點取樣）。
 */
export function surfaceNets(f, x0, y0, z0, h, nx, ny, nz, block = 8) {
  const sx = nx + 1, sy = ny + 1, sz = nz + 1;
  const F = new Float32Array(sx * sy * sz);
  const at = (i, j, k) => (k * sy + j) * sx + i;
  const half = (block * h * sqrt(3)) / 2 + 0.025;
  for (let bk = 0; bk <= nz; bk += block) for (let bj = 0; bj <= ny; bj += block) for (let bi = 0; bi <= nx; bi += block) {
    const ei = min(bi + block, nx), ej = min(bj + block, ny), ek = min(bk + block, nz);
    const cx = x0 + ((bi + ei) / 2) * h, cy = y0 + ((bj + ej) / 2) * h, cz = z0 + ((bk + ek) / 2) * h;
    const fc = f(cx, cy, cz);
    if (abs(fc) > half) {
      for (let k = bk; k <= ek; k++) for (let j = bj; j <= ej; j++) for (let i = bi; i <= ei; i++) F[at(i, j, k)] = fc;
    } else {
      for (let k = bk; k <= ek; k++) for (let j = bj; j <= ej; j++) for (let i = bi; i <= ei; i++) F[at(i, j, k)] = f(x0 + i * h, y0 + j * h, z0 + k * h);
    }
  }
  // 每個有符號變化的格子一個頂點（邊上交點的平均）
  const cellId = new Int32Array(nx * ny * nz).fill(-1);
  const verts = [];
  const cid = (i, j, k) => (k * ny + j) * nx + i;
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = F[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sxp = 0, syp = 0, szp = 0, n = 0;
    for (const [a, b] of EDGES) {
      const fa = cv[a], fb = cv[b];
      if ((fa < 0) === (fb < 0)) continue;
      const t = fa / (fa - fb);
      sxp += (a & 1) + ((b & 1) - (a & 1)) * t; syp += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; szp += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
    }
    cellId[cid(i, j, k)] = verts.length / 3;
    verts.push(x0 + (i + sxp / n) * h, y0 + (j + syp / n) * h, z0 + (k + szp / n) * h);
  }
  // 沿每條有符號變化的格線，把四周 4 個格子的頂點連成四邊形。
  // 繞向由「格線的哪一端在內部」決定（不用幾何猜，扭曲的四邊形也不會反向）：
  //   x 軸線：格子依 (y,z) 逆時針排列 → 法線 +x；y 軸線：依 (x,z) 逆時針 → -y；z 軸線：依 (x,y) 逆時針 → +z
  const idx = [];
  const P = verts;
  const quad = (c, reverse) => {
    const [a, b, cc, d] = reverse ? [c[3], c[2], c[1], c[0]] : c;
    const d1 = (P[3 * a] - P[3 * cc]) ** 2 + (P[3 * a + 1] - P[3 * cc + 1]) ** 2 + (P[3 * a + 2] - P[3 * cc + 2]) ** 2;
    const d2 = (P[3 * b] - P[3 * d]) ** 2 + (P[3 * b + 1] - P[3 * d + 1]) ** 2 + (P[3 * b + 2] - P[3 * d + 2]) ** 2;
    if (d1 <= d2) idx.push(a, b, cc, a, cc, d); else idx.push(b, cc, d, b, d, a);
  };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const inside = F[at(i, j, k)] < 0;
    if ((F[at(i + 1, j, k)] < 0) !== inside) {
      const c = [cellId[cid(i, j - 1, k - 1)], cellId[cid(i, j, k - 1)], cellId[cid(i, j, k)], cellId[cid(i, j - 1, k)]];
      if (c.every((v) => v >= 0)) quad(c, !inside);
    }
    if ((F[at(i, j + 1, k)] < 0) !== inside) {
      const c = [cellId[cid(i - 1, j, k - 1)], cellId[cid(i, j, k - 1)], cellId[cid(i, j, k)], cellId[cid(i - 1, j, k)]];
      if (c.every((v) => v >= 0)) quad(c, inside);
    }
    if ((F[at(i, j, k + 1)] < 0) !== inside) {
      const c = [cellId[cid(i - 1, j - 1, k)], cellId[cid(i, j - 1, k)], cellId[cid(i, j, k)], cellId[cid(i - 1, j, k)]];
      if (c.every((v) => v >= 0)) quad(c, !inside);
    }
  }
  return { pos: Float32Array.from(verts), idx: Uint32Array.from(idx) };
}
