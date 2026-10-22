// src/sculpture/figure.js — 程式生成的哥德式人像
// 人像以「身高 = 1」的正規化座標建立：腳底 y = 0，面向 +Z，人物的右手在 -X。
// 由呼叫者以矩陣縮放到實際高度。坐像（pose 'seat'）高度約 0.72（同一套頭身比例）。
import * as THREE from 'three';
import { smooth, lerp, clamp, transM, scaleM } from './geo.js';
import { sdfHead, sdfArm, addMesh } from './sdfhuman.js';

const TAU = Math.PI * 2;
const HEAD_Y = 0.918;       // 站像頭中心
const SHOULDER_Y = 0.775;
export const SEAT_DROP = 0.28; // 坐像上半身下移量
export const SEAT_HEIGHT = 1 - SEAT_DROP;

// 身體斷面表 [y, 半寬 a, 半深 b, 前後中心 cz]
const PROFILE_STAND = [
  [0.000, 0.132, 0.112, 0.014], [0.025, 0.134, 0.114, 0.014], [0.10, 0.126, 0.104, 0.010],
  [0.25, 0.116, 0.092, 0.005], [0.42, 0.106, 0.082, 0.0], [0.53, 0.102, 0.077, 0.0],
  [0.62, 0.108, 0.080, 0.004], [0.70, 0.116, 0.082, 0.006], [0.76, 0.122, 0.076, 0.0],
  [0.795, 0.106, 0.066, -0.004], [0.818, 0.066, 0.052, -0.004], [0.835, 0.040, 0.040, 0.0], [0.86, 0.036, 0.038, 0.004],
];
const PROFILE_SEAT = [
  [0.000, 0.160, 0.150, 0.110], [0.025, 0.162, 0.152, 0.110], [0.15, 0.158, 0.145, 0.100],
  [0.23, 0.160, 0.150, 0.085], [0.27, 0.158, 0.150, 0.075], [0.295, 0.140, 0.125, 0.045],
  [0.315, 0.118, 0.088, 0.004],
  ...PROFILE_STAND.filter((r) => r[0] >= 0.62).map(([y, a, b, c]) => [y - SEAT_DROP, a, b, c]),
];
const PROFILE_NUDE = [ // 從胯下起（腿另做）
  [0.44, 0.095, 0.070, 0.0], [0.48, 0.112, 0.078, 0.0], [0.53, 0.104, 0.072, 0.006],
  [0.60, 0.100, 0.072, 0.010], [0.68, 0.118, 0.078, 0.012], [0.74, 0.130, 0.080, 0.008],
  [0.79, 0.140, 0.072, -0.002], [0.82, 0.120, 0.064, -0.004], [0.84, 0.060, 0.050, -0.004],
  [0.855, 0.040, 0.040, 0.0], [0.875, 0.036, 0.038, 0.004],
];

