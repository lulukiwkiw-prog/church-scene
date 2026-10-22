// src/environment/buildings.js — 奧斯曼式周邊建築：石牆、規律凹窗、陽台、簷口、馬薩式鋅皮屋頂、老虎窗、煙囪
import { fbox, fpoly, frame, groundRect, P, D } from './geom.js';

const UP = [0, 1, 0];
const GF = 4.6;   // 底層高（造型比例）
const BAY = 3.4;  // 開間

/** 牆面：凹窗格網。rects = [[u0,u1,v0,v1,depth]]，牆面從 vStart 到 vTop */
function wallWithOpenings(gw, gd, f, len, vStart, vTop, rects) {
  const us = [...new Set([0, len, ...rects.flatMap((r) => [r[0], r[1]])])].sort((a, b) => a - b);
  const vs = [...new Set([vStart, vTop, ...rects.flatMap((r) => [r[2], r[3]])])].filter((v) => v >= vStart && v <= vTop).sort((a, b) => a - b);
  const isHole = (u, v) => rects.some((r) => u > r[0] && u < r[1] && v > r[2] && v < r[3]);
  const out = f.az;
  for (let j = 0; j < vs.length - 1; j++) {
    const v0 = vs[j], v1 = vs[j + 1], vm = (v0 + v1) / 2;
    let run = null;
    const flush = (uEnd) => {
      if (run === null) return;
      gw.quad(P(f, run, v0, 0), P(f, uEnd, v0, 0), P(f, uEnd, v1, 0), P(f, run, v1, 0), [run, v0], [uEnd, v0], [uEnd, v1], [run, v1], out);
      run = null;
    };
    for (let i = 0; i < us.length - 1; i++) {
      const um = (us[i] + us[i + 1]) / 2;
      if (isHole(um, vm)) flush(us[i]);
      else if (run === null) run = us[i];
    }
    flush(us[us.length - 1]);
  }
  for (const [u0, u1, v0, v1, d] of rects) {
    gd.quad(P(f, u0, v0, -d), P(f, u1, v0, -d), P(f, u1, v1, -d), P(f, u0, v1, -d), [u0, v0], [u1, v0], [u1, v1], [u0, v1], out);
    // 窗框：中梃＋橫檔（淺色木框，從遠處讀得出窗格）
    if (d < 0.35) {
      const um = (u0 + u1) / 2, vt = v0 + (v1 - v0) * 0.72, c = -d + 0.05;
      const fq = (a0, a1, b0, b1) => gw.quad(P(f, a0, b0, c), P(f, a1, b0, c), P(f, a1, b1, c), P(f, a0, b1, c), [a0, b0], [a1, b0], [a1, b1], [a0, b1], out);
      fq(um - 0.035, um + 0.035, v0, v1);
      fq(u0, u1, vt - 0.035, vt + 0.035);
      fq(u0, u1, v0, v0 + 0.06);
    }
    // 窗洞側壁（reveal）
    gw.quad(P(f, u0, v0, 0), P(f, u1, v0, 0), P(f, u1, v0, -d), P(f, u0, v0, -d), [u0, 0], [u1, 0], [u1, d], [u0, d], f.ay);
    gw.quad(P(f, u0, v1, 0), P(f, u1, v1, 0), P(f, u1, v1, -d), P(f, u0, v1, -d), [u0, 0], [u1, 0], [u1, d], [u0, d], D(f, 0, -1, 0));
    gw.quad(P(f, u0, v0, 0), P(f, u0, v1, 0), P(f, u0, v1, -d), P(f, u0, v0, -d), [v0, 0], [v1, 0], [v1, d], [v0, d], f.ax);
    gw.quad(P(f, u1, v0, 0), P(f, u1, v1, 0), P(f, u1, v1, -d), P(f, u1, v0, -d), [v0, 0], [v1, 0], [v1, d], [v0, d], D(f, -1, 0, 0));
  }
}

