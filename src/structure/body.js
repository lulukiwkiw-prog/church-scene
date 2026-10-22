// src/structure/body.js — 中殿、詩班席、後殿、袖廊、聖器室的牆體與洞口
import { frame, slab, archPts, circlePts, rectPts, box, stackY, regularPoly } from './geom.js';

const GROUND_SINK = 0.3;
const TRIBUNE_WALL = 1.0;    // 樓廊外牆厚（中心線 = innerAisleOuterZ）
const CHAPEL_WALL = 1.0;     // 禮拜堂外牆厚（外皮 = chapelOuterZ）
const DEG = Math.PI / 180;

/**
 * 一道直牆：外皮由 a 到 b（[x,z]），outward 為外法線；厚度往內。
 * 牆上的洞依位置自動配對（洞的 (x,z) 投影到牆面上）。
 */
function wall(mb, a, b, outward, y0, y1, thick, openings = [], opts = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const F = frame(a, [dx, dz], outward);
  const holes = [];
  for (const o of openings) {
    const rx = o.x - a[0], rz = o.z - a[1];
    const u = rx * F.u[0] + rz * F.u[1];
    const d = rx * F.n[0] + rz * F.n[1];
    if (Math.abs(d) > (o.tol ?? 0.7) || u <= 0 || u >= len) continue;
    holes.push(o.make(u));
  }
  slab(mb, F, rectPts(0, len, y0, y1), 0, -thick, holes, opts);
  return { F, len };
}

const winHole = (w) => ({
  x: w.x, z: w.z, tol: 1.2,
  make: (u) => ({ pts: archPts(u, w.width, w.sill, w.sill + w.height, 12), through: true, revealShade: 0.85 }),
});

