// src/sculpture/sdfhuman.js — 人像的臉、手與袖子（SDF 雕刻）
// 長袍與衣褶仍由 figure.js 的參數式曲面負責；這裡只做最不像真的三樣：
//   臉（眉骨、眼窩、鼻、嘴唇、耳、頭髮、鬍子）、手（手掌、四指、拇指）、寬袖與垂下的袖口。
// 座標與 figure.js 相同（身高 = 1、面向 +Z）。頭部網格在「頭的局部座標」（與 headInner 一致，
// 尚未乘 1.17）；手臂網格在「肩膀局部座標」且只做 +X 那一側，-X 側由呼叫者鏡射。
// 每種造型只建一次並快取（鍵 = 造型參數），所以幾十尊雕像只需要幾十毫秒。
import { cone, ball, ell, smin, smax, noise3, sstep, clamp, bakeMesh } from './sdf.js';

const { abs, sin, max, sqrt } = Math;
const hyp = (a, b, c = 0) => sqrt(a * a + b * b + c * c);

// =============================== 頭 ===============================
function headField(x, y, z, P) {
  const ax = abs(x), f = P.fem ? 0.9 : 1;
  // 顱骨 + 下半臉
  let d = ell(x, y, z, 0, 0, 0, 0.05, 0.068, 0.057);
  d = smin(d, ell(ax, y, z, 0, -0.026, 0.014, 0.0465 * f, 0.04, 0.043), 0.016);   // 下半臉（兩頰飽滿）
  d = smin(d, ball(ax, y, z, 0, -0.056, 0.034, 0.0155 * f), 0.012);                       // 下巴
  d = smin(d, ball(ax, y, z, 0.032 * f, -0.012, 0.041, 0.0165), 0.014);                    // 顴骨與臉頰
  const browK = (P.fem ? 0.8 : 1.18) * (0.9 + 0.2 * P.seed);
  d = smin(d, cone(ax, y, z, 0, 0.018, 0.0455, 0.039, 0.0165, 0.04, 0.0105 * browK, 0.0095 * browK), 0.012); // 眉骨
  // 眼：先挖眼窩，再放回略凹的眼球與上眼瞼
  d = smax(d, -ball(ax, y, z, 0.0185, 0.0035, 0.0525, 0.0104), 0.006);
  d = smin(d, ball(ax, y, z, 0.0185, 0.0035, 0.0478, 0.0092), 0.004);
  d = smin(d, ell(ax, y, z, 0.0185, 0.0115, 0.05, 0.0105, 0.0042, 0.0075), 0.004);
  // 鼻：鼻樑、鼻頭、鼻翼、鼻孔
  const nl = 0.0185 + 0.004 * (P.seed - 0.5);
  d = smin(d, cone(ax, y, z, 0, 0.014, 0.051, 0, -0.012, 0.054 + nl, 0.0092, 0.0078), 0.008);
  d = smin(d, ball(ax, y, z, 0, -0.0145, 0.0545 + nl, 0.0082), 0.005);
  d = smin(d, ball(ax, y, z, 0.0092, -0.0165, 0.0475 + nl, 0.0058), 0.005);
  d = smax(d, -ball(ax, y, z, 0.0052, -0.0185, 0.0555 + nl, 0.0034), 0.003);
  // 嘴：上唇、下唇、嘴縫
  d = smin(d, ell(ax, y, z, 0, -0.0238, 0.0558, 0.0125 * f, 0.0048, 0.0072), 0.003);
  d = smin(d, ell(ax, y, z, 0, -0.0338, 0.0548, 0.0112 * f, 0.0052, 0.0072), 0.003);
  d = smax(d, -ell(ax, y, z, 0, -0.0292, 0.0586, 0.0135 * f, 0.0011, 0.006), 0.0011);
  // 耳
  d = smin(d, ell(ax, y, z, 0.0505, 0.001, -0.004, 0.0072, 0.019, 0.0115), 0.006);
  // 脖子（伸進長袍）
  d = smin(d, cone(x, y, z, 0, -0.035, -0.002, 0, -0.088, -0.006, 0.0265, 0.03), 0.012);
  // 頭髮（P.only === 'skin' → 只要皮膚，頭髮當光頭；'hair' → 另外回傳頭髮＋鬍子的場）
  let hr = 1e9;
  if (P.only !== 'skin' && P.hair !== 'bald' && !P.covered) {
    let h = ell(x, y, z, 0, 0.006, -0.005, 0.0538, 0.0705, 0.0615);
    if (P.hair === 'long') h = smin(h, ell(x, y, z, 0, -0.065, -0.04, 0.052, 0.085, 0.026), 0.015);
    if (P.fem) h = smin(h, ell(x, y, z, 0, -0.07, -0.036, 0.056, 0.09, 0.03), 0.015);
    h = smax(h, -ell(x, y, z, 0, -0.028, 0.052, 0.046, 0.05, 0.036), 0.007);           // 留出臉
    h = smax(h, -ell(ax, y, z, 0.056, -0.004, 0.012, 0.012, 0.03, 0.03), 0.004);       // 露出耳朵
    if (P.hair === 'tonsure') h = smax(h, -ball(x, y, z, 0, 0.074, 0, 0.037), 0.005);
    if (P.hair === 'curly') h -= 0.0024 * max(0, sin(x * 190 + 2 * sin(y * 120)) * sin(y * 170 + z * 130));
    else h -= 0.0014 * max(0, sin(Math.atan2(z + 0.005, x) * 46 + y * 18));
    d = smin(d, h, 0.007);
    hr = h;
  } else if (P.only === 'skin' || P.hair === 'bald' || P.covered) {
    d = smin(d, ell(x, y, z, 0, 0.004, -0.004, 0.0515, 0.069, 0.0585), 0.005);
  }
  // 鬍子
  if (P.beard && P.only !== 'skin') {
    let b = ell(x, y, z, 0, -0.058, 0.034, 0.037, 0.05, 0.03);
    b = smin(b, cone(ax, y, z, 0.0425, 0.0, 0.012, 0.034, -0.045, 0.03, 0.0085, 0.01), 0.008);   // 鬢角
    b = smin(b, cone(ax, y, z, 0, -0.022, 0.0625, 0.019, -0.031, 0.0555, 0.0072, 0.0052), 0.005); // 鬍鬚
    b -= 0.0032 * max(0, sin(x * 230 + 4 * sin(y * 60)));
    d = smin(d, b, 0.008);
    hr = smin(hr, b, 0.008);
    d = smax(d, -ell(ax, y, z, 0, -0.0292, 0.0606, 0.01, 0.0011, 0.006), 0.0011);            // 嘴縫仍看得到
  }
  if (P.only === 'hair') return hr + 0.0003 * (noise3(x * 220, y * 220, z * 220) - 0.5);
  // 風化細紋
  return d + 0.0003 * (noise3(x * 220, y * 220, z * 220) - 0.5);
}