/** 底層拱廊（主宮醫院）：前牆開半圓拱，後面是廊道 */
function arcade(gw, gd, f, len) {
  const T = 0.8, Dp = 4.5, ceil = GF - 0.3;
  const nb = Math.max(1, Math.floor(len / 3.6)), bw = len / nb;
  for (let i = 0; i < nb; i++) {
    const ub0 = i * bw, ub1 = (i + 1) * bw, oc = (ub0 + ub1) / 2, ow = bw - 0.9, rr = ow / 2;
    const o0 = oc - rr, o1 = oc + rr, spring = ceil - 0.35 - rr;
    const arc = Array.from({ length: 9 }, (_, k) => { const th = Math.PI - ((k + 1) * Math.PI) / 10; return [oc + rr * Math.cos(th), spring + rr * Math.sin(th)]; });
    const opening = [[o0, 0], [o0, spring], ...arc, [o1, spring], [o1, 0]];
    const poly = [[ub0, 0], ...opening, [ub1, 0], [ub1, GF], [ub0, GF]];
    fpoly(gw, f, poly, [], 0, 1);
    fpoly(gw, f, poly, [], -T, -1);
    let s = 0;
    for (let k = 0; k < opening.length - 1; k++) {
      const [a0, b0] = opening[k], [a1, b1] = opening[k + 1];
      const l = Math.hypot(a1 - a0, b1 - b0);
      const out = D(f, oc - (a0 + a1) / 2, spring * 0.6 - (b0 + b1) / 2, 0);
      gw.quad(P(f, a0, b0, 0), P(f, a1, b1, 0), P(f, a1, b1, -T), P(f, a0, b0, -T), [s, 0], [s + l, 0], [s + l, T], [s, T], out);
      s += l;
    }
    // 廊道後牆上的門
    gd.quad(P(f, oc - 0.8, 0, -Dp + 0.03), P(f, oc + 0.8, 0, -Dp + 0.03), P(f, oc + 0.8, 2.7, -Dp + 0.03), P(f, oc - 0.8, 2.7, -Dp + 0.03), [0, 0], [1, 0], [1, 1], [0, 1], f.az);
  }
  gw.quad(P(f, 0, 0, -Dp), P(f, len, 0, -Dp), P(f, len, ceil, -Dp), P(f, 0, ceil, -Dp), [0, 0], [len, 0], [len, ceil], [0, ceil], f.az);
  gw.quad(P(f, 0, ceil, -T), P(f, len, ceil, -T), P(f, len, ceil, -Dp), P(f, 0, ceil, -Dp), [0, 0], [len, 0], [len, Dp], [0, Dp], D(f, 0, -1, 0));
  gw.quad(P(f, 0, 0, -T), P(f, 0, ceil, -T), P(f, 0, ceil, -Dp), P(f, 0, 0, -Dp), [0, 0], [ceil, 0], [ceil, Dp], [0, Dp], f.ax);
  gw.quad(P(f, len, 0, -T), P(f, len, ceil, -T), P(f, len, ceil, -Dp), P(f, len, 0, -Dp), [0, 0], [ceil, 0], [ceil, Dp], [0, Dp], D(f, -1, 0, 0));
}

/**
 * 一棟建築。s = { x0,x1,z0,z1, eave, ridge, arcade:'s'|null, balconies, shops, tint, blank:{s,n,e,w} }
 */
