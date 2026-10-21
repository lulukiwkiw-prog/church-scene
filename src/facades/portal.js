// src/facades/portal.js — 門：斜面層層後退的柱子與拱圈、門側像基座與華蓋、門楣框、
// 門中柱、外圈捲葉飾、三角楣、木門與鍛鐵捲花。
// 全部在「門的局部座標」裡做：X = 深度（0 = 立面牆面，往內為正），Y = 上，Z = 橫向（0 = 門中線）。
import * as THREE from 'three';
import { archivoltRing, tympanumRegisters, pointedArch } from '../../layout.js';
import {
  PI, T, S, Ry, mul, frame, plateM, sweep, arcPts, archBand, archPts, archHalfWidth,
  foilPts, circlePts, plate, box, cyl, colonnette, tube, crocket, finial, prep, mergeGeometries, shapeOf, extrude,
} from './kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** 由兩軸建立矩陣（第三軸 = x × y），放在 pos */
function basisM(xv, yv, pos) {
  const x = V3(...xv).normalize(), y = V3(...yv).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(...pos);
  return m;
}

/** 平面多邊形 (r = 橫向, x = 深度) 垂直擠出 y0 → y1（門局部座標） */
function prismPlan(poly, y0, y1) {
  const clean = poly.filter((p, i, a) => { const q = a[(i + a.length - 1) % a.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  const g = extrude(shapeOf(clean), y1 - y0);
  const m = new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(1, 0, 0), V3(0, 1, 0));
  m.setPosition(0, y0, 0);
  return g.applyMatrix4(m);
}

/** 直線線腳：沿 Z 從 z0 到 z1，剖面 (a = 深度, b = 高)，基準 (x0, y0) */
function straightBand(strips, x0, y0, z0, z1) {
  return sweep(strips, 2, (i, a, b) => [x0 + a, y0 + b, i ? z1 : z0]);
}

// -----------------------------------------------------------------------------
// 剖面
// -----------------------------------------------------------------------------
/** 拱圈剖面：內側立面 → 內圈滾邊 → 放像的凹槽帶 → 外圈滾邊 → 前平面 */
function ringProfile(w, h) {
  const r1 = Math.min(0.065, w * 0.12), r2 = Math.min(0.055, w * 0.1);
  const g = Math.min(0.12, h / 2 - 0.05);
  const c1 = [-w / 2 + r1, -h / 2 + r1], c2 = [w / 2 - r2, -h / 2 + r2];
  const a = -w / 2 + 2 * r1, b = w / 2 - 2 * r2;
  return [
    [[-w / 2, h / 2], [-w / 2, -h / 2 + r1]],
    arcPts(c1[0], c1[1], r1, PI, 2 * PI, 8),
    [[a, -h / 2 + r1], [a + 0.02, -h / 2 + r1 + 0.03], [a + 0.035, g * 0.6]],
    [[a + 0.035, g * 0.6], [a + 0.06, g], [(a + b) / 2, g + 0.015], [b - 0.06, g], [b - 0.035, g * 0.6]],
    [[b - 0.035, g * 0.6], [b - 0.02, -h / 2 + r2 + 0.03], [b, -h / 2 + r2]],
    arcPts(c2[0], c2[1], r2, PI, 1.5 * PI, 6),
    [[w / 2 - r2, -h / 2], [w / 2, -h / 2]],
  ];
}

/** 外圈捲葉飾帶的剖面（相對最外圈拱圈的外緣） */
function hoodProfile(proj) {
  return [
    [[0, 0], [0, -proj]],
    [[0, -proj], [0.08, -proj - 0.02], [0.2, -proj - 0.03], [0.26, -proj]],
    arcPts(0.29, -proj + 0.03, 0.04, PI * 1.25, PI * 2.2, 5),
    [[0.33, -proj + 0.06], [0.34, 0.02]],
  ];
}

// -----------------------------------------------------------------------------
// 華蓋（門側像頭上、門中柱像、扶壁壁龕像共用）：正面朝 -X
// -----------------------------------------------------------------------------
const canopyCache = new Map();
export function canopyGeo(R = 0.36, H = 0.6) {
  const key = `${R}|${H}`;
  if (canopyCache.has(key)) return canopyCache.get(key);
  const parts = [];
  // 下緣：六角形的小尖拱垂飾（每面一個三角小山花）
  const drum = new THREE.CylinderGeometry(R * 0.92, R * 0.92, H * 0.45, 6, 1, false);
  drum.translate(0, H * 0.225, 0);
  parts.push(drum);
  const soffit = new THREE.CylinderGeometry(R, R * 0.92, H * 0.08, 6); soffit.translate(0, H * 0.04, 0); parts.push(soffit);
  const cornice = new THREE.CylinderGeometry(R * 1.08, R, H * 0.08, 6); cornice.translate(0, H * 0.49, 0); parts.push(cornice);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 2 * PI + PI / 6;
    const side = 2 * R * Math.sin(PI / 6) * 0.95;
    const tri = extrude(shapeOf([[-side / 2, 0], [side / 2, 0], [0, H * 0.42]]), 0.04);
    tri.translate(0, H * 0.06, 0);
    const ap = R * Math.cos(PI / 6);
    tri.applyMatrix4(mul(Ry(-a + PI / 2), T(0, 0, ap - 0.01)));
    parts.push(tri);
    // 小尖塔
    const pin = new THREE.ConeGeometry(R * 0.09, H * 0.5, 4); pin.translate(0, H * 0.78, 0);
    pin.applyMatrix4(mul(Ry(-a), T(R * 0.95, 0, 0)));
    parts.push(pin);
  }
  const roof = new THREE.ConeGeometry(R * 0.8, H * 0.55, 6); roof.translate(0, H * 0.8, 0); parts.push(roof);
  const g = mergeGeometries(parts.map((p) => prep(p)), false);
  // 底面三葉形拱腹不做；整體朝 -X 為正面，無方向性
  canopyCache.set(key, g);
  return g;
}

// -----------------------------------------------------------------------------
// 鍛鐵捲花（門扇局部：u = 橫向 0..W（0 = 鉸鏈側），v = 上 0..H，正面在 w = 0 往 -w 凸出）
// 回傳幾何（u→Z、v→Y、w→X），由呼叫者放到門扇上
// -----------------------------------------------------------------------------
function ironScrolls(W, H, r) {
  const geos = [];
  const straps = 4;
  const rad = 0.011;
  for (let s = 0; s < straps; s++) {
    const vs = H * (0.12 + s * (0.76 / (straps - 1)));
    const half = (H * 0.76) / (straps - 1) / 2; // 每條鉸鏈帶可用的上下空間
    geos.push(prep(box(0.03, 0.06, W - 0.08, -0.03, vs - 0.03, 0.04)));
    // 鉸鏈端的大捲
    const step = 0.3;
    for (let u0 = 0.12; u0 < W - 0.2; u0 += step) {
      for (const dir of [1, -1]) {
        const sizeK = r.range(0.85, 1.12);
        const rr0 = Math.min(half * 0.62, 0.17) * sizeK;
        const cx = u0 + 0.12 * sizeK, cy = vs + dir * rr0 * 1.05;
        const a0 = Math.atan2(vs - cy, u0 - cx);
        const turns = r.range(1.6, 2.2);
        const pts = [];
        const N = 30;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const a = a0 - dir * t * turns * 2 * PI;
          const rr = rr0 * (1 - 0.82 * t);
          pts.push([-0.012, cy + rr * Math.sin(a), cx + rr * Math.cos(a)]);
        }
        geos.push(prep(tube(pts, rad, 4, 36)));
        // 次級小捲：從主捲外緣反向捲出
        const k = Math.floor(N * 0.25);
        const [, py, pz] = pts[k];
        const c2y = py + dir * rr0 * 0.4, c2z = pz + rr0 * 0.35;
        const b0 = Math.atan2(py - c2y, pz - c2z);
        const pts2 = [];
        for (let i = 0; i <= 18; i++) {
          const t = i / 18;
          const a = b0 + dir * t * 1.6 * 2 * PI;
          const rr = rr0 * 0.42 * (1 - 0.8 * t);
          pts2.push([-0.012, c2y + rr * Math.sin(a), c2z + rr * Math.cos(a)]);
        }
        geos.push(prep(tube(pts2, rad * 0.8, 4, 20)));
      }
    }
  }
  return mergeGeometries(geos, false);
}