const headCache = new Map();
export function sdfHead(H) {
  const covered = !!(H.veil || H.cap || H.mitre || H.helm || H.blindfold);
  const P = { fem: !!H.female, hair: H.hair || 'short', beard: !!H.beard, covered, seed: (H.seed ?? 0) / 3 };
  if (H.blindfold) P.covered = true;
  const key = `${P.fem}|${P.hair}|${P.beard}|${P.covered}|${H.seed ?? 0}`;
  if (!headCache.has(key)) headCache.set(key, bakeMesh((x, y, z) => headField(x, y, z, P), [-0.072, -0.125, -0.082, 0.072, 0.105, 0.1], 0.0056, { aoDist: 0.012, minTris: 80, smooth: 1 }));
  return headCache.get(key);
}

/** 活動人物用：皮膚與頭髮分開烘焙（各自上色）。res 是網格間距，頭髮／鬍子可能是 null */
const partsCache = new Map();
export function sdfHeadParts(H, res = 0.0065) {
  const covered = !!(H.veil || H.cap || H.mitre || H.helm || H.blindfold);
  const P = { fem: !!H.female, hair: H.hair || 'short', beard: !!H.beard, covered, seed: (H.seed ?? 0) / 3 };
  const key = `${P.fem}|${P.hair}|${P.beard}|${P.covered}|${H.seed ?? 0}|${res}`;
  if (!partsCache.has(key)) {
    const box = [-0.072, -0.125, -0.082, 0.072, 0.105, 0.1], o = { aoDist: 0.012, minTris: 80, smooth: 1 };
    const skin = bakeMesh((x, y, z) => headField(x, y, z, { ...P, only: 'skin' }), box, res, o);
    const hasHair = !covered && P.hair !== 'bald';
    const hair = hasHair || P.beard ? bakeMesh((x, y, z) => headField(x, y, z, { ...P, only: 'hair' }), box, res, { ...o, minTris: 40 }) : null;
    partsCache.set(key, { skin, hair });
  }
  return partsCache.get(key);
}

// =============================== 手臂 ===============================
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = hyp(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/** 手的線段（[a, b, ra, rb, k]）：wr 手腕、d 指向指尖、n 手心朝向、l 側向（拇指端 +z） */
function handSegments(wr, d, n, l) {
  const HS = 1.25;                                         // 手的大小倍率（石像的手比實際略大才看得清楚）
  const hb = v3.add(wr, v3.mul(d, 0.012)), pe = v3.add(wr, v3.mul(d, 0.037 * HS));
  const hand = [];
  for (const o of [-0.0065 * HS, 0.0065 * HS]) hand.push([v3.add(hb, v3.mul(l, o)), v3.add(pe, v3.mul(l, o * 1.15)), 0.0085 * HS, 0.0082 * HS, 0.004]); // 手掌
  const L = [0.021, 0.025, 0.0235, 0.0185].map((v) => v * HS), curl = [0.55, 0.6, 0.65, 0.7];
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 0.0082 * HS;
    const f0 = v3.add(pe, v3.mul(l, off * 1.1));
    const f1 = v3.add(f0, v3.add(v3.mul(d, L[i] * 0.86), v3.mul(n, L[i] * curl[i] * 0.45)));
    const f2 = v3.add(f1, v3.add(v3.mul(d, L[i] * 0.3), v3.mul(n, L[i] * 0.75)));
    hand.push([f0, f1, 0.0042 * HS, 0.0037 * HS, 0.0016], [f1, f2, 0.0037 * HS, 0.0030 * HS, 0.0016]);
  }
  const t0 = v3.add(hb, v3.add(v3.mul(l, 0.0135 * HS), v3.mul(n, 0.004)));
  const t1 = v3.add(t0, v3.add(v3.mul(d, 0.019 * HS), v3.add(v3.mul(l, 0.004), v3.mul(n, 0.008 * HS))));
  const t2 = v3.add(t1, v3.add(v3.mul(d, 0.011 * HS), v3.mul(n, 0.011 * HS)));
  hand.push([t0, t1, 0.0052 * HS, 0.0044 * HS, 0.003], [t1, t2, 0.0044 * HS, 0.0034 * HS, 0.003]);
  return hand;
}