function building(B, s, r) {
  const gw = B.get('buildings', 'facadeHaussmann:vc');
  const gz = B.get('buildings', 'zincRoof');
  const gd = B.get('buildings', 'windowDark');
  const gi = B.get('buildings', 'ironPainted');
  gw.setColor(...s.tint);
  const X = s.x1 - s.x0, Z = s.z1 - s.z0, E = s.eave, R = s.ridge;
  const blank = s.blank || {};
  const faces = [
    { k: 's', f: frame([s.x0, 0, s.z1], [1, 0, 0], UP, [0, 0, 1]), len: X },
    { k: 'n', f: frame([s.x1, 0, s.z0], [-1, 0, 0], UP, [0, 0, -1]), len: X },
    { k: 'e', f: frame([s.x1, 0, s.z1], [0, 0, -1], UP, [1, 0, 0]), len: Z },
    { k: 'w', f: frame([s.x0, 0, s.z0], [0, 0, 1], UP, [-1, 0, 0]), len: Z },
  ];
  const nF = Math.max(1, Math.round((E - 0.6 - GF) / 3.0));
  const fh = (E - 0.6 - GF) / nF;
  const balcFloors = s.balconies && nF >= 3 ? [...new Set([2, nF])] : [];

  // 屋頂幾何參數
  const hb = (R - E) * 0.68;
  let a1 = 1.4, a2 = a1 + (R - E - hb) * 2.2;
  const minDim = Math.min(X, Z);
  if (2 * a2 > minDim - 1) { const k = (minDim - 1) / (2 * a2); a1 *= k; a2 *= k; }
  const ins = (k, a) => (blank[k] ? 0 : a);

  for (const { k, f, len } of faces) {
    if (blank[k]) {
      gw.quad(P(f, 0, 0, 0), P(f, len, 0, 0), P(f, len, E, 0), P(f, 0, E, 0), [0, 0], [len, 0], [len, E], [0, E], f.az);
      continue;
    }
    const nb = Math.max(1, Math.round((len - 1.6) / BAY));
    const bay = (len - 1.6) / nb;
    const centers = Array.from({ length: nb }, (_, i) => 0.8 + (i + 0.5) * bay);
    const rects = [];
    const isArc = s.arcade === k;
    for (const uc of centers) {
      if (!isArc) {
        if (s.shops) { const w = Math.min(bay - 0.7, 2.8); rects.push([uc - w / 2, uc + w / 2, 0, 3.4, 0.4]); }
        else rects.push([uc - 0.65, uc + 0.65, 1.1, 3.5, 0.3]);
      }
      for (let fl = 1; fl <= nF; fl++) {
        const y0 = GF + (fl - 1) * fh;
        const french = balcFloors.includes(fl) || fl === 1;
        rects.push([uc - 0.6, uc + 0.6, y0 + (french ? 0.12 : 0.55), y0 + fh - 0.45, 0.28]);
      }
    }
    wallWithOpenings(gw, gd, f, len, isArc ? GF : 0, E, rects);
    if (isArc) arcade(gw, gd, f, len);
    // 線腳：底層頂的腰線、簷口
    fbox(gw, f, 0, len, GF - 0.12, GF + 0.12, 0, 0.14);
    fbox(gw, f, -0.2, len + 0.2, E - 0.5, E - 0.2, 0, 0.18);
    fbox(gw, f, -0.45, len + 0.45, E - 0.2, E, 0, 0.45);
    // 陽台（2 樓與頂樓的連續陽台）
    for (const fl of balcFloors) {
      const y0 = GF + (fl - 1) * fh;
      fbox(gw, f, 0.4, len - 0.4, y0 - 0.06, y0 + 0.1, 0, 0.6);
      fbox(gi, f, 0.4, len - 0.4, y0 + 0.98, y0 + 1.02, 0.55, 0.6);
      fbox(gi, f, 0.4, len - 0.4, y0 + 0.16, y0 + 0.19, 0.56, 0.59);
      const np = Math.max(2, Math.round((len - 0.8) / 0.5));
      for (let q = 0; q <= np; q++) {
        const u = 0.42 + ((len - 0.84) * q) / np;
        fbox(gi, f, u - 0.012, u + 0.012, y0 + 0.1, y0 + 0.98, 0.563, 0.587, { b0: true, b1: true });
      }
    }
    // 老虎窗（落在下段陡坡）
    const top = E + 0.15 + Math.min(1.7, hb - 0.7);
    if (hb > 1.6) {
      for (const uc of centers) {
        if (uc < a1 + 1.0 || uc > len - a1 - 1.0) continue;
        const b0 = E + 0.1, cf = -0.25, cb = -a1 - 0.4, w = 0.65;
        gw.quad(P(f, uc - w, b0, cf), P(f, uc + w, b0, cf), P(f, uc + w, top, cf), P(f, uc - w, top, cf), [uc - w, b0], [uc + w, b0], [uc + w, top], [uc - w, top], f.az);
        gd.quad(P(f, uc - 0.4, b0 + 0.2, cf + 0.01), P(f, uc + 0.4, b0 + 0.2, cf + 0.01), P(f, uc + 0.4, top - 0.15, cf + 0.01), P(f, uc - 0.4, top - 0.15, cf + 0.01), [0, 0], [1, 0], [1, 1], [0, 1], f.az);
        gw.tri(P(f, uc - w - 0.05, top, cf), P(f, uc + w + 0.05, top, cf), P(f, uc, top + 0.55, cf), [uc - w, top], [uc + w, top], [uc, top + 0.55], f.az);
        gz.quad(P(f, uc - w, b0, cf), P(f, uc - w, top, cf), P(f, uc - w, top, cb), P(f, uc - w, b0, cb), [cf, b0], [cf, top], [cb, top], [cb, b0], D(f, -1, 0, 0));
        gz.quad(P(f, uc + w, b0, cf), P(f, uc + w, top, cf), P(f, uc + w, top, cb), P(f, uc + w, b0, cb), [cf, b0], [cf, top], [cb, top], [cb, b0], f.ax);
        const ap = P(f, uc, top + 0.58, cf + 0.08), apb = P(f, uc, top + 0.58, cb);
        gz.quad(P(f, uc - w - 0.1, top - 0.04, cf + 0.08), ap, apb, P(f, uc - w - 0.1, top - 0.04, cb), [0, 0], [0.9, 0], [0.9, 1.5], [0, 1.5], D(f, -0.6, 1, 0));
        gz.quad(P(f, uc + w + 0.1, top - 0.04, cf + 0.08), ap, apb, P(f, uc + w + 0.1, top - 0.04, cb), [0, 0], [0.9, 0], [0.9, 1.5], [0, 1.5], D(f, 0.6, 1, 0));
      }
    }
  }

  // ---------------- 馬薩式屋頂 ----------------
  const lvl = (a, y) => ({ x0: s.x0 + ins('w', a), x1: s.x1 - ins('e', a), z0: s.z0 + ins('n', a), z1: s.z1 - ins('s', a), y });
  const L0 = lvl(0, E), L1 = lvl(a1, E + hb), L2 = lvl(a2, R);
  const edge = (l, k) => ({
    s: [[l.x0, l.z1], [l.x1, l.z1]], n: [[l.x1, l.z0], [l.x0, l.z0]],
    e: [[l.x1, l.z1], [l.x1, l.z0]], w: [[l.x0, l.z0], [l.x0, l.z1]],
  })[k];
  const outN = { s: [0, 0, 1], n: [0, 0, -1], e: [1, 0, 0], w: [-1, 0, 0] };
  for (const k of ['s', 'n', 'e', 'w']) {
    let vacc = 0;
    for (const [lo, hi, din] of [[L0, L1, a1], [L1, L2, a2 - a1]]) {
      const [p0, p1] = edge(lo, k), [q0, q1] = edge(hi, k);
      const A = [p0[0], lo.y, p0[1]], Bp = [p1[0], lo.y, p1[1]], C = [q1[0], hi.y, q1[1]], Dd = [q0[0], hi.y, q0[1]];
      const ex = [Bp[0] - A[0], 0, Bp[2] - A[2]], el = Math.hypot(ex[0], ex[2]) || 1;
      const ux = (p) => ((p[0] - A[0]) * ex[0] + (p[2] - A[2]) * ex[2]) / el;
      if (blank[k]) {
        gw.quad(A, Bp, C, Dd, [ux(A), A[1]], [ux(Bp), Bp[1]], [ux(C), C[1]], [ux(Dd), Dd[1]], outN[k]);
      } else {
        const sl = Math.hypot(blank[k] ? 0 : din, hi.y - lo.y);
        const o = outN[k];
        gz.quad(A, Bp, C, Dd, [ux(A), vacc], [ux(Bp), vacc], [ux(C), vacc + sl], [ux(Dd), vacc + sl], [o[0], 0.5, o[2]]);
        vacc += sl;
      }
    }
  }
  groundRect(gz, L2.x0, L2.x1, L2.z0, L2.z1, R);

  // ---------------- 煙囪 ----------------
  const chim = (x0, x1, z0, z1, y0, y1) => {
    fbox(gw, frame([0, 0, 0], [1, 0, 0], UP, [0, 0, 1]), x0, x1, y0, y1, z0, z1, { b0: true });
    fbox(gw, frame([0, 0, 0], [1, 0, 0], UP, [0, 0, 1]), x0 - 0.08, x1 + 0.08, y1, y1 + 0.12, z0 - 0.08, z1 + 0.08);
  };
  const rc = r.fork('chimneys');
  // 沿屋脊平台長邊
  const alongX = L2.x1 - L2.x0 >= L2.z1 - L2.z0;
  const span = alongX ? L2.x1 - L2.x0 : L2.z1 - L2.z0;
  const nC = Math.max(1, Math.floor(span / rc.range(7, 11)));
  for (let i = 0; i < nC; i++) {
    const t = (i + 0.5) / nC + rc.range(-0.03, 0.03);
    const h = rc.range(1.0, 2.2), w = rc.range(1.0, 2.4), d = 0.6;
    if (alongX) {
      const x = L2.x0 + t * (L2.x1 - L2.x0);
      for (const zz of [L2.z0 + 0.5, L2.z1 - 0.5 - d]) if (rc.chance(0.8)) chim(x - w / 2, x + w / 2, zz, zz + d, R - 0.5, R + h);
    } else {
      const z = L2.z0 + t * (L2.z1 - L2.z0);
      for (const xx of [L2.x0 + 0.5, L2.x1 - 0.5 - d]) if (rc.chance(0.8)) chim(xx, xx + d, z - w / 2, z + w / 2, R - 0.5, R + h);
    }
  }
  // 山牆（共用牆）上的煙囪群
  for (const k of ['e', 'w']) {
    if (!blank[k]) continue;
    const x = k === 'e' ? s.x1 : s.x0;
    const zc = (L2.z0 + L2.z1) / 2 + rc.range(-2, 2), w = rc.range(2, 4);
    chim(x - 0.45, x + 0.45, zc - w / 2, zc + w / 2, R - 0.5, R + rc.range(1.2, 2.4));
  }
}

