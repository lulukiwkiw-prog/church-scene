// src/facades/westfront.js — 西立面（門以外）：水平線腳、國王廊、聖母露臺欄杆、西玫瑰窗與大圓拱、
// 塔窗、壁面三葉圓章、扶壁小龕、大迴廊、怪獸迴廊欄杆、鐘樓尖窗（拱圈＋百葉）、塔頂托檐與欄杆、
// 扶壁壁龕像的華蓋與托座。
import * as THREE from 'three';
import { pointedArch } from '../../layout.js';
import {
  PI, T, S, Ry, mul, frame, plateM, sweep, arcPts, archBand, archPts, archHalfWidth, cuspedArchPts, foilPts, circlePts,
  plate, box, colonnette, planSweep, prep, mergeGeometries, crocket, finial, shapeOf, extrude, Batch,
} from './kit.js';
import { rose, steppedFrame, balustrade, balustradePath, corbelRow, foilRosetteGeo } from './parts.js';
import { canopyGeo } from './portal.js';


/** 水平線腳剖面（o 往外、h 往上）：下緣凹槽、滾邊、前緣、斜壓頂 */
export function stringCourse(hgt, proj) {
  return [
    [[0, 0], [proj * 0.35, hgt * 0.08], [proj * 0.7, hgt * 0.22], [proj * 0.82, hgt * 0.3]],
    arcPts(proj * 0.82, hgt * 0.42, hgt * 0.12, -PI / 2, PI / 2, 6),
    [[proj * 0.82, hgt * 0.54], [proj, hgt * 0.56], [proj, hgt * 0.72]],
    [[proj, hgt * 0.72], [proj * 0.15, hgt * 0.97], [0, hgt]],
  ];
}