export function buildBody(ctx) {
  const { L, M, plinth, report } = ctx;
  const S = L.section, H = L.heights;
  const wo = S.vesselWallZ + S.wallThickness / 2;    // 高牆外皮 7.1
  const tribOut = S.innerAisleOuterZ + TRIBUNE_WALL / 2;
  const clerY0 = H.aisleRoofHigh - 1.5;             // 高牆底（藏在側廊屋頂下）
  const tribY0 = H.aisleRoofLow - 2.0;
  const a = M.ashlar, w = M.weathered;
  const segs = [[L.nave.x0, L.nave.x1], [L.choir.x0, L.choir.x1]];
  const pr = L.porteRouge;

  const clerOpen = L.windows.clerestory.map(winHole);
  const oculi = L.windows.tribuneOculi.map((o) => ({
    x: o.x, z: o.z, tol: 0.7,
    make: (u) => ({ pts: circlePts(u, o.y, o.diameter / 2, 28), through: true, revealShade: 0.85 }),
  }));
  // 紅門：與它重疊的禮拜堂窗省略（layout 衝突，見回報）
  const prRange = [pr.x - pr.width / 2, pr.x + pr.width / 2];
  const chapelWins = L.windows.chapel.filter((c) => {
    const clash = Math.sign(c.z) === Math.sign(pr.z) && Math.abs(Math.abs(c.z) - Math.abs(pr.z)) < 0.5 && c.angleDeg === undefined
      && c.x + c.width / 2 > prRange[0] && c.x - c.width / 2 < prRange[1];
    if (clash) report.notes.push(`紅門 x=${pr.x} 與禮拜堂窗 x=${c.x} 重疊，該窗未開洞`);
    return !clash;
  });
  const chapelOpen = chapelWins.map(winHole);
  const porteRouge = {
    x: pr.x, z: pr.z, tol: 0.7,
    make: (u) => ({ pts: archPts(u, pr.width, 0, pr.apex, 10), depth: 0.6, capShade: 0.8 }),
  };

  // ---------------- 中殿與詩班席（南北兩側） ----------------
  for (const s of [-1, 1]) {
    const north = s < 0;
    for (const [x0, x1] of segs) {
      // 端點順序讓 u 由外看向右（不影響結果，只為一致）
      const A = (z) => (north ? [[x1, z], [x0, z]] : [[x0, z], [x1, z]]);
      // 高牆（clerestory）：高窗 + 交叉部旁的 12 世紀圓窗
      a.tone = north ? 0.95 : 1.0;
      wall(a, ...A(s * wo), [0, s], clerY0, H.wallTop, S.wallThickness, [...clerOpen, ...oculi]);
      // 樓廊外牆
      (north ? w : a).tone = north ? 1.0 : 0.98;
      wall(north ? w : a, ...A(s * tribOut), [0, s], tribY0, H.tribuneRoofLow, TRIBUNE_WALL);
      // 禮拜堂外牆
      a.tone = north ? 0.93 : 1.0;
      wall(a, ...A(s * S.chapelOuterZ), [0, s], -GROUND_SINK, H.aisleRoofLow, CHAPEL_WALL,
        [...chapelOpen, ...(north ? [porteRouge] : [])]);
      const [pa, pb] = A(s * S.chapelOuterZ);
      const gaps = [];
      if (north && pr.x > x0 && pr.x < x1) {
        const u = Math.abs(pr.x - pa[0]);
        gaps.push([u - pr.width / 2 - 0.05, u + pr.width / 2 + 0.05]);
      }
      plinth(a, pa, pb, [0, s], gaps);
    }
  }
  a.tone = 1.0; w.tone = 1.0;

  // ---------------- 後殿（半正十邊形） ----------------
  const ap = L.apse;
  const vtx = (ang, r) => [ap.cx + r * Math.cos(ang * DEG), ap.z + r * Math.sin(ang * DEG)];
  const angs = ap.vertexAnglesDeg;
  for (let i = 0; i < angs.length - 1; i++) {
    const a0 = angs[i], a1 = angs[i + 1];
    const mid = (a0 + a1) / 2;
    const out = [Math.cos(mid * DEG), Math.sin(mid * DEG)];
    const north = mid < 0;
    a.tone = north ? 0.96 : 1.0;
    wall(a, vtx(a0, wo), vtx(a1, wo), out, clerY0, H.wallTop, S.wallThickness, clerOpen);
    wall(a, vtx(a0, tribOut), vtx(a1, tribOut), out, tribY0, H.tribuneRoofLow, TRIBUNE_WALL);
    wall(a, vtx(a0, S.chapelOuterZ), vtx(a1, S.chapelOuterZ), out, -GROUND_SINK, H.aisleRoofLow, CHAPEL_WALL, chapelOpen);
    plinth(a, vtx(a0, S.chapelOuterZ), vtx(a1, S.chapelOuterZ), out);
    // layout 的後殿窗位於「頂點半徑」上，實際牆面在弦上（較內），回報偏差
    if (i === 0) {
      const off = (r) => +(r - r * Math.cos((a1 - a0) / 2 * DEG)).toFixed(2);
      report.notes.push(`後殿窗座標用頂點半徑 apsePoint(a, r)，但多邊形牆面中點在 r·cos18°：高窗外移 ${off(wo)} m、禮拜堂窗外移 ${off(S.chapelOuterZ)} m（結構已把洞開在實際牆面上）`);
    }
  }
  a.tone = 1.0;

  // ---------------- 袖廊 ----------------
  for (const tf of L.transept.facades) buildTransept(ctx, tf);

  // ---------------- 聖器室與廊道 ----------------
  const sc = L.sacristy;
  a.tone = 0.97;
  box(a, sc.x0, sc.x1, -GROUND_SINK, sc.eave, sc.z0, sc.z1);
  // 山牆：layout.sacristy.roofType = 'gable'，屋脊沿 ridgeAxis
  if ((sc.roofType || 'gable') === 'gable') {
    if ((sc.ridgeAxis || 'x') === 'x') {
      const zc = (sc.z0 + sc.z1) / 2;
      for (const [x, nx] of [[sc.x0, -1], [sc.x1, 1]]) {
        const F = frame([x, sc.z0], [0, 1], [nx, 0]);
        slab(a, F, [[0, sc.eave], [sc.z1 - sc.z0, sc.eave], [zc - sc.z0, sc.ridge]], 0, -0.8);
      }
    } else {
      const xc = (sc.x0 + sc.x1) / 2;
      for (const [z, nz] of [[sc.z0, -1], [sc.z1, 1]]) {
        const F = frame([sc.x0, z], [1, 0], [0, nz]);
        slab(a, F, [[0, sc.eave], [sc.x1 - sc.x0, sc.eave], [xc - sc.x0, sc.ridge]], 0, -0.8);
      }
    }
  }
  for (const [p, q, o] of [[[sc.x0, sc.z0], [sc.x1, sc.z0], [0, -1]], [[sc.x1, sc.z0], [sc.x1, sc.z1], [1, 0]], [[sc.x1, sc.z1], [sc.x0, sc.z1], [0, 1]], [[sc.x0, sc.z1], [sc.x0, sc.z0], [-1, 0]]]) {
    const gaps = [];
    if (o[1] === -1) gaps.push([sc.passage.x0 - sc.x0 - 0.05, sc.passage.x1 - sc.x0 + 0.05]);
    plinth(a, p, q, o, gaps);
  }
  const ps = sc.passage;
  // layout 的廊道從 culeeOuterZ 起算，但禮拜堂外牆在 chapelOuterZ，中間有縫 → 延伸到禮拜堂外牆
  const pz0 = Math.min(ps.z0, S.chapelOuterZ);
  if (pz0 < ps.z0) report.notes.push(`聖器室廊道 z0=${ps.z0} 與禮拜堂外牆 ${S.chapelOuterZ} 之間有縫，結構已延伸到 ${pz0}`);
  box(a, ps.x0, ps.x1, -GROUND_SINK, ps.height, pz0 - 0.5, ps.z1 + 0.2);
  plinth(a, [ps.x0, ps.z1], [ps.x0, pz0], [-1, 0]);
  plinth(a, [ps.x1, pz0], [ps.x1, ps.z1], [1, 0]);
  a.tone = 1.0;
}

