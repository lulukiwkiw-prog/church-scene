// src/environment/trees.js — 法國梧桐（3 月剛冒新芽）：遞迴分枝的枝幹＋枝梢稀疏的新芽面片
import { add, sub, scl, cross, dot, norm } from './geom.js';

const UP = [0, 1, 0];
const SIDES = [10, 7, 5, 4, 3, 3, 3, 3];
const SEGS = [5, 4, 3, 2, 2, 1, 1, 1];

function basis(d) {
  const ref = Math.abs(d[1]) < 0.9 ? UP : [1, 0, 0];
  const n = norm(cross(d, ref));
  return [n, cross(d, n)];
}
function deflect(d, theta, phi) {
  const [n, b] = basis(d);
  const s = Math.sin(theta);
  return norm(add(scl(d, Math.cos(theta)), add(scl(n, s * Math.cos(phi)), scl(b, s * Math.sin(phi)))));
}

/** 長出一棵樹的骨架：回傳 { branches: [{pts, rads, depth}], tips: [{p, d}] } */
function grow(spec, r, maxDepth) {
  const H = spec.height, base = [spec.x, 0, spec.z];
  const trunkH = H * r.range(0.26, 0.34);
  const crownH = H - trunkH;
  const branches = [], tips = [];

  function branch(p0, dir, L, rad0, depth) {
    const nSeg = SEGS[depth];
    const pts = [p0], rads = [rad0];
    let d = dir, p = p0;
    const wob = depth === 0 ? 0.04 : depth < 3 ? 0.14 : 0.3;
    for (let i = 1; i <= nSeg; i++) {
      const out = [p[0] - base[0], 0, p[2] - base[2]];
      const ol = Math.hypot(out[0], out[2]);
      const outward = ol > 1e-3 ? [out[0] / ol, 0, out[2] / ol] : [0, 0, 0];
      d = norm(add(add(d, [r.gauss(0, wob), r.gauss(0, wob), r.gauss(0, wob)]), add(scl(UP, depth === 0 ? 0.05 : 0.07), scl(outward, depth === 0 ? 0 : 0.05 + 0.02 * depth))));
      p = add(p, scl(d, L / nSeg));
      pts.push(p);
      rads.push(rad0 * (1 - (0.4 * i) / nSeg));
    }
    branches.push({ pts, rads, depth });
    if (depth >= maxDepth) { tips.push({ p, d }); return; }

    const nChild = depth === 0 ? r.int(4, 5) : depth < 4 ? 3 : r.int(2, 3);
    const phi0 = r.range(0, Math.PI * 2);
    for (let k = 0; k < nChild; k++) {
      // 枝的位置：主幹頂端分叉；其他沿枝後段
      const t = depth === 0 ? r.range(0.82, 1.0) : k === 0 ? 1.0 : r.range(0.4, 0.95);
      const fi = t * nSeg, i0 = Math.min(nSeg - 1, Math.floor(fi)), w = fi - i0;
      const at = add(scl(pts[i0], 1 - w), scl(pts[i0 + 1], w));
      const radAt = rads[i0] * (1 - w) + rads[i0 + 1] * w;
      const segDir = norm(sub(pts[i0 + 1], pts[i0]));
      let theta, phi, cl, cr;
      if (depth === 0) {
        theta = r.range(28, 48) * Math.PI / 180;
        phi = phi0 + (k / nChild) * Math.PI * 2 + r.range(-0.3, 0.3);
        cl = crownH * r.range(0.32, 0.42);
        cr = radAt * r.range(0.55, 0.7);
      } else {
        theta = (k === 0 ? r.range(8, 22) : r.range(28, 55)) * Math.PI / 180;
        phi = phi0 + (k / nChild) * Math.PI * 2 + r.range(-0.5, 0.5);
        cl = L * (k === 0 ? r.range(0.68, 0.8) : r.range(0.55, 0.72));
        cr = Math.max(0.008, radAt * (k === 0 ? 0.72 : 0.58));
      }
      branch(at, deflect(depth === 0 ? UP : segDir, theta, phi), cl, Math.min(cr, radAt), depth + 1);
    }
  }
  branch(base, deflect(UP, r.range(0, 0.05), r.range(0, 6.28)), trunkH, 0.05 + 0.02 * H, 0);

  // 把樹冠縮放到 height × canopyRadius
  let maxR = 0.1, maxY = trunkH + 0.1;
  for (const b of branches) for (const p of b.pts) {
    maxR = Math.max(maxR, Math.hypot(p[0] - base[0], p[2] - base[2]));
    maxY = Math.max(maxY, p[1]);
  }
  const sx = Math.min(1.8, Math.max(0.5, spec.canopyRadius / maxR));
  const sy = Math.min(1.8, Math.max(0.5, crownH / (maxY - trunkH)));
  const map = (p) => [base[0] + (p[0] - base[0]) * sx, p[1] <= trunkH ? p[1] : trunkH + (p[1] - trunkH) * sy, base[2] + (p[2] - base[2]) * sx];
  for (const b of branches) b.pts = b.pts.map(map);
  for (const t of tips) t.p = map(t.p);
  return { branches, tips };
}