/** 一條手臂的幾何（肩膀為原點、+X 那一側）：袖子的線段與手的線段 */
function armGeometry(pose) {
  const el = [pose[0][0] - 0.1, pose[0][1] + 0.005, pose[0][2] + 0.005];
  const wr = [pose[1][0] - 0.1, pose[1][1] + 0.005, pose[1][2] + 0.005];
  const d = v3.norm(v3.sub(wr, el));
  let n = [-1, 0, 0];                                     // 手心朝向身體中線
  n = v3.sub(n, v3.mul(d, v3.dot(n, d)));
  if (hyp(...n) < 0.3) n = v3.sub([0, 0, 1], v3.mul(d, d[2]));
  n = v3.norm(n);
  let l = v3.cross(d, n); if (l[2] < 0) l = v3.mul(l, -1); // 側向軸：拇指在 +z 端
  const hand = handSegments(wr, d, n, l);
    const sleeve = [
    [[0, 0, 0], el, 0.040, 0.036],                          // 上臂
    [el, wr, 0.036, 0.0405],                                // 前臂（袖口略外擴）
    [[wr[0], wr[1] - 0.004, wr[2] + 0.003], [wr[0] - 0.003, wr[1] - 0.048, wr[2] + 0.008], 0.029, 0.011], // 垂下的袖口（短）
  ];
  return { el, wr, hand, sleeve };
}

const armCache = new Map();
/** 回傳 { sleeve, hand }（兩個網格，肩膀局部座標，+X 側） */
export function sdfArm(poseName, pose) {
  if (armCache.has(poseName)) return armCache.get(poseName);
  const G = armGeometry(pose);
  const sleeveF = (x, y, z) => {
    let d = 1e9;
    for (const [a, b, ra, rb] of G.sleeve) d = smin(d, cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), 0.012);
    d = smin(d, ball(x, y, z, 0, 0, 0, 0.046), 0.02);                                   // 肩
    // 袖子上的衣褶：沿手臂軸向的細溝
    const ang = Math.atan2(y - G.el[1] * 0.5, z - G.el[2] * 0.5);
    return d - 0.0035 * max(0, sin(ang * 9 + x * 40)) * sstep(0.01, 0.06, hyp(y, z)) + 0.0007 * (noise3(x * 160, y * 160, z * 160) - 0.5);
  };
  const handF = (x, y, z) => {
    let d = 1e9;
    for (const [a, b, ra, rb, k] of G.hand) d = smin(d, cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), k);
    return d;
  };
  const pts = G.hand.flatMap(([a, b]) => [a, b]);
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])) - 0.02), hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])) + 0.02);
  const sleeve = bakeMesh(sleeveF, [-0.06, Math.min(G.el[1], G.wr[1]) - 0.12, -0.07, 0.17, 0.06, 0.16], 0.0105, { aoDist: 0.02, minTris: 120 });
  const hand = bakeMesh(handF, [...lo, ...hi], 0.0036, { aoDist: 0.008, minTris: 30, smooth: 1 });
  const out = { sleeve, hand };
  armCache.set(poseName, out);
  return out;
}

/** 把快取的網格加進 Mesher M（目前座標系），回傳三角形數 */
export function addMesh(M, m) {
  const base = M.count, { pos, idx, col } = m;
  for (let i = 0; i < col.length; i++) M.v(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], col[i]);
  for (let i = 0; i < idx.length; i += 3) M.t(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
  return idx.length / 3;
}

let hangingHand = null;
/** 自然下垂的手（手腕為原點、+X 側、拇指朝 +z、手心朝身體）；身高 = 1 的單位，-X 側由呼叫者鏡射 */
export function sdfHandHanging(res = 0.0045) {
  if (!hangingHand) {
    const hand = handSegments([0, 0, 0], [0, -1, 0], [-1, 0, 0], [0, 0, 1]);
    const pts = hand.flatMap(([a, b]) => [a, b]);
    const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])) - 0.02), hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])) + 0.02);
    hangingHand = bakeMesh((x, y, z) => {
      let d = 1e9;
      for (const [a, b, ra, rb, k] of hand) d = smin(d, cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), k);
      return d;
    }, [...lo, ...hi], res, { aoDist: 0.008, minTris: 30, smooth: 1 });
  }
  return hangingHand;
}