function buildTransept(ctx, tf) {
  const { L, M, plinth } = ctx;
  const S = L.section, H = L.heights;
  const a = M.ashlar;
  const s = Math.sign(tf.z);
  const north = s < 0;
  const wo = S.vesselWallZ + S.wallThickness / 2;
  const p = tf.portal;
  const FT = p.splayDepth + 0.6;            // 立面牆厚（門洞斜面深度 + 0.6）
  const zIn = tf.z - s * FT;
  a.tone = north ? 0.95 : 1.02;

  // 袖廊東西側牆（從高牆外皮到立面內皮）
  for (const [x, nx] of [[tf.x0, -1], [tf.x1, 1]]) {
    const A = nx * s < 0 ? [[x, s * wo], [x, zIn]] : [[x, zIn], [x, s * wo]];
    wall(a, A[0], A[1], [nx, 0], -GROUND_SINK, H.wallTop, S.wallThickness);
  }

  // 立面牆（含山牆）
  const F = frame([tf.x0, tf.z], [1, 0], [0, s]);
  const Wd = tf.x1 - tf.x0;
  const cx = p.x - tf.x0;
  const outline = [[0, -GROUND_SINK], [Wd, -GROUND_SINK], [Wd, H.wallTop], [(tf.x0 + tf.x1) / 2 - tf.x0, tf.gableApex], [0, H.wallTop]];
  const holes = [];
  holes.push({ pts: archPts(cx, p.outerWidth, 0, p.outerApex, 16), depth: p.splayDepth, capShade: 0.8 });
  // 透光尖窗帶：在玫瑰窗寬度內平均排列
  const cv = tf.claireVoie;
  const rw = tf.rose.diameter;
  const pitch = rw / cv.lancets;
  for (let i = 0; i < cv.lancets; i++) {
    const uc = tf.rose.x - tf.x0 - rw / 2 + (i + 0.5) * pitch;
    holes.push({ pts: archPts(uc, pitch * 0.72, cv.yBottom, cv.yTop, 6), through: true, revealShade: 0.85 });
  }
  holes.push({ pts: circlePts(tf.rose.x - tf.x0, tf.rose.y, tf.rose.diameter / 2, 80), through: true, revealShade: 0.85 });
  holes.push({ pts: circlePts(tf.gableOculus.x - tf.x0, tf.gableOculus.y, tf.gableOculus.diameter / 2, 40), through: true, revealShade: 0.85 });
  // u 方向：frame u=[1,0]，法線 [0,s]；北側時從外看 u 往左，不影響
  slab(a, F, outline, 0, -FT, holes);
  const pc = p.x - tf.x0;
  plinth(a, [tf.x0, tf.z], [tf.x1, tf.z], [0, s], [[pc - p.outerWidth / 2 - 0.05, pc + p.outerWidth / 2 + 0.05]]);

  // 轉角小塔塔身：方柱到簷口，以上八角到 top
  for (const t of tf.cornerTurrets) {
    const h = t.size / 2;
    const sq = [[t.x - h, t.z - h], [t.x + h, t.z - h], [t.x + h, t.z + h], [t.x - h, t.z + h]];
    stackY(a, [{ y: -GROUND_SINK, foot: sq }, { y: H.wallTop, foot: sq }]);
    const oct = regularPoly(t.x, t.z, (h * 0.92) / Math.cos(Math.PI / 8), 8, Math.PI / 8);
    stackY(a, [{ y: H.wallTop - 0.01, foot: oct }, { y: t.top, foot: oct }]);
  }
  a.tone = 1.0;
}
