// src/environment/river.js — 塞納河河堤、下河階梯、橋
import { box, extrude, frame, groundRect, ID } from './geom.js';
import { islandBounds, FAR } from './ground.js';

/** 把區間 [a, b] 扣掉 cuts，回傳剩下的區段 */
function subtract(a, b, cuts) {
  let segs = [[a, b]];
  for (const [c0, c1] of cuts) segs = segs.flatMap(([u, v]) => (c1 <= u || c0 >= v ? [[u, v]] : [[u, Math.max(u, c0)], [Math.min(v, c1), v]].filter(([p, q]) => q - p > 0.01)));
  return segs;
}

/** 沿 x 走的石砌欄牆（parapet）：face 在 zFace，向 side 方向（-1 = 往 -z 長厚度） */
function parapetX(g, x0, x1, y, zFace, side, H) {
  const t = 0.5;
  const za = side < 0 ? zFace - t : zFace, zb = side < 0 ? zFace : zFace + t;
  box(g, x0, x1, y, y + H - 0.12, za, zb, { b0: true });
  box(g, x0 - 0.04, x1 + 0.04, y + H - 0.12, y + H, za - 0.07, zb + 0.07);
}
/** 沿 z 走的欄牆 */
function parapetZ(g, z0, z1, y, xFace, side, H) {
  const t = 0.5;
  const xa = side < 0 ? xFace - t : xFace, xb = side < 0 ? xFace : xFace + t;
  box(g, xa, xb, y, y + H - 0.12, z0, z1, { b0: true });
  box(g, xa - 0.07, xb + 0.07, y + H - 0.12, y + H, z0 - 0.04, z1 + 0.04);
}

export function buildRiver(B, L) {
  const S = L.surroundings, sn = S.seine;
  const g = B.get('river', 'stoneQuay');
  const isl = islandBounds(L);
  const wq = sn.quayWall, wl = sn.leftBankQuayWall, lq = sn.lowerQuay;
  const bottom = Math.min(wq.bottom, sn.south.waterY) - 1.5;
  const T = 1.5; // 牆厚（隱藏在地面下）

  // ---------------- 島側：石砌高牆直接入水（四周都做，南側照 layout） ----------------
  box(g, isl.x0, isl.x1, bottom, wq.top - 0.01, isl.z1 - T, isl.z1, { b1: true, b0: true }); // 南
  box(g, isl.x0, isl.x1, bottom, wq.top - 0.01, isl.z0, isl.z0 + T, { b1: true, b0: true }); // 北
  box(g, isl.x0, isl.x0 + T, bottom, wq.top - 0.01, isl.z0, isl.z1, { b1: true, b0: true }); // 西
  box(g, isl.x1 - T, isl.x1, bottom, wq.top - 0.01, isl.z0, isl.z1, { b1: true, b0: true }); // 東
  // 牆頂下方的凸出線腳（cordon）
  const cy0 = wq.top - 0.55, cy1 = wq.top - 0.25;
  box(g, isl.x0 - 0.15, isl.x1 + 0.15, cy0, cy1, isl.z1, isl.z1 + 0.15, { c0: true });

  // 欄牆：橋頭與階梯入口留空
  const st = sn.quayStairs;
  const cutsS = [...S.bridges.filter((b) => b.z0 <= isl.z1 + 0.01).map((b) => [b.x0, b.x1]), ...st.map((s) => [s.x0, s.x0 + 1.6])];
  for (const [a, b] of subtract(isl.x0, isl.x1, cutsS)) parapetX(g, a, b, wq.top, isl.z1, -1, wq.parapetHeight);
  parapetX(g, isl.x0, isl.x1, wq.top, isl.z0, 1, wq.parapetHeight);
  parapetZ(g, isl.z0 + 0.5, isl.z1 - 0.5, wq.top, isl.x0, 1, wq.parapetHeight);
  parapetZ(g, isl.z0 + 0.5, isl.z1 - 0.5, wq.top, isl.x1, -1, wq.parapetHeight);

  // ---------------- 下河階梯：貼著高牆外側，從 x0（頂）往 x1（底）下降 ----------------
  for (const s of st) {
    const drop = s.from - s.to;
    const landing = 1.2;
    const n = Math.max(4, Math.round(drop / 0.17));
    const run = (s.x1 - s.x0) - landing;
    const tread = run / n;
    const wall = 0.4;
    for (let i = 0; i < n; i++) {
      const top = s.from - ((i + 1) * drop) / n;
      box(g, s.x0 + i * tread, s.x0 + (i + 1) * tread, bottom, top, s.z0, s.z1 - wall, { b0: true, c0: true });
    }
    box(g, s.x1 - landing, s.x1, bottom, s.to, s.z0, s.z1 - wall, { b0: true, c0: true });
    // 外側斜欄牆（跟著階梯斜度）
    const H = wq.parapetHeight;
    extrude(g, ID, [[s.x0 - wall, bottom], [s.x1, bottom], [s.x1, s.to + H], [s.x1 - landing, s.to + H], [s.x0, s.from + H], [s.x0 - wall, s.from + H]], s.z1 - wall, s.z1);
    // 頂端封牆
    box(g, s.x0 - wall, s.x0, bottom, s.from + H, s.z0, s.z1 - wall, { b0: true, c0: true });
  }

  // ---------------- 左岸：下層步道＋高牆 ----------------
  // 下層步道臨水的擋土牆面
  box(g, FAR.x0, FAR.x1, bottom, lq.y, lq.z0, lq.z1, { b0: true, b1: true });
  groundRect(B.get('river', 'stonePaving'), FAR.x0, FAR.x1, lq.z0, lq.z1, lq.y);
  // 步道邊緣的壓頂石
  box(g, FAR.x0, FAR.x1, lq.y, lq.y + 0.08, lq.z0 - 0.05, lq.z0 + 0.45);
  // 高牆
  box(g, FAR.x0, FAR.x1, lq.y, wl.top - 0.01, wl.z, wl.z + T, { b1: true, b0: true });
  box(g, FAR.x0, FAR.x1, wl.top - 0.55, wl.top - 0.25, wl.z - 0.15, wl.z, { c1: true });
  const cutsN = S.bridges.map((b) => [b.x0, b.x1]);
  for (const [a, b] of subtract(FAR.x0, FAR.x1, cutsN)) parapetX(g, a, b, wl.top, wl.z, 1, wl.parapetHeight);
}

