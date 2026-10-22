// src/environment/gardens.js — 南側花園、若望二十三世廣場（鐵欄杆、哥德復興式噴泉）
import { groundPoly, groundRect, lathe, fbox, extrude, frame, box } from './geom.js';
import { railing } from './railing.js';
import { LAYER } from './ground.js';

/** 草坪塊：矩形，靠近 (cx, cz) 的那個角切成半徑 rad 的圓弧 */
function lawn(g, x0, x1, z0, z1, cx, cz, rad, y) {
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  let ci = 0, best = Infinity;
  corners.forEach(([x, z], i) => { const d = Math.hypot(x - cx, z - cz); if (d < best) { best = d; ci = i; } });
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const [x, z] = corners[i];
    if (i !== ci || best > rad * 1.5) { pts.push([x, z]); continue; }
    // 以 (cx, cz) 為圓心的弧，連接兩條鄰邊
    const prev = corners[(i + 3) % 4];
    // 鄰邊與圓的交點
    const hitX = [cx + Math.sign(x - cx) * Math.sqrt(Math.max(0, rad * rad - (z - cz) ** 2)), z];
    const hitZ = [x, cz + Math.sign(z - cz) * Math.sqrt(Math.max(0, rad * rad - (x - cx) ** 2))];
    const first = prev[1] === z ? hitX : hitZ, last = prev[1] === z ? hitZ : hitX;
    const t0 = Math.atan2(first[1] - cz, first[0] - cx), t1 = Math.atan2(last[1] - cz, last[0] - cx);
    let dt = t1 - t0;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    for (let k = 0; k <= 10; k++) { const t = t0 + (dt * k) / 10; pts.push([cx + rad * Math.cos(t), cz + rad * Math.sin(t)]); }
  }
  groundPoly(g, pts, [], y);
}

function fountain(B, ft) {
  const g = B.get('gardens', 'stoneCarved');
  const { x, z } = ft, R = ft.diameter / 2, H = ft.height;
  const ph = Math.PI / 8;
  // 八角水池
  lathe(g, x, 0, z, [[R, 0], [R, 0.5], [R + 0.08, 0.52], [R + 0.08, 0.6], [R - 0.38, 0.6], [R - 0.38, 0.3]], 8, ph);
  groundPoly(B.get('gardens', 'water'), Array.from({ length: 8 }, (_, i) => [x + (R - 0.38) * Math.cos(ph + (i * Math.PI) / 4), z + (R - 0.38) * Math.sin(ph + (i * Math.PI) / 4)]), [], 0.42);
  // 中央：基座、三層塔身、尖頂（比例依 height）
  const k = H / 4.5;
  lathe(g, x, 0, z, [
    [0.95 * k, 0.3], [0.95 * k, 0.75 * k], [0.8 * k, 0.85 * k], [0.62 * k, 0.95 * k], [0.62 * k, 2.3 * k], [0.78 * k, 2.4 * k], [0.78 * k, 2.52 * k],
    [0.45 * k, 2.6 * k], [0.42 * k, 3.25 * k], [0.52 * k, 3.33 * k], [0.52 * k, 3.42 * k], [0.32 * k, 3.45 * k], [0.04 * k, 4.3 * k], [0.06 * k, 4.32 * k], [0, 4.5 * k],
  ], 8, ph);
  // 八面山花＋扶壁小尖塔
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4; // 面中心方向（八角形相位 π/8 → 面法線在 0、π/4…）
    const ca = Math.cos(a), sa = Math.sin(a);
    const ap = 0.62 * k * Math.cos(Math.PI / 8);
    const f = frame([x + ca * ap, 0, z + sa * ap], [-sa, 0, ca], [0, 1, 0], [ca, 0, sa]);
    const hw = 0.62 * k * Math.sin(Math.PI / 8) * 0.9;
    extrude(g, f, [[-hw, 2.0 * k], [hw, 2.0 * k], [0, 2.75 * k]], 0, 0.06 * k);
    // 盲拱龕框
    fbox(g, f, -hw * 0.75, -hw * 0.6, 1.0 * k, 1.9 * k, 0, 0.05 * k);
    fbox(g, f, hw * 0.6, hw * 0.75, 1.0 * k, 1.9 * k, 0, 0.05 * k);
    // 角上的小尖塔
    const b = a + Math.PI / 8, rp = 0.78 * k;
    const px = x + Math.cos(b) * rp, pz = z + Math.sin(b) * rp;
    lathe(g, px, 0, pz, [[0.09 * k, 2.52 * k], [0.09 * k, 2.95 * k], [0.11 * k, 3.0 * k], [0, 3.45 * k]], 4, b);
    // 噴水口（獸頭小方塊）
    const sx = x + Math.cos(a) * 0.95 * k, sz = z + Math.sin(a) * 0.95 * k;
    box(g, sx - 0.08, sx + 0.08, 0.6 * k, 0.72 * k, sz - 0.08, sz + 0.08);
  }
}