/** 平滑法線的錐管；UV：U 繞圈（公尺）、V 沿長度（公尺） */
function tube(g, pts, rads, sides) {
  const n = pts.length;
  const T = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  let N = basis(T[0])[0];
  const rings = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) { N = norm(sub(N, scl(T[i], dot(N, T[i])))); v += Math.hypot(...sub(pts[i], pts[i - 1])); }
    const Bv = cross(T[i], N);
    const ring = [];
    for (let j = 0; j <= sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      const dir = add(scl(N, Math.cos(th)), scl(Bv, Math.sin(th)));
      ring.push({ p: add(pts[i], scl(dir, rads[i])), n: dir, uv: [th * rads[0], v] });
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j + 1], d = rings[i + 1][j];
      g.triN(a.p, b.p, c.p, a.n, b.n, c.n, a.uv, b.uv, c.uv);
      g.triN(a.p, c.p, d.p, a.n, c.n, d.n, a.uv, c.uv, d.uv);
    }
  }
}

/** 新芽面片：兩片交叉方形，UV 0..0.5（材質一格 0.5 m 的芽團圖） */
function budCluster(g, p, d, size, r) {
  const [n0, b0] = basis(d);
  for (let k = 0; k < 2; k++) {
    const phi = r.range(0, Math.PI) + k * Math.PI / 2;
    const ax = add(scl(n0, Math.cos(phi)), scl(b0, Math.sin(phi)));
    const ay = norm(add(d, [0, 0.3, 0]));
    const h = size / 2;
    const c = add(p, scl(d, h * 0.4));
    const A = add(c, add(scl(ax, -h), scl(ay, -h))), B = add(c, add(scl(ax, h), scl(ay, -h)));
    const C = add(c, add(scl(ax, h), scl(ay, h))), Dp = add(c, add(scl(ax, -h), scl(ay, h)));
    const nn = norm(add(cross(ax, ay), [0, 0.6, 0])); // 法線偏上，避免背光面全黑
    g.triN(A, B, C, nn, nn, nn, [0, 0], [0.5, 0], [0.5, 0.5]);
    g.triN(A, C, Dp, nn, nn, nn, [0, 0], [0.5, 0.5], [0, 0.5]);
  }
}

export function buildTrees(B, L, rng) {
  const wood = B.get('trees', 'barkPlane');
  const buds = B.get('trees', 'leafBud');
  const list = [
    ...L.parvis.trees.map((t, i) => ({ t, name: `environment/tree/parvis/${i}` })),
    ...L.surroundings.gardens.flatMap((gd) => (gd.trees || []).map((t, i) => ({ t, name: `environment/tree/${gd.id}/${i}` }))),
  ];
  for (const { t, name } of list) {
    const r = rng(name);
    const spec = { canopyRadius: 4.5, height: 14, ...t };
    const { branches, tips } = grow(spec, r, 6);
    for (const b of branches) tube(wood, b.pts, b.rads, SIDES[b.depth]);
    const rb = r.fork('buds');
    for (const tp of tips) {
      // 3 月：大多數枝梢只是剛鼓起的芽，只有一部分已經冒出淡綠小葉團
      if (!rb.chance(0.45)) continue;
      budCluster(buds, tp.p, tp.d, rb.range(0.22, 0.36), rb);
    }
  }
}