// -----------------------------------------------------------------------------
// 橋：單拱（弓形拱）石橋，沿 z 跨河；橋面略為拱起
// -----------------------------------------------------------------------------
export function buildBridges(B, L) {
  const S = L.surroundings, sn = S.seine;
  const g = B.get('river', 'stoneQuay');
  const gc = B.get('river', 'stoneCarved');
  const ga = B.get('river', 'asphalt');
  const gp = B.get('river', 'stonePaving');
  const water = sn.south.waterY;
  const bottom = water - 1.5;
  // 剖面框架：a = z、b = y、c = x
  const F = frame([0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0]);

  for (const br of S.bridges) {
    const z0 = br.z0, z1 = br.z1, span = z1 - z0, half = span / 2, zm = (z0 + z1) / 2;
    const rise = br.archRise;
    const R = (half * half + rise * rise) / (2 * rise);
    const yc = water + rise - R; // 圓心高度
    const intr = (z) => yc + Math.sqrt(Math.max(0, R * R - (z - zm) ** 2));
    const deck = (z) => br.deckY * Math.sin((Math.PI * (z - z0)) / span); // 兩端接地面 0，中央 deckY
    const N = 40;
    const zs = Array.from({ length: N + 1 }, (_, i) => z0 + (span * i) / N);

    // 拱身（拱腹到橋面之間的實體）
    const body = [...zs.map((z) => [z, intr(z)]), ...zs.slice().reverse().map((z) => [z, deck(z) - 0.01])];
    extrude(g, F, body, br.x0, br.x1);
    // 拱腳往水下延伸（橋墩基座）
    for (const zz of [z0, z1]) {
      const za = zz === z0 ? z0 : z1 - 2.5, zb = zz === z0 ? z0 + 2.5 : z1;
      box(g, br.x0 - 0.3, br.x1 + 0.3, bottom, water + 0.6, za, zb, { b0: true });
    }

    // 拱圈（兩側凸出的楔石環帶，stoneCarved）
    const ringW = 0.9, out = 0.12;
    const outer = (z) => yc + Math.sqrt(Math.max(0, (R + ringW) ** 2 - (z - zm) ** 2));
    const ringPts = [...zs.map((z) => [z, intr(z)]), ...zs.slice().reverse().map((z) => [z, Math.min(outer(z), deck(z) - 0.7)])];
    extrude(gc, F, ringPts, br.x0 - out, br.x0);
    extrude(gc, F, ringPts, br.x1, br.x1 + out);
    // 楔石分縫：在拱圈外緣做淺凸塊，加強石拱感
    const nv = Math.round((Math.PI * R * 2 * Math.asin(half / R)) / 1.1 / Math.PI);
    for (let k = 1; k < nv; k += 2) {
      const za = z0 + (span * k) / nv, zb = z0 + (span * (k + 1)) / nv;
      const seg = [];
      for (let q = 0; q <= 3; q++) { const z = za + ((zb - za) * q) / 3; seg.push([z, intr(z)]); }
      for (let q = 3; q >= 0; q--) { const z = za + ((zb - za) * q) / 3; seg.push([z, Math.min(outer(z), deck(z) - 0.7)]); }
      extrude(gc, F, seg, br.x0 - out - 0.04, br.x0 - out);
      extrude(gc, F, seg, br.x1 + out, br.x1 + out + 0.04);
    }

    // 橋面下的簷口線腳
    const band = (y0, y1) => [...zs.map((z) => [z, deck(z) + y0]), ...zs.slice().reverse().map((z) => [z, deck(z) + y1])];
    extrude(gc, F, band(-0.55, -0.3), br.x0 - 0.22, br.x0);
    extrude(gc, F, band(-0.55, -0.3), br.x1, br.x1 + 0.22);

    // 欄牆（隨橋面起伏）＋壓頂
    const H = br.parapetHeight, t = 0.5;
    extrude(g, F, band(-0.3, H - 0.12), br.x0, br.x0 + t);
    extrude(g, F, band(-0.3, H - 0.12), br.x1 - t, br.x1);
    extrude(gc, F, band(H - 0.12, H), br.x0 - 0.07, br.x0 + t + 0.07);
    extrude(gc, F, band(H - 0.12, H), br.x1 - t - 0.07, br.x1 + 0.07);

    // 橋面：中央車道（柏油）、兩側人行道（石板，高 0.15）
    const sw = Math.min(3.0, (br.x1 - br.x0) * 0.18);
    const xa = br.x0 + t, xb = br.x0 + t + sw, xc = br.x1 - t - sw, xd = br.x1 - t;
    for (let i = 0; i < N; i++) {
      const za = zs[i], zb = zs[i + 1], ya = deck(za), yb = deck(zb);
      ga.quad([xb, ya + 0.02, za], [xc, ya + 0.02, za], [xc, yb + 0.02, zb], [xb, yb + 0.02, zb], [xb, za], [xc, za], [xc, zb], [xb, zb], [0, 1, 0]);
      for (const [p, q] of [[xa, xb], [xc, xd]]) {
        gp.quad([p, ya + 0.15, za], [q, ya + 0.15, za], [q, yb + 0.15, zb], [p, yb + 0.15, zb], [p, za], [q, za], [q, zb], [p, zb], [0, 1, 0]);
      }
      // 路緣
      gp.quad([xb, ya + 0.02, za], [xb, yb + 0.02, zb], [xb, yb + 0.15, zb], [xb, ya + 0.15, za], [za, 0], [zb, 0], [zb, 0.13], [za, 0.13], [1, 0, 0]);
      gp.quad([xc, ya + 0.02, za], [xc, yb + 0.02, zb], [xc, yb + 0.15, zb], [xc, ya + 0.15, za], [za, 0], [zb, 0], [zb, 0.13], [za, 0.13], [-1, 0, 0]);
    }
  }
}