export function buildWestFront(C, rng) {
  const wf = C.westFront;
  const z0 = wf.z0, z1 = wf.z1;
  const B = wf.buttresses;
  const kings = wf.galleryOfKings;
  const rt = wf.roseTier;
  const gg = wf.grandGallery;
  const GALLERY_X = wf.galleryRecessX ?? 1.5; // 大迴廊層牆面退縮

  const lower = new Batch('west-lower');
  const roseB = new Batch('west-rose');
  const gal = new Batch('west-gallery');
  const tow = new Batch('west-towers');

  // 扶壁在高度 y 的凸出量
  const projAt = (b, y) => {
    if (y > b.top) return 0;
    let p = b.projection;
    for (const s of b.setbacks) if (y >= s.y) p = s.projection;
    return p;
  };
  // 立面平面輪廓（含扶壁凸出），從北塔側面 x=wrap 繞到南塔側面
  const outline = (y, wrap = 13) => {
    const pts = [[wrap, z0]];
    const sorted = [...B].sort((a, b) => a.z - b.z);
    for (const b of sorted) {
      const p = projAt(b, y);
      const za = Math.max(z0, b.z - b.width / 2), zb = Math.min(z1, b.z + b.width / 2);
      if (za > z0 + 1e-6) pts.push([0, za]); else pts[0] = [wrap, z0];
      if (za <= z0 + 1e-6) pts.push([-p, z0]); else pts.push([-p, za]);
      pts.push([-p, zb]);
      if (zb < z1 - 1e-6) pts.push([0, zb]);
    }
    pts.push([wrap, z1]);
    return pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  };
  const inButtress = (z, y) => B.find((b) => projAt(b, y) > 0 && Math.abs(z - b.z) < b.width / 2);

  // =====================================================================
  // 1. 水平線腳
  // =====================================================================
  // 門層頂（國王廊下）的大線腳＋葉飾帶
  lower.add('carved', planSweep(outline(16.9), kings.yBottom - 0.75, stringCourse(0.75, 0.4)), null, 'keep');
  // 國王廊台座（像站在上面）
  {
    const prof = [[[0, 0], [0.5, 0.0]], [[0.5, 0], [0.75, 0.12], [0.85, 0.3]], arcPts(0.85, 0.42, 0.12, -PI / 2, PI / 2, 5), [[0.85, 0.54], [0.85, 0.6], [0, 0.6]]];
    lower.add('carved', planSweep([[0.6, z0], [0.6, z1]].map(([x, z]) => [x, z]), kings.yBottom, prof.map((s) => s.map(([o, h]) => [o, h]))), null, 'keep');
  }
  // 露臺前緣：深線腳＋托檐（露臺板本身是結構）
  {
    const xf = -rt.terrace.depth;
    const prof = [[[0, 0], [0.12, 0.05]], arcPts(0.12, 0.17, 0.12, -PI / 2, PI / 2, 6), [[0.12, 0.29], [0.2, 0.33], [0.2, 0.55]], [[0.2, 0.55], [0.05, 0.62], [0.05, 1.08]]];
    lower.add('carved', planSweep([[xf, z0], [xf, z1]], kings.yTop - 0.05, prof), null, 'keep');
    corbelRow(lower, [xf, z0 + 0.3], [xf, z1 - 0.3], kings.yTop - 0.42, { proj: 0.22, h: 0.4, w: 0.2, spacing: 0.55 });
  }
  // 大迴廊地坪線腳（玫瑰窗層頂）
  lower.add('carved', planSweep(outline(gg.yBottom - 0.1), gg.yBottom - 0.55, stringCourse(0.65, 0.35)), null, 'keep');

  // =====================================================================
  // 2. 國王廊：28 個三葉尖拱龕、細柱、拱頭板
  // =====================================================================
  {
    const n = kings.arcadeArches;
    const pitch = (z1 - z0) / n;
    const yb = kings.statueBaseY, yt = kings.yTop;
    const colH = 2.75;
    const col = colonnette(0.12, colH, 10);
    const ms = [];
    for (let i = 0; i <= n; i++) ms.push(T(0.12, yb, z0 + i * pitch));
    lower.addMany('carved', col, ms);
    // 拱頭板：上緣平直、下緣一串三葉尖拱
    const ys = yb + colH;
    const ow = pitch - 0.3;
    const R = ow * 0.72;
    const rise = Math.sqrt(R * R - (R - ow / 2) ** 2);
    const sp = Math.min(ys + 0.05, yt - 0.25 - rise);
    const bottom = [];
    for (let i = 0; i < n; i++) {
      const cz = z0 + (i + 0.5) * pitch;
      const pts = cuspedArchPts(ow, sp, { n: 10, cx: cz, cusp: ow * 0.09, R, yBottom: ys - 0.05 });
      bottom.push(...pts);
    }
    const outlineK = [[z0, ys - 0.05], ...bottom, [z1, ys - 0.05], [z1, yt], [z0, yt]];
    lower.add('carved', plate(outlineK, [], 0.32, -0.12));
    // 每個拱尖上的小三葉孔與山花線
    const tre = [];
    for (let i = 0; i < n; i++) tre.push(T(0, 0, z0 + (i + 0.5) * pitch));
    const trefoil = plate(foilPts(3, 0.17, 0.4, { rot: PI / 2, cy: yt - 0.25 }), [foilPts(3, 0.12, 0.4, { rot: PI / 2, cy: yt - 0.25 })], 0.06, -0.18);
    lower.addMany('carved', trefoil, tre);
    // 柱頭上方的橫帶
    lower.add('carved', box(0.5, 0.12, z1 - z0, -0.2, yt - 0.12, z0));
  }

  // =====================================================================
  // 3. 玫瑰窗層
  // =====================================================================
  // 3a 聖母露臺欄杆
  balustrade(roseB, [-rt.terrace.depth + 0.14, z0 + 0.1], [-rt.terrace.depth + 0.14, z1 - 0.1], rt.terrace.y, rt.terrace.balustradeHeight, 'arcade', 0.2, 1.4);
  // 3b 西玫瑰窗
  const wr = rt.westRose;
  rose(roseB, T(0, 0, 0), {
    R: wr.diameter / 2, cy: wr.y, cz: wr.z, x0: wr.x, nIn: wr.innerSpokes, nOut: wr.outerSpokes,
    oculusR: wr.centerOculusDiameter / 2, frameW: 0.55, frameFront: -0.18, frameK: 3, inset: 0.05,
  });
  // 包住玫瑰窗的大圓拱（半圓拱，拱頂 = enclosingArch.apex）：線腳 + 兩側細柱落到露臺
  {
    const ea = wr.enclosingArch;
    const Rr = ea.width / 2;
    const spring = ea.apex - Rr;
    const k = ea.mouldings;
    const fw = 0.62;
    const strips = steppedFrame(fw, 0.0, -0.3, k).map((s) => s.map(([r, d]) => [r - fw, d]));
    roseB.add('carved', archBand(strips, { span: ea.width, spring, R: Rr, x0: 0, yStart: rt.terrace.y, n: 64 }), null, 'keep');
    const col = colonnette(0.1, spring - rt.terrace.y - 0.1, 8);
    for (let i = 0; i < k; i++) {
      const rr = Rr - fw + (i + 0.6) * (fw / k);
      for (const s of [-1, 1]) roseB.add('carved', col, T(-0.12 - 0.08 * i, rt.terrace.y, wr.z + s * rr));
    }
  }
  // 3c 塔窗（西面兩座 + 塔外側面兩座）
  const towerWin = (M, tw) => {
    const add = (key, g, m = null, uv = 'box') => roseB.add(key, g, mul(M, m), uv);
    const apex = tw.sill + tw.height;
    const oa = pointedArch(tw.width, apex);
    const rec = 0.9; // 大尖拱淺凹深度（結構）
    // 大尖拱內的三道拱圈（貼在凹洞側壁內，往內一階一階）
    const fw = 0.62;
    const strips = steppedFrame(fw, rec - 0.02, -0.12, 3).map((s) => s.map(([r, d]) => [r - fw - 0.03, d]));
    add('carved', archBand(strips, { span: tw.width, spring: oa.springing, yStart: tw.sill, n: 44 }), null, 'keep');
    // 側壁細柱
    for (let i = 0; i < 3; i++) {
      const c = colonnette(0.085, oa.springing - tw.sill - 0.05, 8);
      for (const s of [-1, 1]) add('carved', c, T(rec * (1 - (i + 0.8) / 3.5), tw.sill, s * (tw.width / 2 - fw + (i + 0.3) * (fw / 3) - 0.03)));
    }
    // 窗台斜面
    add('carved', plate([[-tw.width / 2, tw.sill], [tw.width / 2, tw.sill], [tw.width / 2, tw.sill + 0.12], [-tw.width / 2, tw.sill + 0.12]], [], rec + 0.25, -0.25));
    // 兩扇尖窗：洞位與結構相同（gap 平均）
    const gap = (tw.width - tw.lancets * tw.lancetWidth) / (tw.lancets + 1);
    const lsill = tw.sill + 0.6, lap = tw.sill + tw.lancetHeight;
    const la = pointedArch(tw.lancetWidth, lap);
    const lstrips = steppedFrame(0.3, rec + 0.45, rec - 0.18, 2).map((s) => s.map(([r, d]) => [r - 0.04, d]));
    for (let i = 0; i < tw.lancets; i++) {
      const c = -tw.width / 2 + gap + tw.lancetWidth / 2 + i * (tw.lancetWidth + gap);
      add('carved', archBand(lstrips, { span: tw.lancetWidth, spring: la.springing, yStart: lsill, n: 30 }), T(0, 0, c), 'keep');
      add('glass', plate(archPts(tw.lancetWidth + 0.1, la.springing, { n: 20, yBottom: lsill - 0.05, R: tw.lancetWidth + 0.1 }), [], 0.02, rec + 0.35), T(0, 0, c));
      // 尖窗內的細中梃（一分為二的鉛條石框）
      add('carved', box(0.12, la.springing - lsill + 0.4, 0.12, rec + 0.2, lsill, c - 0.06));
      for (const s of [-1, 1]) add('carved', colonnette(0.07, la.springing - lsill, 8), T(rec - 0.12, lsill, c + s * (tw.lancetWidth / 2 + 0.12)));
    }
    // 兩尖窗間的中柱（亞當／夏娃站在前面）
    add('carved', colonnette(0.16, la.springing - tw.sill, 10), T(rec - 0.25, tw.sill, 0));
    // 圓窗
    rose(roseB, M, { R: tw.oculusDiameter / 2, cy: tw.oculusY, cz: 0, x0: rec + 0.1, nIn: 8, nOut: 16, oculusR: 0.3, frameW: 0.28, frameFront: rec - 0.15, frameK: 2, inset: 0.03 });
  };
  for (const tw of rt.towerWindows) {
    towerWin(T(0, 0, tw.z), tw);
    // 塔外側面：結構在同一層開了同樣的大尖拱，中心 x = 西立面深度一半
    const s = Math.sign(tw.z);
    const zs = s < 0 ? z0 : z1;
    towerWin(frame((wf.x0 + wf.x1) / 2, 0, zs, 0, -s), tw);
  }
  // 3d 壁面三葉盲飾圓章（落在扶壁上的往旁邊挪到牆面）
  {
    const g = foilRosetteGeo(rt.wallRosettes[0].diameter, rt.wallRosettes[0].lobes, 0.13);
    for (const w of rt.wallRosettes) {
      let z = w.z;
      const b = inButtress(z, w.y);
      if (b) {
        const za = b.z - b.width / 2, zb = b.z + b.width / 2;
        z = Math.abs(z - za) < Math.abs(z - zb) ? za - w.diameter / 2 - 0.08 : zb + w.diameter / 2 + 0.08;
        if (z < z0 + w.diameter / 2 || z > z1 - w.diameter / 2) z = Math.abs(z - za) < Math.abs(z - zb) ? zb + w.diameter / 2 + 0.08 : za - w.diameter / 2 - 0.08;
      }
      roseB.add('carved', g, T(Math.min(0, w.x + 0.05), w.y, z));
    }
  }
  // 3e 扶壁小龕（gâble）：方龕 + 三角山花 + 捲葉 + 頂飾
  for (const b of B) {
    if (!b.gablet) continue;
    const gb = b.gablet;
    const xf = -projAt(b, gb.y);
    const W = gb.width, d = 0.4;
    const yA = gb.y, yB = gb.y + gb.height * 0.4, yC = gb.y + gb.height;
    // 方龕與龕內三葉尖拱
    roseB.add('carved', box(d, yB - yA, W, xf - d, yA, b.z - W / 2));
    roseB.add('carved', plate(cuspedArchPts(W * 0.6, yA + 0.2, { n: 10, yBottom: yA + 0.05, cusp: 0.05, cx: 0 }), [], 0.1, xf - d - 0.0), T(0, 0, b.z));
    // 三角山花（實心板）+ 斜屋面
    const tri = plate([[-W / 2 - 0.08, yB], [W / 2 + 0.08, yB], [0, yC]], [foilPts(3, 0.22, 0.4, { rot: PI / 2, cy: yB + (yC - yB) * 0.38 })], d + 0.1, xf - d - 0.1);
    roseB.add('carved', tri, T(0, 0, b.z));
    // 斜邊捲葉與頂飾
    const ms = [];
    for (const s of [-1, 1]) {
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const zz = s * (W / 2 + 0.08) * (1 - t), yy = yB + (yC - yB) * t;
        const L = Math.hypot(W / 2, yC - yB);
        const tz = -s * (W / 2) / L, ty = (yC - yB) / L;
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, ty, tz), new THREE.Vector3(0, -tz * s * s, s * ty).normalize(), new THREE.Vector3(1, 0, 0));
        m.setPosition(xf - d / 2 - 0.05, yy + 0.05, b.z + zz);
        ms.push(mul(m, S(1.4)));
      }
    }
    roseB.addMany('carved', crocket(), ms);
    roseB.add('carved', finial(1.2), T(xf - d / 2 - 0.05, yC - 0.05, b.z));
  }

  // =====================================================================
  // 4. 大迴廊（38–44）＋ 怪獸迴廊欄杆（44–46）
  // =====================================================================
  {
    const yb = gg.yBottom, ya = gg.arcadeTop;
    const rad = gg.colonnetteRadius;
    // 地坪踏階
    gal.add('carved', box(GALLERY_X + 0.1, 0.22, z1 - z0, -0.1, yb, z0));
    for (const sec of gg.sections) {
      // 扣掉扶壁占用
      let a = sec.z0, bz = sec.z1;
      for (const b of B) {
        const za = b.z - b.width / 2, zb = b.z + b.width / 2;
        if (za <= a + 1e-6 && zb > a) a = zb;
        if (zb >= bz - 1e-6 && za < bz) bz = za;
      }
      const bays = gg.baysPerSection[sec.id];
      const nl = bays * gg.lancetsPerBay;
      const lw = (bz - a) / nl;
      const ow = lw - 2 * rad - 0.02;
      const R = ow * 0.72;
      const rise = Math.sqrt(R * R - (R - ow / 2) ** 2);
      const sp = ya - 0.3 - rise;
      const colH = sp - (yb + 0.22);
      // 雙柱：前排 + 後排；開間分界再加一根
      const col = colonnette(rad, colH, 10);
      const ms = [];
      for (let j = 0; j <= nl; j++) {
        const z = a + j * lw;
        ms.push(T(0.18, yb + 0.22, z), T(0.95, yb + 0.22, z));
        if (j % gg.lancetsPerBay === 0 && j > 0 && j < nl) ms.push(T(0.18, yb + 0.22, z - rad * 2.1), T(0.18, yb + 0.22, z + rad * 2.1));
      }
      gal.addMany('carved', col, ms);
      // 三葉尖拱頭板（前、後兩層）
      const bottom = [];
      for (let j = 0; j < nl; j++) {
        const cz = a + (j + 0.5) * lw;
        bottom.push(...cuspedArchPts(ow, sp, { n: 12, cx: cz, cusp: ow * 0.1, R, yBottom: sp - 0.02 }));
      }
      const holes = [];
      for (let j = 0; j < bays; j++) {
        const cz = a + (j + 0.5) * lw * gg.lancetsPerBay;
        const rr = Math.min(0.24, (ya - sp - rise) * 0.4 + 0.12);
        holes.push(foilPts(3, rr, 0.42, { cx: cz, cy: ya - 0.17 - rr * 0.2, rot: PI / 2, seg: 36 }));
      }
      const top = ya + 0.02;
      const outl = [[a, sp - 0.02], ...bottom, [bz, sp - 0.02], [bz, top], [a, top]];
      gal.add('carved', plate(outl, [], 0.3, 0.03));
      gal.add('carved', plate(outl, [], 0.2, 0.85));
      // 頭板前緣的開間大尖拱線（每開間一道淺滾邊）
      for (let j = 0; j < bays; j++) {
        const cz = a + (j + 0.5) * lw * gg.lancetsPerBay;
        const span = lw * gg.lancetsPerBay - 0.1;
        const Rb = span * 0.62;
        const riseB = Math.sqrt(Rb * Rb - (Rb - span / 2) ** 2);
        const spB = Math.min(ya - 0.05 - riseB, sp + 0.2);
        gal.add('carved', archBand([arcPts(0, 0, 0.06, PI * 0.5, PI * 1.5, 4)], { span, spring: spB, R: Rb, x0: 0.03, yStart: spB, n: 20 }), T(0, 0, cz), 'keep');
      }
    }
    // 頂部：托檐 + 走道板 + 怪獸迴廊欄杆
    gal.add('carved', box(GALLERY_X + 0.35, 0.4, z1 - z0 + 0.5, -0.35, ya, z0 - 0.25));
    corbelRow(gal, [-0.35, z0 + 0.1], [-0.35, z1 - 0.1], ya - 0.38, { proj: 0.2, h: 0.38, w: 0.18, spacing: 0.7 });
    gal.add('carved', planSweep([[-0.35, z0 - 0.25], [-0.35, z1 + 0.25]], ya + 0.25, stringCourse(0.3, 0.12)), null, 'keep');
    balustrade(gal, [-0.18, z0 - 0.1], [-0.18, z1 + 0.1], ya + 0.4, gg.balustradeTop - ya - 0.4, 'quatrefoil', 0.22, 1.5);
    // 塔外側：走道（結構量體頂 46）外緣的欄杆，連到塔東緣
    for (const t of wf.towers) {
      const zo = Math.abs(t.z0) > Math.abs(t.z1) ? t.z0 : t.z1;
      const s = Math.sign(zo);
      const zi = zo - s * 0.12;
      const zIn = t.belfryShell ? (s < 0 ? t.belfryShell.z0 : t.belfryShell.z1) : zo - s * GALLERY_X;
      balustradePath(gal, [[0.2, zi], [t.x1 - 0.12, zi], [t.x1 - 0.12, zIn]], wf.centerSectionTop, 1.0, 'quatrefoil', 0.2, 1.4);
      gal.add('carved', planSweep([[t.x1, zo], [0, zo]].map(([x, z]) => [x, z]).reverse().reverse(), wf.centerSectionTop - 0.45, stringCourse(0.45, 0.2).map((st) => st.map(([o, h]) => [-o, h]))), null, 'keep');
    }
  }

  // =====================================================================
  // 5. 鐘樓：尖窗多層拱圈、側壁細柱、百葉；塔頂托檐與欄杆
  // =====================================================================
  for (const t of wf.towers) {
    const bf = t.belfry, op = bf.openings;
    const sh = t.belfryShell || { x0: t.x0 + GALLERY_X, x1: t.x1, z0: t.z0 + GALLERY_X, z1: t.z1 - GALLERY_X };
    const xa = sh.x0, xb = sh.x1, za = sh.z0, zb = sh.z1;
    const zc = (za + zb) / 2, xc = (xa + xb) / 2;
    const faces = [
      { M: frame(xa, 0, 0, 1, 0), c: zc, sgn: 1 },      // 西：橫向 = +z
      { M: frame(xb, 0, 0, -1, 0), c: -zc, sgn: -1 },   // 東：橫向 = -z
      { M: frame(0, 0, za, 0, 1), c: -xc, sgn: 1 },     // 北面（z = za）：橫向 = -x
      { M: frame(0, 0, zb, 0, -1), c: xc, sgn: 1 },     // 南面：橫向 = +x
    ];
    const oa = pointedArch(op.width, op.sill + op.height);
    const fw = 0.8;
    const strips = steppedFrame(fw, 0.35, -0.4, op.archivolts).map((s) => s.map(([r, d]) => [r - 0.05, d]));
    const arch = archBand(strips, { span: op.width, spring: oa.springing, yStart: op.sill, n: 40 });
    // 帽線（最外圈之外，含捲葉）
    const hood = archBand([[[0, -0.4], [0, -0.55]], arcPts(0.08, -0.55, 0.08, PI, 2 * PI, 5), [[0.16, -0.55], [0.2, -0.3], [0.2, 0.0]]].map((s) => s.map(([r, d]) => [r + fw - 0.05, d])), { span: op.width, spring: oa.springing, yStart: oa.springing - 1.0, n: 40 });
    const cols = [];
    for (let i = 0; i < op.archivolts; i++) {
      const rr = op.width / 2 + (i + 0.45) * (fw / op.archivolts);
      const dd = 0.35 - (i + 1.0) * ((0.75) / (op.archivolts + 0.5));
      const c = colonnette(0.075, oa.springing - op.sill - 0.05, 8);
      for (const s of [-1, 1]) cols.push(prep(c, T(dd, op.sill, s * rr)));
    }
    // 窗台
    cols.push(prep(plate([[-op.width / 2 - fw, op.sill - 0.25], [op.width / 2 + fw, op.sill - 0.25], [op.width / 2 + fw, op.sill], [-op.width / 2 - fw, op.sill]], [], 0.75, -0.45)));
    // 百葉：斜置木板（鉛皮包覆），從窗台到拱頂
    const lou = [];
    if (op.louvres) {
      const n = Math.round(op.height / 0.55);
      for (let i = 0; i < n; i++) {
        const y = op.sill + 0.35 + i * ((op.height - 0.7) / n);
        const hw = Math.min(op.width / 2, archHalfWidth(op.width, oa.springing, y + 0.2)) - 0.02;
        if (hw < 0.15) continue;
        const slat = box(0.75, 0.035, 2 * hw, -0.375, -0.0175, -hw);
        slat.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.6));
        slat.translate(0.95, y, 0);
        lou.push(prep(slat));
      }
      // 百葉框
      lou.push(prep(box(0.12, op.height - 0.3, 0.12, 0.55, op.sill, -op.width / 2 + 0.02)));
      lou.push(prep(box(0.12, op.height - 0.3, 0.12, 0.55, op.sill, op.width / 2 - 0.14)));
    }
    const carvedOne = mergeGeometries([prep(arch, null, 'keep'), prep(hood, null, 'keep')], false);
    const colsOne = mergeGeometries(cols, false);
    const louOne = lou.length ? mergeGeometries(lou, false) : null;
    // 捲葉：帽線外緣
    const crk = [];
    {
      const Rr = op.width + fw + 0.17;
      const cz = op.width / 2;
      const te = Math.acos(-cz / Rr);
      const cnt = 9;
      for (let i = 1; i <= cnt; i++) {
        const th = PI + (te - PI) * (i / (cnt + 0.6));
        const pos = [-0.45, oa.springing + Rr * Math.sin(th), cz + Rr * Math.cos(th)];
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -Math.cos(th), Math.sin(th)), new THREE.Vector3(0, Math.sin(th), Math.cos(th)), new THREE.Vector3(-1, 0, 0));
        m.setPosition(...pos);
        crk.push(mul(m, S(1.6)), mul(S(1, 1, -1), m, S(1.6)));
      }
    }
    for (const f of faces) {
      for (const s of [-1, 1].slice(0, op.perFace)) {
        const M = mul(f.M, T(0, 0, f.c + s * op.offset));
        tow.add('carved', carvedOne, M, 'keep');
        tow.add('carved', colsOne, M);
        if (louOne) tow.add('iron', louOne, M);
        tow.addMany('carved', crocket(), crk.map((m) => mul(M, m)));
        const apexY = oa.springing + Math.sqrt((op.width + fw + 0.17) ** 2 - (op.width / 2) ** 2);
        tow.add('carved', finial(1.6), mul(M, T(-0.45, apexY - 0.1, 0)));
      }
    }
    // 鐘樓腳的線腳（46）與塔頂托檐（66.5）、欄杆（68–69）
    const rect = [[xa, za], [xa, zb], [xb, zb], [xb, za]];
    // 往外法線 = 行進左側：沿 rect 順序 (x 增, z...) 檢查：(xa,za)→(xa,zb) t=(0,+1) → n=(-1,0) ✓
    tow.add('carved', planSweep(rect, bf.yBottom, stringCourse(0.5, 0.22), true), null, 'keep');
    const tc = t.topCornice;
    tow.add('carved', planSweep(rect, tc.y + 0.45, stringCourse(bf.yTop - tc.y - 0.45, 0.5), true), null, 'keep');
    if (tc.corbelTable) {
      for (let i = 0; i < 4; i++) {
        const p0 = rect[i], p1 = rect[(i + 1) % 4];
        corbelRow(tow, p0, p1, tc.y, { proj: 0.35, h: 0.45, w: 0.2, spacing: 0.6, inset: 0.4 });
      }
    }
    const inset = 0.25;
    const rin = [[xa + inset, za + inset], [xa + inset, zb - inset], [xb - inset, zb - inset], [xb - inset, za + inset], [xa + inset, za + inset]];
    balustradePath(tow, rin, t.terrace.y + 0.4 - 0.4, t.terrace.balustradeTop - t.terrace.y, 'arcade', 0.22, 1.2);
  }

  // =====================================================================
  // 6. 扶壁壁龕像的華蓋與托座
  // =====================================================================
  for (const ns of wf.buttressNicheStatues) {
    const top = ns.y + ns.height;
    const xf = -B.find((b) => b.z === ns.z).projection;
    // 托座（像底）
    lower.add('carved', box(0.75, 0.22, 1.0, ns.x - 0.38, ns.y - 0.22, ns.z - 0.5));
    lower.add('carved', box(0.55, 0.35, 0.7, ns.x - 0.2, ns.y - 0.57, ns.z - 0.35));
    lower.add('carved', crocket(), mul(T(ns.x - 0.2, ns.y - 0.57, ns.z), new THREE.Matrix4().makeRotationZ(PI), S(2.2)));
    // 華蓋
    lower.add('carved', canopyGeo(0.55, ns.canopy.height), T(ns.x, top + 0.03, ns.z));
    // 像後的淺龕背板（三葉尖拱框）
    lower.add('carved', plate(cuspedArchPts(1.15, top - 0.2, { n: 10, yBottom: ns.y, cusp: 0.08 }), [], 0.06, xf - 0.06), T(0, 0, ns.z));
  }

  return [lower, roseB, gal, tow];
}