function sampleProfile(tab, y) {
  if (y <= tab[0][0]) return tab[0];
  for (let k = 1; k < tab.length; k++) {
    if (y <= tab[k][0]) {
      const a = tab[k - 1], b = tab[k];
      const t = smooth(0, 1, (y - a[0]) / (b[0] - a[0]));
      return [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
    }
  }
  return tab[tab.length - 1];
}

// 手臂姿勢：相對肩膀的肘、腕位置（s = 側別，人物右手 s = -1）
const ARM = {
  chest: [[0.135, -0.16, 0.01], [0.05, -0.15, 0.11]],
  down: [[0.135, -0.16, 0.0], [0.125, -0.31, 0.06]],
  side: [[0.135, -0.16, 0.0], [0.105, -0.27, 0.09]],
  raised: [[0.16, -0.14, 0.04], [0.12, -0.01, 0.09]],
  forward: [[0.135, -0.16, 0.02], [0.09, -0.22, 0.14]],
  out: [[0.18, -0.12, 0.04], [0.24, -0.16, 0.12]],
  lap: [[0.135, -0.15, 0.05], [0.08, -0.21, 0.19]],
  pray: [[0.125, -0.16, 0.05], [0.022, -0.11, 0.12]],
  hold: [[0.13, -0.16, 0.04], [0.06, -0.12, 0.14]],
  trumpet: [[0.13, -0.08, 0.09], [0.05, -0.05, 0.17]],
  shade: [[0.16, -0.07, 0.05], [0.06, 0.07, 0.11]],
  cheek: [[0.1, -0.19, 0.14], [0.04, 0.03, 0.11]],
};

/** 依參數產生規格（隨機變化），r = rng */
export function spec(kind, r, over = {}) {
  const s = {
    kind, pose: 'stand', foldN: r.int(22, 30), foldDepth: r.range(0.026, 0.034), foldPhase: r.range(0, TAU), sway: r.range(0.1, 0.35),
    mantle: { y: r.range(0.28, 0.45), slope: r.range(-0.12, 0.12) }, contra: r.range(-0.04, 0.04),
    head: { beard: 0, hair: 'short', crown: false, mitre: false, cap: false, halo: null, veil: false, beast: false, turn: r.range(-0.15, 0.15), tilt: r.range(-0.05, 0.1), female: false },
    arms: { R: 'chest', L: 'chest' }, hold: {}, wings: null, child: false, lod: 1, feet: true, headless: false, dirt: r.range(0.9, 1.0),
  };
  const h = s.head;
  switch (kind) {
    case 'apostle': h.beard = 1; h.hair = r.pick(['curly', 'long', 'curly']); h.halo = 'plain'; s.arms = { R: r.pick(['chest', 'side']), L: 'chest' }; s.hold = { L: r.pick(['book', 'book', 'scroll']) }; break;
    case 'peter': h.beard = 1; h.hair = 'curly'; h.halo = 'plain'; s.arms = { R: 'chest', L: 'hold' }; s.hold = { L: 'key' }; break;
    case 'paul': h.beard = 1; h.hair = 'bald'; h.halo = 'plain'; s.arms = { R: 'side', L: 'chest' }; s.hold = { R: 'sword', L: 'book' }; break;
    case 'john': h.beard = 0; h.hair = 'curly'; h.halo = 'plain'; s.arms = { R: 'chest', L: 'chest' }; s.hold = { L: 'book' }; break;
    case 'king': h.beard = r.chance(0.8) ? 1 : 0; h.hair = r.pick(['curly', 'long']); h.crown = true; s.arms = { R: r.pick(['side', 'chest']), L: r.pick(['chest', 'side', 'hold']) };
      s.hold = r.chance(0.5) ? { R: 'scepter' } : { L: 'scepter' }; if (r.chance(0.35)) s.hold[s.hold.R ? 'L' : 'R'] = 'book'; break;
    case 'queen': h.female = true; h.veil = true; h.crown = true; s.arms = { R: 'side', L: 'chest' }; s.hold = { R: 'scepter', L: 'book' }; break;
    case 'virgin': h.female = true; h.veil = true; h.crown = true; s.child = true; s.arms = { R: 'forward', L: 'hold' }; s.hold = { R: 'scepter' }; s.contra = 0.05; break;
    case 'virginPlain': h.female = true; h.veil = true; h.crown = true; s.arms = { R: 'chest', L: 'chest' }; s.hold = { L: 'book' }; break;
    case 'christ': h.beard = 1; h.hair = 'long'; h.halo = 'cross'; s.arms = { R: 'raised', L: 'chest' }; s.hold = { L: 'book' }; break;
    case 'christJudge': h.beard = 1; h.hair = 'long'; h.halo = 'cross'; s.arms = { R: 'raised', L: 'raised' }; s.pose = 'seat'; s.mantle = { y: 0.3, slope: 0.1 }; break;
    case 'bishop': h.beard = r.chance(0.4) ? 1 : 0; h.mitre = true; h.hair = 'short'; s.arms = { R: 'raised', L: 'hold' }; s.hold = { L: 'crozier' }; break;
    case 'deacon': h.hair = 'tonsure'; s.mantle = null; s.foldN = r.int(16, 22); s.arms = { R: 'chest', L: 'chest' }; s.hold = { L: 'book' }; h.halo = 'plain'; break;
    case 'angel': h.hair = 'curly'; s.wings = 'feather'; s.arms = { R: r.pick(['forward', 'hold']), L: r.pick(['forward', 'hold']) }; s.hold = { R: r.pick(['candle', 'censer', null]) }; break;
    case 'prophet': h.beard = 1; h.hair = 'long'; h.cap = true; s.arms = { R: 'chest', L: 'forward' }; s.hold = { L: 'scroll' }; break;
    case 'elder': h.beard = 1; h.hair = 'curly'; h.crown = true; s.pose = 'seat'; s.arms = { R: 'lap', L: 'hold' }; s.hold = { L: r.pick(['vial', 'book']) }; break;
    case 'woman': h.female = true; h.veil = true; s.arms = { R: r.pick(['chest', 'pray']), L: 'chest' }; s.hold = r.chance(0.5) ? { L: 'book' } : {}; break;
    case 'monk': h.hair = 'tonsure'; h.beard = r.chance(0.5) ? 1 : 0; s.mantle = null; s.arms = { R: 'chest', L: 'chest' }; s.hold = { L: 'book' }; break;
    case 'soul': h.hair = r.pick(['curly', 'short']); s.mantle = null; s.foldDepth *= 0.6; s.arms = { R: 'pray', L: 'pray' }; break;
    case 'devil': h.beast = 'devil'; s.wings = 'bat'; s.mantle = null; s.foldDepth = 0.006; s.foldN = 9; s.arms = { R: 'out', L: 'out' }; s.hunch = 0.06; break;
    case 'denis': h.mitre = true; s.headless = true; s.arms = { R: 'hold', L: 'hold' }; s.hold = { R: 'head' }; break;
    case 'ecclesia': h.female = true; h.veil = true; h.crown = true; s.arms = { R: 'side', L: 'hold' }; s.hold = { R: 'crossStaff', L: 'chalice' }; break;
    case 'synagoga': h.female = true; h.veil = true; h.blindfold = true; h.tilt = 0.25; h.turn = 0.3; s.arms = { R: 'side', L: 'down' }; s.hold = { R: 'brokenLance', L: 'tablets' }; break;
    case 'stephen': h.hair = 'tonsure'; s.mantle = null; h.halo = 'plain'; s.arms = { R: 'chest', L: 'chest' }; s.hold = { L: 'book' }; s.stones = true; break;
    case 'adam': s.pose = 'nude'; h.hair = 'curly'; h.beard = 1; s.arms = { R: 'down', L: 'chest' }; s.mantle = null; break;
    case 'eve': s.pose = 'nude'; h.female = true; h.hair = 'long'; s.arms = { R: 'down', L: 'chest' }; s.mantle = null; s.hold = { L: 'apple' }; break;
    case 'knight': h.beard = r.chance(0.5) ? 1 : 0; h.hair = 'curly'; h.helm = true; s.arms = { R: 'side', L: 'chest' }; s.hold = { R: 'sword' }; s.foldDepth *= 0.7; break;
    case 'thomas': h.beard = 1; h.hair = 'curly'; s.arms = { R: 'shade', L: 'chest' }; s.hold = { L: 'square' }; break;
    default: break;
  }
  return deepMerge(s, over);
}

function deepMerge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

// 解析度
const RES = [
  { bu: 26, bv: 22, hu: 14, hv: 10, au: 6, as: 6 },   // 0 遠
  { bu: 44, bv: 36, hu: 20, hv: 14, au: 7, as: 8 },   // 1 中
  { bu: 64, bv: 52, hu: 28, hv: 20, au: 9, as: 12 },  // 2 近
];

/** 在 M 目前的座標系（正規化 1 = 身高）畫一尊人像 */
export function figure(M, S) {
  const R = RES[S.lod];
  // 近看的人像（lod 2）：臉、手與袖子改用雕刻式網格（見 sdfhuman.js）；野獸、裸像、無頭像維持原做法
  const sdf = (S.lod === 2 || S.sdf === true) && S.pose !== 'nude' && !S.headless && !S.head.beast && S.sdf !== false;
  S.head.sdf = sdf;
  if (sdf && S.head.seed === undefined) S.head.seed = Math.floor((S.foldPhase / TAU) * 4) % 4;
  const seat = S.pose === 'seat', nude = S.pose === 'nude';
  const drop = seat ? SEAT_DROP : 0;
  const shY = SHOULDER_Y - drop;
  const hunch = S.hunch || 0;
  M.tone = (M.tone || 1) * S.dirt;

  // ---- 身體 ----
  if (nude) nudeBody(M, S, R);
  else robe(M, S, R, seat ? PROFILE_SEAT : PROFILE_STAND, seat);

  // ---- 頭 ----
  if (!S.headless) {
    M.push(new THREE.Matrix4().compose(new THREE.Vector3(0, HEAD_Y - drop, 0.005 + hunch), new THREE.Quaternion().setFromEuler(new THREE.Euler(S.head.tilt, S.head.turn, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    head(M, S.head, R);
    M.pop();
  }

  // ---- 腳 ----
  if (S.feet && !seat && !nude) {
    for (const s of [-1, 1]) M.ellipsoid(s * 0.045, 0.012, 0.115, 0.032, 0.017, 0.05, 8, 5, 0.85);
  } else if (seat && S.feet) {
    for (const s of [-1, 1]) M.ellipsoid(s * 0.05, 0.012, 0.24, 0.032, 0.017, 0.05, 8, 5, 0.85);
  }

  // ---- 手臂 ----
  const hands = {};
  for (const side of ['R', 'L']) {
    const s = side === 'R' ? -1 : 1;
    const pose = ARM[S.arms[side]] || ARM.chest;
    const sh = [s * 0.1, shY - 0.005, -0.005 + hunch * 0.5];
    const el = [s * pose[0][0], shY + pose[0][1], pose[0][2]];
    const wr = [s * pose[1][0], shY + pose[1][1], pose[1][2]];
    const dx = wr[0] - el[0], dy = wr[1] - el[1], dz = wr[2] - el[2];
    const L = Math.hypot(dx, dy, dz);
    const hand = [wr[0] + dx / L * 0.03, wr[1] + dy / L * 0.03, wr[2] + dz / L * 0.03];
    hands[side] = { pos: hand, dir: [dx / L, dy / L, dz / L], s };
    if (sdf) {
      const A = sdfArm(S.arms[side], pose);
      M.push(transM(sh[0], sh[1], sh[2]));
      if (s < 0) M.push(scaleM(-1, 1, 1));   // 做的是 +X 側；-X 側鏡射（Mesher 會自動處理繞向）
      addMesh(M, A.sleeve); addMesh(M, A.hand);
      if (s < 0) M.pop();
      M.pop();
    } else {
      const sleeve = nude ? [0.03, 0.026, 0.022, 0.02] : [0.04, 0.036, 0.034, 0.036];
      M.tube([sh, el, wr], [sleeve[0], sleeve[1], sleeve[3]], R.au, R.as, 0.9);
      if (!nude && dy < 0.12) sleeveDrape(M, el, wr, s, R);
      M.ellipsoid(hand[0], hand[1], hand[2], 0.017, 0.026, 0.016, 7, 5, 0.95);
    }
  }

  // ---- 持物 ----
  for (const side of ['R', 'L']) {
    const o = S.hold[side];
    if (o) attribute(M, o, hands[side], hands, S, R);
  }
  if (S.child) child(M, hands.L, S);
  if (S.wings) wings(M, S, shY, R);
  if (S.stones) for (let k = 0; k < 3; k++) M.ellipsoid(0.03 * (k - 1), 0.84 - drop - k * 0.012, 0.075, 0.018, 0.018, 0.014, 6, 4, 0.8);
  return hands;
}

// 寬袖／斗篷從前臂垂下的布片（鋸齒狀下緣）
function sleeveDrape(M, el, wr, s, R) {
  const dx = wr[0] - el[0], dz = wr[2] - el[2];
  const Lh = Math.hypot(dx, dz) || 0.01;
  const X = [dx / Lh, 0, dz / Lh];
  const Z = [-X[2], 0, X[0]];
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...Z));
  m.setPosition(el[0], el[1], el[2]);
  M.push(m);
  const L = Lh, dy = wr[1] - el[1];
  const pts = [[-0.01, 0.01], [L * 0.5, dy * 0.5 + 0.015], [L, dy + 0.01], [L * 0.97, dy - 0.07], [L * 0.8, dy - 0.1], [L * 0.6, dy - 0.13], [L * 0.4, dy - 0.12], [L * 0.2, dy - 0.1], [0.0, -0.08]];
  M.extrude(pts, 0.045, 0.8, 0.6);
  M.pop();
}

// ---------------------------------------------------------------------------
// 長袍：參數斷面 + 垂直深溝衣褶 + 斗篷下擺
// ---------------------------------------------------------------------------
function robe(M, S, R, tab, seat) {
  const yTop = tab[tab.length - 1][0];
  const N = S.foldN, depth = S.foldDepth, ph = S.foldPhase, sway = S.sway;
  const mant = S.mantle;
  const contra = S.contra;
  const hunch = S.hunch || 0;
  const yStart = S.yStart || 0;
  M.grid(R.bu, S.yStart ? Math.round(R.bv * 0.5) : R.bv, (u, v, o, i, j) => {
    // 下半部取樣較密
    const vy = v * v * 0.35 + v * 0.65;
    const y = yStart + vy * (yTop - yStart);
    const [, a, b, cz] = sampleProfile(tab, y);
    const ang = u * TAU;
    const cu = Math.cos(ang), su = Math.sin(ang);
    const se = 2 / 2.6;
    let x = a * Math.sign(cu) * Math.pow(Math.abs(cu), se);
    let z = cz + b * Math.sign(su) * Math.pow(Math.abs(su), se);
    const front = 0.4 + 0.6 * smooth(-0.6, 0.5, su);
    const hf = clamp(1 - y / (yTop * 0.92)); // 往上衣褶變淺
    // 主要垂直衣褶：|sin|^0.45 → 圓脊 + 銳利深溝
    const bend = sway * Math.sin(y * 5.0 + ph) * (1 - y);
    const sN = Math.abs(Math.sin(N * ang / 2 + ph + bend * 3));
    const ridge = Math.pow(sN, 0.38);
    let fd = depth * (0.45 + 0.55 * hf) * smooth(0, 0.12, hf);
    // 坐像膝上：衣褶在膝蓋之間呈 V 形，大腿上方較平
    if (seat && y > 0.24 && y < 0.31) fd *= 0.35;
    let dr = fd * front * (ridge - 0.75);
    dr += 0.006 * Math.sin(3 * ang + y * 7 + ph) * hf;
    let c = 0.42 + 0.58 * ridge * ridge;
    // 斗篷：前方斜向下擺，斗篷層較厚並有自己的斜褶
    if (mant) {
      const l = cu; // -1..1 側向
      const yHem = lerp(0.05, mant.y + mant.slope * l + 0.07 * l * l - (seat ? SEAT_DROP * 0.5 : 0), smooth(-0.3, 0.4, su));
      const inM = smooth(yHem - 0.012, yHem + 0.004, y);
      if (y > yHem - 0.02 && y < 0.79) {
        const s2 = Math.abs(Math.sin(N * 0.7 * ang / 2 + (y - yHem) * 9 * l + ph * 1.7));
        const r2 = Math.pow(s2, 0.5);
        dr += inM * (0.014 + 0.012 * front * (r2 - 0.7) * hf);
        c = lerp(c, 0.6 + 0.4 * r2, inM);
      }
      // 下擺正下方的陰影
      c *= 1 - 0.35 * Math.exp(-(((y - yHem + 0.015) / 0.014) ** 2)) * front;
    }
    // 對立式站姿（hip sway）
    x += contra * Math.sin(Math.PI * clamp(y / 0.8)) * 0.6;
    // 駝背（魔鬼）
    z += hunch * smooth(0.4, 0.85, y);
    const k = 1 + dr / Math.max(0.05, Math.hypot(a, b) * 0.7);
    x *= k; z = cz + (z - cz) * k;
    // 下擺波浪
    let yy = y;
    if (j === 0 && !yStart) yy += 0.012 * ridge;
    c *= 0.82 + 0.18 * smooth(0, 0.25, y);
    o[0] = x; o[1] = yy; o[2] = z; o[3] = c;
  }, { cap0: true, cap1: true });
}

function nudeBody(M, S, R) {
  const tab = PROFILE_NUDE;
  const y0 = tab[0][0], y1 = tab[tab.length - 1][0];
  const fem = S.head.female;
  M.grid(Math.round(R.bu * 0.7), Math.round(R.bv * 0.6), (u, v, o) => {
    const y = lerp(y0, y1, v);
    let [, a, b, cz] = sampleProfile(tab, y);
    const ang = u * TAU, cu = Math.cos(ang), su = Math.sin(ang);
    let x = a * cu, z = cz + b * su;
    // 胸、腹肌暗示
    const fr = smooth(0.2, 0.9, su);
    if (fem) z += fr * 0.03 * Math.exp(-(((y - 0.71) / 0.035) ** 2)) * Math.exp(-(((Math.abs(cu) - 0.45) / 0.25) ** 2));
    else z += fr * 0.01 * Math.exp(-(((y - 0.72) / 0.03) ** 2));
    o[0] = x; o[1] = y; o[2] = z; o[3] = 0.95;
  }, { cap0: true, cap1: true });
  for (const s of [-1, 1]) {
    M.tube([[s * 0.055, 0.48, 0.0], [s * 0.058, 0.27, 0.012], [s * 0.05, 0.05, -0.005]], [0.065, 0.045, 0.03], R.au + 1, R.as, 0.92);
    M.ellipsoid(s * 0.05, 0.015, 0.03, 0.03, 0.018, 0.06, 7, 4, 0.85);
  }
  // 無花果葉
  M.ellipsoid(0, 0.455, 0.075, 0.045, 0.05, 0.015, 8, 5, 0.8);
}

// ---------------------------------------------------------------------------
// 頭：眼窩、鼻、口、下巴、鬍子、頭髮；頭冠、主教冠、光環、面紗
// ---------------------------------------------------------------------------
export function head(M, H, R) {
  M.push(scaleM(1.17));
  headInner(M, H, R);
  M.pop();
}

function headInner(M, H, R) {
  const rx = 0.05, ry = 0.068, rz = 0.057;
  if (H.beast) { beastFaceSmall(M, H, R); return; }
  if (H.sdf) { addMesh(M, sdfHead(H)); headAccessories(M, H, R); return; }
  const fem = H.female;
  const curly = H.hair === 'curly', long = H.hair === 'long', bald = H.hair === 'bald', tons = H.hair === 'tonsure';
  const covered = H.veil || H.cap || H.mitre || H.helm;
  M.grid(R.hu, R.hv, (u, v, o) => {
    const th = Math.PI * (1 - v), ph = u * TAU;
    const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
    let k = 1, c = 1, yo = 0;
    const fW = smooth(0.25, 0.75, dz);
    // 眼窩
    let eye = 0;
    for (const e of [-0.36, 0.36]) eye += Math.exp(-(((dx - e) ** 2) + ((dy - 0.06) ** 2)) / 0.02);
    k -= 0.2 * fW * eye; c -= 0.3 * fW * eye;
    // 眉弓
    k += 0.05 * fW * Math.exp(-(((dy - 0.22) ** 2) / 0.006)) * smooth(0.7, 0.3, Math.abs(dx));
    // 鼻
    const nose = Math.exp(-(dx * dx) / 0.008) * clamp((0.14 - dy) / 0.38) * smooth(-0.34, -0.22, dy);
    k += 0.36 * nose * fW;
    // 口
    const mouth = Math.exp(-((dx * dx) / 0.03 + ((dy + 0.43) ** 2) / 0.0018));
    k -= 0.05 * mouth * fW; c -= 0.15 * mouth * fW;
    // 下巴收窄
    const jaw = smooth(0.0, -0.85, dy);
    let sx = 1 - 0.22 * jaw;
    k += 0.05 * Math.exp(-((dx * dx) / 0.03 + ((dy + 0.66) ** 2) / 0.01)) * fW;
    // 頭髮：臉以外的區域
    const faceMask = smooth(0.3, 0.6, dz) * smooth(0.5, 0.3, dy) * smooth(-0.95, -0.6, dy);
    if (!covered && !bald) {
      const hairT = tons ? smooth(0.55, 0.45, dy) : 1;
      const hairAmt = (1 - faceMask) * smooth(-0.75, -0.2, dy) * hairT;
      let curl = 0;
      if (curly) curl = 0.06 * Math.abs(Math.sin(dx * 13 + dy * 4) * Math.sin(dy * 15 - dz * 6));
      else curl = 0.03 * Math.abs(Math.sin(Math.atan2(dz, dx) * 14 + dy * 2));
      k += hairAmt * (0.14 + curl * 1.6);
      c -= hairAmt * curl * 4;
      if (long || fem) {
        const back = smooth(0.35, -0.4, dz) * smooth(0.2, -0.6, dy);
        yo -= back * (fem ? 0.1 : 0.07); k += back * 0.12;
      }
    }
    if (bald) k += (1 - faceMask) * smooth(-0.7, -0.3, dy) * smooth(0.4, 0.2, dy) * 0.06;
    // 鬍子
    if (H.beard) {
      const bm = smooth(-0.32, -0.62, dy) * smooth(0.0, 0.5, dz);
      const curls = 0.04 * Math.abs(Math.sin(dx * 18) * Math.sin(dy * 20 + dx * 3));
      k += bm * (0.12 + curls * 1.2) - 0.05 * mouth * fW;
      yo -= 0.04 * bm * smooth(-0.3, -0.9, dy) * smooth(-0.2, 0.5, dz);
      c -= bm * curls * 4;
    }
    o[0] = rx * dx * k * sx; o[1] = ry * dy * k + yo; o[2] = rz * dz * k; o[3] = clamp(c, 0.35, 1);
  });
  // 頸
  M.rod([0, -0.07, -0.005], [0, -0.03, 0.0], 0.03, 0.03, 8, 0.85);
  // 耳（被頭髮蓋住時省略）
  if (H.hair === 'tonsure' || bald) for (const s of [-1, 1]) M.ellipsoid(s * 0.049, 0.0, -0.003, 0.008, 0.018, 0.012, 6, 4, 0.85);
  headAccessories(M, H, R);
}

// 頭飾：頭紗、王冠、主教冠、尖帽、頭盔、蒙眼布、光環（雕刻式頭與舊式頭共用）
function headAccessories(M, H, R) {
  if (H.veil) veil(M, R, H);
  if (H.crown) crown(M, R, H.veil ? 1.1 : 1.02);
  if (H.mitre) {
    M.push(transM(0, 0.04, -0.004));
    M.lathe([[0, 0], [0.054, 0], [0.058, 0.03], [0.046, 0.08], [0.018, 0.12], [0, 0.13]], R.hu, 0.95, { sz: 0.55 });
    M.pop();
    M.lathe([[0, 0.035], [0.054, 0.035], [0.056, 0.05], [0, 0.05]], R.hu, 0.85, { sz: 1.1 });
  }
  if (H.cap) { // 尖頂猶太帽（先知）
    M.push(transM(0, 0.035, -0.005));
    M.lathe([[0, -0.01], [0.058, -0.01], [0.06, 0.005], [0.035, 0.045], [0.008, 0.085], [0, 0.09]], R.hu, 0.9, { sz: 1.08 });
    M.pop();
  }
  if (H.helm) {
    M.push(transM(0, 0.02, -0.003));
    M.lathe([[0, -0.01], [0.058, -0.01], [0.06, 0.03], [0.045, 0.07], [0, 0.085]], R.hu, 0.8, { sz: 1.12 });
    M.pop();
  }
  if (H.blindfold) M.lathe([[0.058, 0.04], [0.06, 0.05], [0.06, 0.07], [0.058, 0.08]].map(([r, y]) => [r, y - 0.05]), R.hu, 0.7, { sz: 1.15 });
  if (H.halo) halo(M, R, H.halo === 'cross');
}

function veil(M, R, H) {
  // 頭紗：前方開口的殼，從頭頂往下張開到肩
  const rx = 0.05, rz = 0.057;
  const a0 = 0.95;
  for (const [sc, rev, cc] of [[1, false, 0.92], [0.94, true, 0.6]]) {
    M.grid(R.hu, Math.round(R.hv * 0.8), (u, v, o) => {
      const ang = Math.PI / 2 + a0 + u * (TAU - 2 * a0);
      const t = 1 - v; // t=0 頂、1 底
      let y, r;
      if (t < 0.35) { const p = (t / 0.35) * Math.PI / 2; y = 0.072 * 1.08 * Math.cos(p) + 0.01; r = 1.18 * Math.sin(p); }
      else { const q = (t - 0.35) / 0.65; y = 0.01 - q * 0.17; r = 1.18 + q * q * 0.9; }
      const fold = 0.06 * Math.abs(Math.sin(ang * 7)) * smooth(0.4, 1, t);
      r = (r + fold) * sc;
      o[0] = rx * r * Math.cos(ang); o[1] = y; o[2] = rz * r * Math.sin(ang) - 0.008 * t; o[3] = cc * (0.8 + 0.2 * (1 - fold * 8));
    }, { wrap: false, rev, cap1: false });
  }
}

function crown(M, R, scale) {
  const r0 = 0.052 * scale;
  M.push(transM(0, 0.045, -0.003));
  M.lathe([[r0 * 0.92, 0], [r0, 0], [r0 * 1.08, 0.028], [r0, 0.028], [r0 * 0.94, 0.01]], R.hu, 0.95, { sz: 1.1 });
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + Math.PI / 2;
    const x = Math.cos(a) * r0 * 1.04, z = Math.sin(a) * r0 * 1.04 * 1.1;
    M.push(transM(x, 0.028, z));
    M.lathe([[0, 0], [0.01, 0], [0.011, 0.01], [0.003, 0.02], [0, 0.024]], 5, 1);
    M.pop();
  }
  M.pop();
}

function halo(M, R, cross) {
  M.push(new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(transM(0, 0.02, -0.075)));
  M.lathe([[0, -0.006], [0.13, -0.006], [0.135, 0.0], [0.13, 0.006], [0, 0.006]].map(([r, y]) => [r, y]), Math.max(16, R.hu), 0.9);
  M.pop();
  if (cross) {
    M.box(0, 0.11, -0.065, 0.03, 0.05, 0.012, 0.95);
    M.box(-0.1, 0.02, -0.065, 0.05, 0.03, 0.012, 0.95);
    M.box(0.1, 0.02, -0.065, 0.05, 0.03, 0.012, 0.95);
  }
}

// 魔鬼的獸面（人身上的頭）
function beastFaceSmall(M, H, R) {
  M.ellipsoid(0, 0, 0, 0.055, 0.065, 0.058, R.hu, R.hv, 0.85, (dx, dy, dz) => {
    const eye = Math.exp(-(((Math.abs(dx) - 0.4) ** 2) + ((dy - 0.2) ** 2)) / 0.02) * smooth(0.2, 0.7, dz);
    return [1 + 0.12 * Math.abs(Math.sin(dx * 9) * Math.sin(dy * 7)) - 0.15 * eye, 0.85 - 0.4 * eye];
  });
  // 口鼻
  M.ellipsoid(0, -0.025, 0.05, 0.035, 0.03, 0.04, 10, 6, 0.8);
  M.ellipsoid(0, -0.05, 0.045, 0.03, 0.012, 0.035, 8, 5, 0.4);
  for (const s of [-1, 1]) {
    M.tube([[s * 0.035, 0.045, -0.005], [s * 0.06, 0.09, -0.01], [s * 0.05, 0.13, -0.03]], [0.014, 0.008, 0.002], 6, 6, 0.85);
    M.ellipsoid(s * 0.058, 0.02, -0.01, 0.012, 0.03, 0.008, 6, 4, 0.8);
  }
}

// ---------------------------------------------------------------------------
// 持物
// ---------------------------------------------------------------------------
function attribute(M, kind, hand, hands, S, R) {
  const [x, y, z] = hand.pos, s = hand.s;
  switch (kind) {
    case 'book': {
      // 若雙手在胸前，書放在兩手之間
      const other = hands[s < 0 ? 'L' : 'R'];
      const both = Math.abs(other.pos[1] - y) < 0.05 && Math.abs(other.pos[0] - x) < 0.16;
      const bx = both ? (x + other.pos[0]) / 2 : x, by = both ? Math.max(y, other.pos[1]) + 0.02 : y + 0.03;
      M.pushTRS(bx, by, z + 0.005, -0.35, s * 0.25, s * 0.08);
      M.box(0, 0, 0, 0.1, 0.13, 0.034, 0.95);
      M.box(0, 0, 0.0185, 0.07, 0.095, 0.004, 0.8); // 書封飾板
      M.pop();
      break;
    }
    case 'key':
      M.rod([x, y - 0.12, z + 0.01], [x, y + 0.12, z + 0.01], 0.008, 0.008, 6, 0.95);
      M.push(transM(x, y - 0.15, z + 0.01)).push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      M.lathe([[0.02, -0.006], [0.032, -0.006], [0.032, 0.006], [0.02, 0.006], [0.02, -0.006]], 10, 0.95);
      M.pop().pop();
      M.box(x + s * 0.02, y + 0.1, z + 0.01, 0.035, 0.04, 0.01, 0.9);
      break;
    case 'scepter':
      M.rod([x, y - 0.06, z], [x + s * 0.04, y + 0.36, z - 0.03], 0.009, 0.007, 6, 0.95);
      M.push(transM(x + s * 0.04, y + 0.36, z - 0.03));
      M.ellipsoid(0, 0.012, 0, 0.018, 0.016, 0.018, 7, 5, 0.95);
      for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.6; M.ellipsoid(Math.sin(a) * 0.025, 0.04 + Math.cos(a) * 0.012, 0, 0.01, 0.022, 0.008, 6, 4, 0.95); }
      M.pop();
      break;
    case 'scroll':
      M.rod([x - 0.05, y + 0.01, z + 0.01], [x + 0.05, y + 0.01, z + 0.01], 0.015, 0.015, 8, 0.95);
      M.pushTRS(x, y - 0.14, z + 0.02, -0.1, 0, s * 0.1);
      M.box(0, 0, 0, 0.085, 0.28, 0.006, 0.9);
      M.pop();
      break;
    case 'sword':
      M.rod([x, y - 0.02, z], [x - s * 0.02, y - 0.45, z + 0.06], 0.012, 0.004, 4, 0.95);
      M.box(x, y + 0.01, z, 0.08, 0.012, 0.015, 0.95);
      M.rod([x, y + 0.01, z], [x, y + 0.06, z], 0.008, 0.008, 5, 0.95);
      break;
    case 'crossStaff':
      M.rod([x, 0.02, z + 0.02], [x, 1.08 - (S.pose === 'seat' ? SEAT_DROP : 0), z + 0.02], 0.009, 0.009, 6, 0.95);
      M.box(x, 0.98 - (S.pose === 'seat' ? SEAT_DROP : 0), z + 0.02, 0.12, 0.016, 0.016, 0.95);
      break;
    case 'cross':
      M.box(x, y + 0.08, z + 0.02, 0.025, 0.45, 0.025, 0.95);
      M.box(x, y + 0.2, z + 0.02, 0.22, 0.025, 0.025, 0.95);
      break;
    case 'lance':
      M.rod([x, y - 0.5, z + 0.02], [x, y + 0.45, z + 0.02], 0.008, 0.008, 5, 0.95);
      M.push(transM(x, y + 0.45, z + 0.02));
      M.lathe([[0, 0], [0.018, 0.02], [0, 0.09]], 5, 0.95);
      M.pop();
      break;
    case 'brokenLance':
      M.rod([x, y - 0.35, z + 0.02], [x - s * 0.02, y + 0.25, z + 0.01], 0.008, 0.008, 5, 0.95);
      M.rod([x - s * 0.02, y + 0.25, z + 0.01], [x + s * 0.05, y + 0.32, z + 0.04], 0.008, 0.006, 5, 0.9);
      break;
    case 'tablets':
      M.pushTRS(x, y - 0.06, z + 0.03, 0.3, 0, s * 0.5);
      M.box(-0.025, 0, 0, 0.045, 0.09, 0.015, 0.9); M.box(0.025, 0, 0, 0.045, 0.09, 0.015, 0.9);
      M.pop();
      break;
    case 'chalice':
      M.push(transM(x, y + 0.01, z + 0.01));
      M.lathe([[0, 0], [0.025, 0], [0.006, 0.015], [0.006, 0.04], [0.03, 0.065], [0.032, 0.09], [0, 0.085]], 8, 0.95);
      M.pop();
      break;
    case 'crozier': {
      const top = 1.02 - (S.pose === 'seat' ? SEAT_DROP : 0);
      M.rod([x, 0.02, z + 0.01], [x, top, z + 0.01], 0.009, 0.009, 6, 0.95);
      M.tube([[x, top, z + 0.01], [x, top + 0.05, z + 0.01], [x - s * 0.04, top + 0.08, z + 0.01], [x - s * 0.06, top + 0.04, z + 0.01], [x - s * 0.035, top + 0.025, z + 0.01]], [0.009, 0.008, 0.007, 0.006, 0.008], 6, 10, 0.95);
      break;
    }
    case 'candle':
      M.push(transM(x, y, z + 0.01));
      M.lathe([[0, -0.02], [0.03, -0.02], [0.012, 0.0], [0.012, 0.12], [0.03, 0.14], [0.012, 0.15], [0.01, 0.22], [0, 0.23]], 8, 0.95);
      M.pop();
      break;
    case 'censer':
      M.rod([x, y, z + 0.01], [x, y - 0.18, z + 0.03], 0.003, 0.003, 3, 0.9);
      M.ellipsoid(x, y - 0.22, z + 0.03, 0.035, 0.04, 0.035, 8, 6, 0.9);
      break;
    case 'vial':
      M.push(transM(x, y, z + 0.01));
      M.lathe([[0, 0], [0.018, 0], [0.03, 0.03], [0.012, 0.06], [0.015, 0.08], [0, 0.08]], 8, 0.95);
      M.pop();
      break;
    case 'trumpet':
      M.rod([x, y, z], [x + s * 0.1, y + 0.08, z + 0.3], 0.008, 0.035, 8, 0.95);
      break;
    case 'apple':
      M.ellipsoid(x, y + 0.02, z + 0.01, 0.025, 0.025, 0.025, 8, 6, 0.95);
      break;
    case 'palm':
      M.rod([x, y - 0.05, z + 0.01], [x - s * 0.03, y + 0.3, z + 0.02], 0.006, 0.004, 4, 0.95);
      M.ellipsoid(x - s * 0.035, y + 0.3, z + 0.02, 0.03, 0.08, 0.01, 6, 5, 0.9);
      break;
    case 'square':
      M.box(x, y + 0.05, z + 0.02, 0.015, 0.14, 0.012, 0.9);
      M.box(x + s * 0.05, y - 0.01, z + 0.02, 0.1, 0.015, 0.012, 0.9);
      break;
    case 'scales': {
      // 天平：橫桿 + 兩盤（垂在手下方）
      const by = y + 0.08;
      M.rod([x, y, z + 0.02], [x, by, z + 0.02], 0.006, 0.006, 4, 0.95);
      M.rod([x - 0.16, by, z + 0.02], [x + 0.16, by, z + 0.02], 0.007, 0.007, 4, 0.95);
      for (const k of [-1, 1]) {
        const py = by - 0.18 + k * 0.03;
        M.rod([x + k * 0.16, by, z + 0.02], [x + k * 0.16, py, z + 0.02], 0.003, 0.003, 3, 0.9);
        M.push(transM(x + k * 0.16, py, z + 0.02));
        M.lathe([[0, -0.02], [0.05, 0], [0.052, 0.006], [0, 0.0]], 8, 0.9);
        M.pop();
      }
      break;
    }
    case 'head': { // 聖德尼手捧自己的頭
      const ox = (hands.R.pos[0] + hands.L.pos[0]) / 2;
      M.push(transM(ox, y + 0.06, z + 0.02));
      head(M, { beard: 0, hair: 'short', mitre: true, female: false }, R);
      M.pop();
      break;
    }
    default: break;
  }
}

function child(M, hand, S) {
  const drop = S.pose === 'seat' ? SEAT_DROP : 0;
  M.push(new THREE.Matrix4().compose(new THREE.Vector3(0.085, 0.6 - drop, 0.08), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.5, 0)), new THREE.Vector3(0.36, 0.36, 0.36)));
  const cs = { kind: 'child', pose: 'seat', foldN: 14, foldDepth: 0.012, foldPhase: 0.3, sway: 0.1, mantle: null, contra: 0,
    head: { beard: 0, hair: 'curly', halo: 'cross', turn: -0.3, tilt: 0 }, arms: { R: 'raised', L: 'lap' }, hold: { L: 'book' }, lod: Math.max(0, S.lod - 1), feet: true, dirt: 1 };
  figure(M, cs);
  M.pop();
}

