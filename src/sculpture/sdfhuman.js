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
// 臉部比例（三庭五眼）：髮際線、眉、鼻底、嘴縫、下巴底的高度，與下巴前緣、鼻尖的前後位置。
//   男：三庭約 1：1：1，下巴寬、在唇前垂直線上，鼻人中角約 100°（鼻尖幾乎不翹）。
//   女：三庭約 1：1：0.8，下巴小而尖、比垂直線後約 3 mm，鼻人中角約 106°（鼻尖微翹），眼睛略大、兩頰較飽滿。
// 單位：身高 = 1（約 1.7 m，所以 0.0018 ≈ 3 mm）。五眼：眼長 ≈ 兩眼間距 ≈ 0.0185，臉寬 ≈ 5 眼。
export const FACE = {
  m: { hairline: 0.058, brow: 0.02, noseBase: -0.018, mouth: -0.031, chin: -0.058, chinR: 0.0145, chinW: 1.2, chinZ: 0.061, eyeR: 0.0092, tipUp: 0.002, noseK: 1.0, jaw: 1 },
  f: { hairline: 0.056, brow: 0.02, noseBase: -0.016, mouth: -0.025, chin: -0.0355, chinR: 0.0105, chinW: 0.95, chinZ: 0.0575, eyeR: 0.0101, tipUp: 0.0048, noseK: 0.86, jaw: 0 },
};

function headField(x, y, z, P) {
  const ax = abs(x), f = P.fem ? 0.9 : 1, F = P.fem ? FACE.f : FACE.m;
  const lowMid = (F.noseBase + F.chin) / 2, lowH = (F.noseBase - F.chin) / 2;
  // 顱骨 + 下半臉（下庭的長度由下巴底決定）
  let d = ell(x, y, z, 0, 0, 0, 0.05, 0.068, 0.057);
  d = smin(d, ell(ax, y, z, 0, lowMid + 0.005, 0.014, P.fem ? 0.0405 : 0.0435, lowH + 0.005, 0.042), P.fem ? 0.026 : 0.016);    // 下半臉（女性較窄，臉呈鵝蛋形）
  // 下巴：男寬而方、在唇前垂直線上；女小而尖、稍微後縮
  d = smin(d, ell(ax, y, z, 0, F.chin + F.chinR, F.chinZ - F.chinR, F.chinR * F.chinW, F.chinR, F.chinR), 0.012);
  // 下顎角：男性明顯（稜角），女性省略（線條柔和）
  if (F.jaw) d = smin(d, ell(ax, y, z, 0.037, F.chin + 0.02, 0.006, 0.011, 0.012, 0.016), 0.012);
  // 顴骨與臉頰：女性較低、較飽滿
  // 女性用較小、較深的臉頰球配大的融合半徑：圓潤但不鼓出來
  d = P.fem ? smin(d, ball(ax, y, z, 0.029, -0.012, 0.035, 0.015), 0.016) : smin(d, ball(ax, y, z, 0.033, -0.009, 0.04, 0.0158), 0.014);
  // 女性瓜子臉：顴骨以下往下巴收窄（只削臉的前半部，耳朵、後腦、脖子不動）
  let jaw = -1e9;
  if (P.fem) {
    const u = clamp((-0.004 - y) / (-0.004 - F.chin), 0, 1);
    const w = 0.046 - 0.032 * u ** 2.2
      + 0.08 * sstep(-0.008, 0.0, y)                             // 顴骨以上不削
      + 0.08 * sstep(-F.chin + 0.003, -F.chin + 0.012, -y)      // 下巴以下（脖子）不削
      + 0.06 * (1 - sstep(-0.015, 0.015, z));                    // 臉的前半部才削
    jaw = ax - w;
    d = smax(d, jaw, 0.01);
  }
  const browK = (P.fem ? 0.8 : 1.18) * (0.9 + 0.2 * P.seed);
  d = smin(d, cone(ax, y, z, 0, F.brow, 0.0455, 0.039, F.brow - 0.0015, 0.04, 0.0105 * browK, 0.0095 * browK), 0.012); // 眉骨（男性較突出）
  // 眼：先挖眼窩，再放回略凹的眼球與上眼瞼（女性眼睛略大）
  const ey = F.brow - 0.0145;
  d = smax(d, -ball(ax, y, z, 0.0185, ey, 0.0525, F.eyeR + 0.0012), 0.006);
  d = smin(d, ball(ax, y, z, 0.0185, ey, 0.0478, F.eyeR), 0.004);
  d = smin(d, ell(ax, y, z, 0.0185, ey + 0.008, 0.05, F.eyeR + 0.0013, 0.0042, 0.0075), 0.004);
  // 鼻：鼻樑、鼻頭、鼻翼、鼻孔。男鼻樑較高（約 36°），女較小且鼻尖上翹（鼻人中角較大）
  const nl = (0.0145 + 0.003 * (P.seed - 0.5)) * F.noseK, nb = F.noseBase;
  d = smin(d, cone(ax, y, z, 0, F.brow - 0.006, 0.051, 0, nb + 0.006 + F.tipUp * 0.5, 0.054 + nl, 0.0092 * F.noseK, 0.0078 * F.noseK), 0.008);
  d = smin(d, ball(ax, y, z, 0, nb + 0.0035 + F.tipUp, 0.0545 + nl, 0.0082 * F.noseK), 0.005);
  d = smin(d, ball(ax, y, z, 0.0092 * F.noseK, nb + 0.0015, 0.0475 + nl * 0.9, 0.0058 * F.noseK), 0.005);
  d = smax(d, -ball(ax, y, z, 0.0052 * F.noseK, nb - 0.0005 + F.tipUp * 0.3, 0.0555 + nl * 0.95, 0.0034 * F.noseK), 0.003);
  // 嘴：上唇、下唇、嘴縫（位於下庭上方約三分之一）
  const my = F.mouth;
  d = smin(d, ell(ax, y, z, 0, my + 0.0052, 0.0552, 0.0125 * f, 0.0048, 0.0058), 0.005);
  d = smin(d, ell(ax, y, z, 0, my - 0.0046, 0.0545, 0.0112 * f, 0.0052, 0.0058), 0.005);
  d = smax(d, -ell(ax, y, z, 0, my, 0.0586, 0.0135 * f, 0.0011, 0.0045), 0.0011);
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
    h = smax(h, -ell(x, y, z, 0, F.hairline - 0.066, 0.052, 0.046, 0.066, 0.036), 0.007); // 留出臉（上庭到髮際線）
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
    let b = ell(x, y, z, 0, F.chin, 0.034, 0.037, 0.05, 0.03);
    b = smin(b, cone(ax, y, z, 0.0425, 0.0, 0.012, 0.034, -0.045, 0.03, 0.0085, 0.01), 0.008);   // 鬢角
    b = smin(b, cone(ax, y, z, 0, my + 0.009, 0.0625, 0.019, my - 0.002, 0.0555, 0.0072, 0.0052), 0.005); // 鬍鬚
    b -= 0.0032 * max(0, sin(x * 230 + 4 * sin(y * 60)));
    d = smin(d, b, 0.008);
    hr = smin(hr, b, 0.008);
    d = smax(d, -ell(ax, y, z, 0, my, 0.0606, 0.01, 0.0011, 0.006), 0.0011);                 // 嘴縫仍看得到
  }
  if (P.fem) hr = smax(hr, jaw, 0.01);   // 頭髮也跟著削，否則削掉的臉頰會露出頭髮內側
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