const tintFor = (r) => {
  const k = r.range(0.9, 1.06), h = r.range(-0.035, 0.035);
  return [k * (1 + h), k, k * (1 - h * 1.4)];
};

export function buildBuildings(B, L, rng) {
  const S = L.surroundings;
  for (const b of S.buildings) {
    const r = rng(`environment/building/${b.id}`);
    const isCloitre = b.id.startsWith('cloitre');
    if (!b.varied) {
      building(B, {
        ...b, arcade: b.arcadedGround ? (b.z1 <= L.parvis.bounds.z0 + 0.01 ? 's' : 'n') : null,
        balconies: isCloitre, shops: isCloitre, tint: tintFor(r),
      }, r);
      continue;
    }
    // 左岸一排：切成多棟，高低略有變化；橋頭留街口
    const gaps = S.bridges.map((br) => [br.x0, br.x1]).sort((p, q) => p[0] - q[0]);
    let runs = [[b.x0, b.x1]];
    for (const [g0, g1] of gaps) runs = runs.flatMap(([u, v]) => (g1 <= u || g0 >= v ? [[u, v]] : [[u, Math.max(u, g0)], [Math.min(v, g1), v]].filter(([p, q]) => q - p > 6)));
    let idx = 0;
    for (const [u, v] of runs) {
      const cuts = [u];
      let x = u;
      while (v - x > 30) { x += r.range(14, 26); cuts.push(x); }
      cuts.push(v);
      for (let i = 0; i < cuts.length - 1; i++) {
        const rb = rng(`environment/building/${b.id}/${idx++}`);
        const eave = b.eave + rb.range(-3.5, 1.5);
        const ridge = eave + (b.ridge - b.eave) + rb.range(-1.2, 1.0);
        building(B, {
          x0: cuts[i], x1: cuts[i + 1], z0: b.z0, z1: b.z1 - rb.range(0, 3), eave, ridge,
          balconies: true, shops: true, tint: tintFor(rb),
          blank: { w: i > 0, e: i < cuts.length - 2 },
        }, rb);
      }
    }
  }
}