// -----------------------------------------------------------------------------
// 主函式
// -----------------------------------------------------------------------------
/**
 * @param batch Batch
 * @param P     門（layout 的 portal 物件；袖廊門也可）
 * @param M     門局部座標 → 世界 的矩陣
 * @param opt   { statues: 門側像陣列（世界座標，西門才有）, sideZ: 門中線世界 z（西門）, r: rng }
 */
export function buildPortal(batch, P, M, opt) {
  const r = opt.r;
  const n = P.archivolts;
  const splay = P.splayDepth;
  const open2 = P.openingWidth / 2, outer2 = P.outerWidth / 2;
  const h = splay / n;
  const rings = Array.from({ length: n }, (_, k) => archivoltRing(P, k));
  const w = rings[0].width;
  const hasStatues = !!(opt.statues && opt.statues.length);
  const statueTop = hasStatues ? opt.statues[0].y + opt.statues[0].height : 0;
  const capY = hasStatues ? statueTop + 0.75 : Math.min(...rings.map((q) => q.springing)) - 0.05;
  const socleH = hasStatues ? (P.socle ? P.socle.height : 1.9) : 1.2;
  const add = (key, g, m = null, uv = 'box') => batch.add(key, g, mul(M, m), uv);

  // ---------------- 拱圈 ----------------
  for (const q of rings) {
    add('carved', archBand(ringProfile(w, h), { span: q.span, spring: q.springing, x0: q.x, yStart: capY, n: 44 }), null, 'keep');
  }

  // ---------------- 外圈捲葉飾帶 + 捲葉 ----------------
  const qo = rings[n - 1];
  const hoodOff = w / 2; // 相對最外圈中心線
  const proj = 0.16;
  const hoodStrips = hoodProfile(proj).map((s) => s.map(([a, b]) => [a + hoodOff, b - h / 2]));
  const hoodLen = (qo.span + hoodOff) * (PI - Math.acos(-(qo.span / 2) / (qo.span + hoodOff)));
  const cycles = Math.round(hoodLen / 0.3);
  const leafy = (t, rr, d) => {
    // 前面那條葉帶做成連續起伏
    if (d < -h / 2 - proj + 0.005 && rr > hoodOff + 0.02 && rr < hoodOff + 0.3) {
      const s = t * cycles;
      return [0.025 * Math.sin(s * 2 * PI), -0.03 * Math.abs(Math.sin(s * PI))];
    }
    return [0, 0];
  };
  add('carved', archBand(hoodStrips, { span: qo.span, spring: qo.springing, x0: qo.x, yStart: capY, n: cycles * 4, mod: leafy }), null, 'keep');
  // 外緣捲葉
  {
    const R = qo.span, cz = R - qo.span / 2;
    const rho = R + hoodOff + 0.34;
    const te = Math.acos(-cz / rho);
    const ts = capY > qo.springing ? PI - Math.asin(Math.min(1, (capY - qo.springing) / rho)) : PI;
    const arcLen = rho * (ts - te);
    const cnt = Math.max(3, Math.round(arcLen / 0.42));
    const ms = [];
    for (let i = 0; i < cnt; i++) {
      const th = ts + (te - ts) * ((i + 0.5) / cnt);
      const pos = [qo.x - h / 2 - proj * 0.5, qo.springing + rho * Math.sin(th), cz + rho * Math.cos(th)];
      const tan = [0, -Math.cos(th), Math.sin(th)];
      const rad = [0, Math.sin(th), Math.cos(th)];
      const m = mul(basisM(tan, rad, pos), S(1.5));
      ms.push(m, mul(S(1, 1, -1), m));
    }
    batch.addMany('carved', crocket(), ms.map((m) => mul(M, m)));
    // 拱頂頂飾
    const apexY = qo.springing + Math.sqrt(rho * rho - cz * cz);
    if (!P.gable) add('carved', finial(1.4), T(qo.x - h / 2 - 0.1, apexY - 0.05, 0));
  }

  // ---------------- 三角楣 ----------------
  if (P.gable) {
    const G = P.gable;
    const base = capY, apex = G.apex;
    const rake = (z) => apex - (apex - base) * Math.abs(z) / W2;
    const off = hoodOff + 0.33;
    const inner = archPts(qo.span, qo.springing, { n: 40, off, R: qo.span }).filter(([, y]) => y >= base);
    const R0 = qo.span + off, cz = qo.span / 2;
    const zAt = Math.sqrt(R0 * R0 - (base - qo.springing) ** 2) - cz;
    const W2 = Math.max(G.width / 2, zAt + 0.3);
    const innerPts = [[zAt, base], ...inner.filter(([z]) => Math.abs(z) < zAt).reverse(), [-zAt, base]]
      .map(([z, y]) => [z, Math.min(y, rake(z) - 0.42)]);
    const outline = [[-W2, base], [0, apex], [W2, base], ...innerPts];
    add('carved', plate(outline, [], 0.3, -0.28));
    // 斜邊壓頂線腳
    const cop = [[[0, 0], [0, -0.14]], [[0, -0.14], [0.06, -0.2], [0.16, -0.2]], arcPts(0.2, -0.14, 0.06, 1.2 * PI, 2.3 * PI, 5), [[0.24, -0.08], [0.24, 0.04]]];
    for (const sgn of [-1, 1]) {
      const p0 = [sgn * (W2 + 0.05), base], p1 = [0, apex];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const tz = (p1[0] - p0[0]) / L, ty = (p1[1] - p0[1]) / L;
      const nz = sgn * Math.abs(ty), ny = Math.abs(tz); // 往外上方
      add('carved', sweep(cop, 2, (i, a, b) => {
        const t = i ? 1.02 : 0;
        return [-0.28 + b, p0[1] + (p1[1] - p0[1]) * t + ny * (a - 0.12), p0[0] + (p1[0] - p0[0]) * t + nz * (a - 0.12)];
      }), null, 'keep');
      const cnt = Math.floor(L / 0.55);
      const ms = [];
      for (let i = 1; i < cnt; i++) {
        const t = i / cnt;
        const pos = [-0.4, p0[1] + (p1[1] - p0[1]) * t + ny * 0.1, p0[0] + (p1[0] - p0[0]) * t + nz * 0.1];
        ms.push(mul(M, mul(basisM([0, ty, tz], [0, ny, nz], pos), S(1.8))));
      }
      batch.addMany('carved', crocket(), ms);
    }
    add('carved', finial(2.0), T(-0.4, apex + 0.05, 0));
    // 三角楣中的三葉盲飾圓章
    const ty0 = (qo.springing + Math.sqrt((qo.span + off) ** 2 - cz * cz) + apex) / 2 + 0.1;
    const rr = Math.min(0.55, (apex - ty0) * 0.45);
    if (rr > 0.25) {
      add('carved', plate(foilPts(3, rr, 0.35, { rot: PI / 2, cy: ty0 }), [foilPts(3, rr - 0.08, 0.35, { rot: PI / 2, cy: ty0 })], 0.08, -0.36));
    }
  }

  // ---------------- 兩側斜面（只做 +Z 側再鏡射） ----------------
  const A = [outer2, 0], B = [open2, splay];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const nr = splay / len, nx = (outer2 - open2) / len; // 往實牆的法線 (r, x)
  const Lpt = (t, d) => [A[0] + t * (B[0] - A[0]) + d * nr, t * splay + d * nx];
  const tAtX = (x, d) => (x - d * nx) / splay;
  const tAtR = (rr, d) => (rr - A[0] - d * nr) / (B[0] - A[0]);
  const Rfar = outer2 + 0.6;
  const back = splay + 0.5;
  const sideParts = []; // [key, geo]
  const sideAdd = (key, g) => sideParts.push([key, g]);

  // 階梯（各圈拱圈在起拱以下的平面輪廓）
  const stair = [];
  for (const q of rings) {
    const rk = q.span / 2;
    stair.push([rk - w / 2, q.x + h / 2], [rk - w / 2, q.x - h / 2]);
  }
  stair.push([outer2, 0]);

  if (hasStatues) {
    // 基座：前緣線往門洞方向推 0.42，兩排四葉形圓章
    const ds = -0.42;
    const x0 = -0.45;
    const P0 = Lpt(tAtX(x0, ds), ds);
    let t1 = tAtR(open2, ds), P1 = Lpt(t1, ds);
    if (P1[1] > back) { t1 = tAtX(back, ds); P1 = Lpt(t1, ds); }
    const soclePoly = [P0, P1, [open2, P1[1]], [open2, back], [Rfar, back], [Rfar, x0]].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4);
    sideAdd('carved', prismPlan(soclePoly, 0, socleH - 0.16));
    // 基座底部踢腳與頂部壓頂（各自外推）
    const grow = (d, xx0) => {
      const Q0 = Lpt(tAtX(xx0, d), d);
      let tt = tAtR(open2, d), Q1 = Lpt(tt, d);
      if (Q1[1] > back) Q1 = Lpt(tAtX(back, d), d);
      return [Q0, Q1, [open2, Q1[1]], [open2, back], [Rfar + 0.1, back], [Rfar + 0.1, xx0]];
    };
    sideAdd('carved', prismPlan(grow(ds - 0.08, x0 - 0.08), 0, 0.28));
    sideAdd('carved', prismPlan(grow(ds - 0.1, x0 - 0.1), socleH - 0.16, socleH - 0.05));
    sideAdd('carved', prismPlan(grow(ds - 0.05, x0 - 0.05), socleH - 0.05, socleH));
    // 圓章：沿基座正面
    const faceLen = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
    const per = Math.max(2, Math.round(faceLen / 0.78));
    const rows = P.socle ? P.socle.medallionRows : 2;
    const R = 0.27;
    const medal = mergeGeometries([
      prep(plate(foilPts(4, R, 0.32, { rot: PI / 4 }), [foilPts(4, R - 0.055, 0.34, { rot: PI / 4 })], 0.07, -0.07)),
      prep(plate(circlePts(R * 0.62, 16), [], 0.035, -0.035)),
      prep(plate([[-0.36, -0.34], [0.36, -0.34], [0.36, 0.34], [-0.36, 0.34]], [foilPts(4, R + 0.02, 0.32, { rot: PI / 4, seg: 48 })], 0.025, -0.025)),
    ], false);
    const ux = (P1[0] - P0[0]) / faceLen, ud = (P1[1] - P0[1]) / faceLen;
    for (let row = 0; row < rows; row++) {
      const y = 0.32 + (socleH - 0.16 - 0.32) * ((row + 0.5) / rows);
      for (let i = 0; i < per; i++) {
        const s = (i + 0.5) / per * faceLen;
        const pr = P0[0] + ux * s, px = P0[1] + ud * s;
        sideParts.push(['carved', medal.clone().applyMatrix4(frame(px, y, pr, nx, nr))]);
      }
      // 兩排之間的細線腳
      if (row < rows - 1) {
        const yb = 0.32 + (socleH - 0.48) * ((row + 1) / rows);
        const band = box(0.06, 0.07, faceLen, -0.06, yb - 0.035, -faceLen);
        sideParts.push(['carved', band.applyMatrix4(frame(P0[1], 0, P0[0], nx, nr))]);
      }
    }

    // 像的背板：斜線往實牆推 0.32
    const db = 0.32;
    const Q0 = Lpt(tAtR(Rfar, db), db);
    let Q1 = Lpt(tAtR(open2, db), db);
    if (Q1[1] > back) Q1 = Lpt(tAtX(back, db), db);
    const backPoly = [Q0, Q1, [open2, Q1[1]], [open2, back], [Rfar, back]];
    sideAdd('carved', prismPlan(backPoly, socleH, capY - 0.29));
    // 像與像之間的細柱
    const nS = opt.statues.length / 2;
    const col = colonnette(0.075, capY - 0.29 - socleH);
    for (let j = 0; j <= nS; j++) {
      const [cr, cx] = Lpt(j / nS, 0.24);
      sideParts.push(['carved', col.clone().applyMatrix4(T(cx, socleH, cr))]);
    }
    // 華蓋：每尊門側像頭上
    const can = canopyGeo(0.34, 0.62);
    const th = Math.atan2(-nr, nx);
    for (const st of opt.statues) {
      const rr = st.z - opt.sideZ;
      if (rr <= 0) continue;
      sideParts.push(['carved', can.clone().applyMatrix4(mul(T(st.x, statueTop + 0.02, rr), Ry(th)))]);
    }
  } else {
    // 袖廊門：素面基座 + 階梯牆墩 + 每個凹角一根細柱
    const x0 = -0.3;
    const st = stair.map(([a, b]) => [a, b]);
    const socle = [[open2 - 0.12, back], ...st.map(([a, b]) => [a - 0.12, b - 0.12]), [outer2 - 0.12, x0], [Rfar, x0], [Rfar, back]];
    sideAdd('carved', prismPlan(socle, 0, socleH));
    const pier = [[open2, back], ...st, [Rfar, 0], [Rfar, back]];
    sideAdd('carved', prismPlan(pier, socleH, capY - 0.29));
    const col = colonnette(0.1, capY - 0.29 - socleH);
    for (const q of rings) {
      const rr = q.span / 2 + w / 2, xx = q.x - h / 2;
      sideParts.push(['carved', col.clone().applyMatrix4(T(xx - 0.1, socleH, rr - 0.1))]);
    }
  }

  // 柱頭帶（兩層：葉形鐘 + 頂板），順著階梯
  {
    const mk = (sh) => [[open2 - sh, back], ...stair.map(([a, b]) => [a - sh, b - sh]), [Rfar, -sh], [Rfar, back]];
    sideAdd('carved', prismPlan(mk(0.05), capY - 0.3, capY - 0.12));
    sideAdd('carved', prismPlan(mk(0.12), capY - 0.12, capY));
    // 每個凸角下的葉飾
    const leaves = [];
    for (const q of rings) {
      const rr = q.span / 2 - w / 2, xx = q.x - h / 2;
      leaves.push(basisM([0, -1, 0], [-nx, 0, -nr], [xx - 0.04, capY - 0.14, rr - 0.04]));
    }
    for (const m of leaves) sideParts.push(['carved', crocket().clone().applyMatrix4(mul(m, S(1.6)))]);
  }

  // 立面牆上的門框（外拱腳下兩側的小扶壁石）不做，交給結構牆
  // +Z 側 → 加入兩側
  const sideGeo = new Map();
  for (const [key, g] of sideParts) {
    if (!sideGeo.has(key)) sideGeo.set(key, []);
    sideGeo.get(key).push(prep(g));
  }
  for (const [key, list] of sideGeo) {
    const merged = mergeGeometries(list, false);
    batch.add(key, merged, M);
    batch.add(key, merged, mul(M, S(1, 1, -1)));
  }

  // ---------------- 門楣：背板、橫帶石、門楣框 ----------------
  const tym = tympanumRegisters(P);
  const oa = pointedArch(P.openingWidth, P.openingApex);
  const tx = tym.x;
  add('carved', plate(archPts(P.openingWidth + 0.1, oa.springing, { n: 36, yBottom: P.doorHeight - 0.2, R: P.openingWidth + 0.1 }), [], 0.4, tx + 0.1));
  const bandProf = (dep, hh) => [
    [[0.12, -hh / 2], [-dep + 0.03, -hh / 2]],
    arcPts(-dep + 0.03, -hh / 2 + 0.03, 0.03, 1.5 * PI, PI, 3),
    [[-dep, -hh / 2 + 0.03], [-dep, hh / 2 - 0.05]],
    [[-dep, hh / 2 - 0.05], [-dep + 0.05, hh / 2], [0.12, hh / 2]],
  ];
  const regs = tym.registers;
  // 門楣下緣（門頂的楣石）
  {
    const y = P.doorHeight;
    const hw = open2;
    add('carved', straightBand(bandProf(0.3, 0.2), tx, y - 0.1, -hw, hw), null, 'keep');
  }
  for (const reg of regs) {
    if (reg.shape !== 'band') continue;
    const y = reg.y1;
    const hw = Math.min(open2, archHalfWidth(P.openingWidth, oa.springing, y)) - 0.01;
    if (hw > 0.2) add('carved', straightBand(bandProf(0.22, 0.13), tx, y, -hw, hw), null, 'keep');
  }

  // ---------------- 門中柱 ----------------
  const tsx = P.trumeauStatue && P.trumeauStatue.x !== undefined ? P.trumeauStatue.x : splay - 0.5;
  const tsy = P.trumeauStatue && P.trumeauStatue.y !== undefined ? P.trumeauStatue.y : 1.4;
  const tsh = P.trumeauStatue ? P.trumeauStatue.height : 0;
  const trW = 0.72;
  if (P.trumeauStatue) {
    add('carved', box(back - (tsx + 0.12), P.doorHeight, trW, tsx + 0.12, 0, -trW / 2));
    add('carved', box(0.75, tsy - 0.12, 0.8, tsx - 0.38, 0, -0.4));
    add('carved', box(0.85, 0.12, 0.9, tsx - 0.43, tsy - 0.12, -0.45));
    add('carved', box(0.85, 0.2, 0.9, tsx - 0.43, 0, -0.45));
    // 中柱兩側細柱
    const c = colonnette(0.07, P.doorHeight - 0.2);
    for (const s of [-1, 1]) add('carved', c, T(tsx + 0.25, 0.2, s * (trW / 2 + 0.02)));
    // 中柱基座正面的小四葉圓章
    const med = plate(foilPts(4, 0.22, 0.3, { rot: PI / 4, cy: tsy * 0.5 }), [foilPts(4, 0.17, 0.3, { rot: PI / 4, cy: tsy * 0.5 })], 0.05, -0.05);
    add('carved', med, T(tsx - 0.38, 0, 0));
    if (tsy + tsh + 0.6 < tym.registers[0].y0 + 0.4) add('carved', canopyGeo(0.36, 0.55), T(tsx, tsy + tsh + 0.02, 0));
    else add('carved', canopyGeo(0.36, Math.max(0.25, P.doorHeight - (tsy + tsh) - 0.05)), T(tsx, tsy + tsh + 0.02, 0));
  }

  // ---------------- 木門與鍛鐵 ----------------
  const doors = P.doors || { leaves: 2, ironwork: 'plain' };
  const leafH = P.doorHeight - 0.2;
  const dx = tx + 0.3;
  const gap = P.trumeauStatue ? trW / 2 : 0.01;
  const leafW = (P.openingWidth - 2 * gap) / doors.leaves * (doors.leaves === 2 ? 1 : 1);
  for (let l = 0; l < doors.leaves; l++) {
    const z0 = doors.leaves === 2 ? (l === 0 ? -open2 : gap) : -open2 + l * leafW;
    add('wood', box(0.1, leafH, leafW, dx, 0, z0));
    // 外框與橫檔
    for (const [yy, hh] of [[0, 0.18], [leafH - 0.18, 0.18], [leafH * 0.5 - 0.08, 0.16]]) add('wood', box(0.04, hh, leafW, dx - 0.04, yy, z0));
    add('wood', box(0.04, leafH, 0.14, dx - 0.04, 0, z0));
    add('wood', box(0.04, leafH, 0.14, dx - 0.04, 0, z0 + leafW - 0.14));
    if (doors.ironwork === 'scrolls') {
      const hinge = l === 0 ? 0 : 1; // 鉸鏈在外側
      const iron = ironScrolls(leafW, leafH, r.fork(`${P.id || 'portal'}/leaf${l}`));
      const m = hinge === 0 ? T(dx - 0.04, 0, z0) : mul(T(dx - 0.04, 0, z0 + leafW), S(1, 1, -1));
      add('iron', iron, m);
    } else {
      // 素面門：幾排鐵釘
      const studs = [];
      for (let yy = 0.5; yy < leafH - 0.3; yy += 0.45) for (let zz = 0.3; zz < leafW - 0.2; zz += 0.4) studs.push(T(dx - 0.045, yy, z0 + zz));
      batch.addMany('iron', new THREE.SphereGeometry(0.025, 5, 3), studs.map((m) => mul(M, m)));
    }
  }
  // 門洞內側（門扇背後）收邊
  add('carved', box(0.3, P.doorHeight, 0.25, tx + 0.1, 0, -open2 - 0.12));
  add('carved', box(0.3, P.doorHeight, 0.25, tx + 0.1, 0, open2 - 0.13));
  return { capY };
}