export function buildGardens(B, L) {
  const S = L.surroundings;
  const sand = B.get('gardens', 'gardenSand'), grass = B.get('gardens', 'grass');
  const curb = B.get('gardens', 'stoneTrace');
  for (const gd of S.gardens) {
    groundRect(sand, gd.x0, gd.x1, gd.z0, gd.z1, LAYER.sand);
    if (gd.id === 'southGarden' || !gd.fountain) {
      // 樹列在中央步道上，兩側草坪
      const trees = gd.trees || [];
      const zt = trees.length ? trees.reduce((s, t) => s + t.z, 0) / trees.length : (gd.z0 + gd.z1) / 2;
      const pw = 1.6;
      const beds = [[gd.z0 + 0.6, zt - pw], [zt + pw, gd.z1 - 0.6]];
      const n = Math.max(1, Math.round((gd.x1 - gd.x0) / 24));
      const bw = (gd.x1 - gd.x0 - 1.2) / n;
      for (let i = 0; i < n; i++) {
        const x0 = gd.x0 + 0.6 + i * bw + 0.9, x1 = gd.x0 + 0.6 + (i + 1) * bw - 0.9;
        for (const [z0, z1] of beds) {
          if (z1 - z0 < 1) continue;
          groundRect(grass, x0, x1, z0, z1, LAYER.grass);
          // 低石緣
          box(curb, x0 - 0.08, x1 + 0.08, 0, LAYER.grass + 0.06, z0 - 0.08, z0, { b0: true });
          box(curb, x0 - 0.08, x1 + 0.08, 0, LAYER.grass + 0.06, z1, z1 + 0.08, { b0: true });
          box(curb, x0 - 0.08, x0, 0, LAYER.grass + 0.06, z0, z1, { b0: true });
          box(curb, x1, x1 + 0.08, 0, LAYER.grass + 0.06, z0, z1, { b0: true });
        }
      }
      // 低矮的鐵環欄（花園與廣場邊）
      railing(B.get('gardens', 'ironPainted'), [[gd.x0, gd.z0], [gd.x1, gd.z0]], { height: 0.55, spacing: 0.9, bar: 0.02, spear: false, post: 3, rails: [0.45] });
      continue;
    }
    // 若望二十三世廣場
    const ft = gd.fountain;
    const pw = 2.2, ring = ft.diameter / 2 + 4.5, edge = 2.5;
    const quads = [
      [gd.x0 + edge, ft.x - pw, gd.z0 + edge, ft.z - pw],
      [ft.x + pw, gd.x1 - edge, gd.z0 + edge, ft.z - pw],
      [gd.x0 + edge, ft.x - pw, ft.z + pw, gd.z1 - edge],
      [ft.x + pw, gd.x1 - edge, ft.z + pw, gd.z1 - edge],
    ];
    for (const [x0, x1, z0, z1] of quads) if (x1 - x0 > 2 && z1 - z0 > 2) lawn(grass, x0, x1, z0, z1, ft.x, ft.z, ring, LAYER.grass);
    fountain(B, ft);
    // 鐵欄杆（矛頭），四邊中央留門
    const X = gd.x1 - gd.x0, Z = gd.z1 - gd.z0, gw = 3.2;
    const gaps = [ft.x - gd.x0, X + (ft.z - gd.z0), X + Z + (gd.x1 - ft.x), 2 * X + Z + (gd.z1 - ft.z)].map((s) => [s - gw / 2, s + gw / 2]);
    railing(B.get('gardens', 'ironPainted'), [[gd.x0, gd.z0], [gd.x1, gd.z0], [gd.x1, gd.z1], [gd.x0, gd.z1], [gd.x0, gd.z0]], {
      height: gd.fence ? gd.fence.height : 2.0, spacing: 0.15, bar: 0.022, spear: true, post: 3.0, gaps,
      rails: [0.12, (gd.fence ? gd.fence.height : 2.0) - 0.3],
    });
    // 欄杆底的石座
    const sb = B.get('gardens', 'stoneTrace');
    box(sb, gd.x0 - 0.15, gd.x1 + 0.15, 0, 0.12, gd.z0 - 0.15, gd.z0 + 0.15, { b0: true });
    box(sb, gd.x0 - 0.15, gd.x1 + 0.15, 0, 0.12, gd.z1 - 0.15, gd.z1 + 0.15, { b0: true });
    box(sb, gd.x0 - 0.15, gd.x0 + 0.15, 0, 0.12, gd.z0 + 0.15, gd.z1 - 0.15, { b0: true });
    box(sb, gd.x1 - 0.15, gd.x1 + 0.15, 0, 0.12, gd.z0 + 0.15, gd.z1 - 0.15, { b0: true });
  }
}