function wings(M, S, shY, R) {
  const bat = S.wings === 'bat';
  // 翅膀外形（x 往外、y 往上），羽毛鋸齒狀下緣
  const pts = [];
  if (bat) {
    pts.push([0, 0], [0.06, 0.1], [0.16, 0.16], [0.26, 0.1], [0.22, 0.02], [0.18, -0.06], [0.12, 0.0], [0.08, -0.08], [0.03, -0.02]);
  } else {
    const top = [[0, 0.02], [0.04, 0.14], [0.09, 0.26], [0.13, 0.33], [0.16, 0.3]];
    pts.push(...top);
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const bx = lerp(0.16, 0.035, t), by = lerp(0.3, -0.42, t);
      pts.push([bx + 0.025 * Math.sin(t * Math.PI), by]);
      if (k < n) pts.push([lerp(bx, lerp(0.16, 0.035, (k + 1) / n), 0.5) - 0.02, lerp(by, lerp(0.3, -0.42, (k + 1) / n), 0.5) + 0.015]);
    }
    pts.push([0.0, -0.25]);
  }
  for (const s of [-1, 1]) {
    // 讓翅膀外緣（局部 +x）朝 (±0.45, 0, -0.9)
    const ang = Math.atan2(-0.55, s * 0.85); // 方向角
    const X = [Math.cos(ang), 0, Math.sin(ang)];
    const Z = [-X[2] * s, 0, X[0] * s];
    const mm = new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...Z));
    mm.setPosition(s * 0.06, shY - 0.02, -0.07);
    M.push(mm);
    if (!bat) M.push(scaleM(1.25));
    M.extrude(pts, bat ? 0.012 : 0.022, 0.9, 0.75);
    if (!bat) { for (let k = 0; k < 3; k++) M.box(0.06 + k * 0.025, -0.05 - k * 0.07, 0.012, 0.005, 0.3 - k * 0.06, 0.006, 0.7); M.pop(); }
    M.pop();
  }
}
