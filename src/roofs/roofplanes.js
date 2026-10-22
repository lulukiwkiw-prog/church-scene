// src/roofs/roofplanes.js — 所有鉛皮屋面：主屋頂（中殿、交叉部、袖廊、詩班席、後殿半錐）、
// 樓廊與側廊斜屋頂、交叉部旁低平台、塔頂低坡頂、聖器室屋頂、老虎窗、屋脊鉛飾與脊瓦
import * as THREE from 'three';
import { Acc, DEG, v3, beam, box, octPrism } from './geom.js';

const Y = v3(0, 1, 0);

export function buildRoofPlanes(L) {
  const C = L.cathedral;
  const R = C.roof;
  const lead = new Acc();                  // 主屋面（materials.leadRoof）
  const dark = new Acc({ colors: true });  // 鉛飾、脊瓦、老虎窗（深色鉛）
  const glass = new Acc();                 // 老虎窗開口（windowDark）

  const E = R.eave, Z = R.eaveZ, RG = R.ridge;
  const k = Math.tan(R.pitchDeg * DEG);
  const seg = Object.fromEntries(R.segments.map((s) => [s.id, s]));
  const cx = C.transept.crossing.cx;
  const xv0 = cx - Z, xv1 = cx + Z;        // 交叉部斜谷落在簷口的位置
  const nave = seg.nave, choir = seg.choir, apse = seg.apse;

  // ---------------- 主屋頂（中殿 + 交叉部 + 詩班席，屋脊沿 x） ----------------
  for (const s of [-1, 1]) {
    const up = v3(0, 1, s);
    lead.poly([v3(nave.x0, E, s * Z), v3(xv0, E, s * Z), v3(xv0, RG, 0), v3(nave.x0, RG, 0)], up);
    lead.poly([v3(xv0, E, s * Z), v3(cx, RG, 0), v3(xv0, RG, 0)], up);
    lead.poly([v3(xv1, E, s * Z), v3(xv1, RG, 0), v3(cx, RG, 0)], up);
    lead.poly([v3(xv1, E, s * Z), v3(choir.x1, E, s * Z), v3(choir.x1, RG, 0), v3(xv1, RG, 0)], up);
    // 簷口收邊（薄鉛板厚度）
    beam(dark.setColor(0.75), v3(nave.x0, E - 0.08, s * (Z + 0.04)), v3(xv0, E - 0.08, s * (Z + 0.04)), 0.12, 0.22);
    beam(dark, v3(xv1, E - 0.08, s * (Z + 0.04)), v3(choir.x1, E - 0.08, s * (Z + 0.04)), 0.12, 0.22);
  }
  // 中殿西端藏起來的山牆封板（在西立面中段 46 m 後面，略往內避免與結構共面）
  lead.poly([v3(nave.x0 + 0.3, E, -Z), v3(nave.x0 + 0.3, E, Z), v3(nave.x0 + 0.3, RG, 0)], v3(-1, 0, 0));

  // ---------------- 袖廊（屋脊沿 z） ----------------
  for (const id of ['northTransept', 'southTransept']) {
    const t = seg[id];
    const s = Math.sign(t.z0 + t.z1);
    const zf = Math.max(Math.abs(t.z0), Math.abs(t.z1)) * s;
    for (const [xe, dir] of [[xv0, -1], [xv1, 1]]) {
      lead.poly([v3(xe, E, s * Z), v3(xe, E, zf), v3(cx, RG, zf), v3(cx, RG, 0)], v3(dir, 1, 0));
      beam(dark.setColor(0.75), v3(xe + dir * 0.04, E - 0.08, s * Z), v3(xe + dir * 0.04, E - 0.08, zf), 0.12, 0.22);
    }
    lead.poly([v3(xv0, E, zf - s * 0.4), v3(xv1, E, zf - s * 0.4), v3(cx, RG, zf - s * 0.4)], v3(0, 0, s));
  }

  // ---------------- 後殿半十邊形錐頂 ----------------
  const apex = v3(apse.cx, RG, 0);
  const apseV = apse.vertexAnglesDeg.map((a) => v3(apse.cx + apse.radius * Math.cos(a * DEG), E, apse.radius * Math.sin(a * DEG)));
  for (let i = 0; i < apseV.length - 1; i++) {
    const m = (apse.vertexAnglesDeg[i] + apse.vertexAnglesDeg[i + 1]) / 2 * DEG;
    lead.poly([apseV[i], apseV[i + 1], apex], v3(Math.cos(m), 1, Math.sin(m)));
    const o = v3(Math.cos(m), 0, Math.sin(m)).multiplyScalar(0.04);
    beam(dark.setColor(0.75), apseV[i].clone().add(o).setY(E - 0.08), apseV[i + 1].clone().add(o).setY(E - 0.08), 0.12, 0.22);
  }

  // ---------------- 脊瓦（屋脊、袖廊屋脊、後殿戧脊） ----------------
  dark.setColor(0.62);
  const roll = (a, b, r = 0.11) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, 6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
    dark.add(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(1, 1, 1)));
    g.dispose();
  };
  roll(v3(nave.x0, RG + 0.05, 0), v3(apse.cx, RG + 0.05, 0));
  const tz = Math.max(Math.abs(seg.southTransept.z1), Math.abs(seg.southTransept.z0));
  roll(v3(cx, RG + 0.05, -tz), v3(cx, RG + 0.05, tz));
  for (const v of apseV.slice(1, -1)) roll(apex.clone().setY(RG + 0.05), v.clone().setY(E + 0.06));
  // 斜谷（交叉部四條）用細鉛條
  for (const [xe, s] of [[xv0, -1], [xv0, 1], [xv1, -1], [xv1, 1]]) roll(v3(cx, RG, 0), v3(xe, E + 0.03, s * Z), 0.06);
  // 後殿錐頂的小頂飾（照片：後殿屋頂頂端細長鉛尖）
  dark.setColor(0.5);
  octPrism(dark, apse.cx, 0, 0.35, 0.3, RG - 0.3, RG + 0.5);
  octPrism(dark, apse.cx, 0, 0.12, 0.03, RG + 0.5, RG + 3.2);
  dark.add(new THREE.OctahedronGeometry(0.2, 0), new THREE.Matrix4().setPosition(apse.cx, RG + 0.9, 0));

  // ---------------- 屋脊鏤空鉛飾（crête） ----------------
  // 避開尖塔腳下與銅像台座（交叉部中心 ± apostle 最遠距離 + 1）
  const reach = Math.max(...C.apostleGroups.flatMap((g) => g.statues.map((st) => Math.hypot(st.x - cx, st.z)))) + 1.2;
  crestLine(dark, v3(nave.x0 + 0.8, RG, 0), v3(cx - reach, RG, 0), R.crest.height);
  crestLine(dark, v3(cx + reach, RG, 0), v3(apse.cx - 0.6, RG, 0), R.crest.height);
  crestLine(dark, v3(cx, RG, -tz + 0.8), v3(cx, RG, -reach), R.crest.height);
  crestLine(dark, v3(cx, RG, reach), v3(cx, RG, tz - 0.8), R.crest.height);

  // ---------------- 老虎窗 ----------------
  for (const d of R.dormers) dormer(lead, dark, glass, d, { E, RG, k });

  // ---------------- 樓廊、側廊斜屋頂與低平台 ----------------
  const lr = R.lowRoofs;
  const terraces = C.windows.tribuneOculi.map((o) => {
    const inNave = C.nave.bayCenters.includes(o.x);
    const bl = inNave ? C.nave.bayLength : C.choir.bayLength;
    return { x0: o.x - bl / 2, x1: o.x + bl / 2, s: Math.sign(o.z), y: o.terraceY };
  });
  const runs = [[nave.x0, C.transept.crossing.x0], [C.transept.crossing.x1, choir.x1]];
  for (const s of [-1, 1]) {
    const ts = terraces.filter((t) => t.s === s);
    for (const [a, b] of runs) {
      // 樓廊：扣掉低平台的開間
      let pieces = [[a, b]];
      for (const t of ts) pieces = pieces.flatMap(([p, q]) => (t.x1 <= p || t.x0 >= q ? [[p, q]] : [[p, Math.min(q, t.x0)], [Math.max(p, t.x1), q]]).filter(([u, w]) => w - u > 0.01));
      for (const [p, q] of pieces) leanTo(lead, p, q, s, lr.tribune);
      // 側廊（整段）
      leanTo(lead, a, b, s, lr.aisle);
    }
    for (const t of ts) {
      const tr = lr.tribune;
      lead.poly([v3(t.x0, t.y, s * tr.zHigh), v3(t.x1, t.y, s * tr.zHigh), v3(t.x1, t.y, s * tr.zLow), v3(t.x0, t.y, s * tr.zLow)], Y);
      // 低平台兩端與樓廊斜屋頂交接的封板
      for (const [xe, dir] of [[t.x0, 1], [t.x1, -1]]) {
        const inside = (xe > nave.x0 + 0.1 && xe < C.transept.crossing.x0 - 0.1) || (xe > C.transept.crossing.x1 + 0.1 && xe < choir.x1 - 0.1);
        if (!inside) continue;
        lead.poly([v3(xe, t.y, s * tr.zLow), v3(xe, tr.yLow, s * tr.zLow), v3(xe, tr.yHigh, s * tr.zHigh), v3(xe, t.y, s * tr.zHigh)], v3(dir, 0, 0));
      }
      // 平台外緣的鉛皮收邊
      beam(dark.setColor(0.7), v3(t.x0, t.y + 0.06, s * (tr.zLow - 0.1)), v3(t.x1, t.y + 0.06, s * (tr.zLow - 0.1)), 0.2, 0.12);
    }
  }
  // 繞後殿一圈
  for (const r of [lr.tribune, lr.aisle]) {
    const ang = apse.vertexAnglesDeg;
    for (let i = 0; i < ang.length - 1; i++) {
      const P = (a, rad, y) => v3(apse.cx + rad * Math.cos(a * DEG), y, rad * Math.sin(a * DEG));
      const m = (ang[i] + ang[i + 1]) / 2 * DEG;
      lead.poly([P(ang[i], r.zLow, r.yLow), P(ang[i + 1], r.zLow, r.yLow), P(ang[i + 1], r.zHigh, r.yHigh), P(ang[i], r.zHigh, r.yHigh)], v3(Math.cos(m), 1, Math.sin(m)));
    }
  }

  // ---------------- 雙塔塔頂低坡頂 ----------------
  for (const t of C.westFront.towers) towerRoof(lead, dark, t, C.westFront.stairTurrets);

  // ---------------- 聖器室屋頂 + 廊道小屋頂 ----------------
  sacristyRoof(lead, C.sacristy);

  return { lead: lead.build(), dark: dark.build(), glass: glass.build() };
}

function leanTo(acc, x0, x1, s, r) {
  acc.poly([v3(x0, r.yLow, s * r.zLow), v3(x1, r.yLow, s * r.zLow), v3(x1, r.yHigh, s * r.zHigh), v3(x0, r.yHigh, s * r.zHigh)], v3(0, 1, s));
}

/** 屋脊鏤空鉛飾：上下橫條 + 每 0.5 m 一組花飾（細柱、菱形、小頂花） */
function crestLine(acc, a, b, h) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  if (len < 1) return;
  const dir = d.clone().normalize();
  const side = new THREE.Vector3().crossVectors(Y, dir).normalize();
  acc.setColor(0.55);
  beam(acc, a.clone().setY(a.y + 0.12), b.clone().setY(b.y + 0.12), 0.08, 0.1);
  beam(acc, a.clone().setY(a.y + h * 0.72), b.clone().setY(b.y + h * 0.72), 0.04, 0.04);
  const n = Math.floor(len / 0.5);
  const octa = new THREE.OctahedronGeometry(1, 0);
  for (let i = 0; i <= n; i++) {
    const p = a.clone().addScaledVector(dir, (i / n) * len);
    // 細柱
    box(acc, p.x, p.y + h * 0.45, p.z, 0.035, h * 0.7, 0.035);
    // 菱形鏤空花（扁平八面體，面朝側邊）
    const m = new THREE.Matrix4().makeBasis(dir.clone().multiplyScalar(0.16), Y.clone().multiplyScalar(0.18), side.clone().multiplyScalar(0.025));
    m.setPosition(p.x + dir.x * 0.25, p.y + h * 0.42, p.z + dir.z * 0.25);
    if (i < n) acc.add(octa, m);
    // 頂端小百合花
    const m2 = new THREE.Matrix4().makeBasis(dir.clone().multiplyScalar(0.07), Y.clone().multiplyScalar(0.14), side.clone().multiplyScalar(0.03));
    m2.setPosition(p.x, p.y + h * 0.88, p.z);
    acc.add(octa, m2);
  }
  octa.dispose();
}

/** 老虎窗：正面直立（含尖頂開口），兩坡小屋頂退入主屋面 */
function dormer(lead, dark, glass, d, { E, RG, k }) {
  const s = d.side;
  const zf = (RG - d.y) / k;              // 窗台高度處的屋面 |z|
  const w = d.width / 2, hWall = d.height * 0.62, hTop = d.height;
  const yW = d.y + hWall, yA = d.y + hTop;
  const zBackW = (RG - yW) / k;            // 牆頂高度的屋面位置
  const zBackA = (RG - yA) / k;
  const depthA = zf - zBackA;
  const P = (x, y, z) => v3(d.x + x, y, s * z);
  // 正面（含山牆）
  dark.setColor(0.8);
  dark.poly([P(-w, d.y, zf), P(w, d.y, zf), P(w, yW, zf), P(-w, yW, zf)], v3(0, 0, s));
  dark.poly([P(-w, yW, zf), P(w, yW, zf), P(0, yA, zf)], v3(0, 0, s));
  // 側頰
  for (const sx of [-1, 1]) dark.poly([P(sx * w, d.y, zf), P(sx * w, yW, zf), P(sx * w, yW, zBackW)], v3(sx, 0, 0));
  // 兩坡屋頂（略出挑）
  const o = 0.08;
  for (const sx of [-1, 1]) {
    lead.poly([P(0, yA + 0.03, zf + o), P(sx * (w + o), yW - 0.02, zf + o), P(sx * (w + o), yW - 0.02, zBackW - 0.3), P(0, yA + 0.03, zBackA - 0.3)], v3(sx, 1, 0));
  }
  // 尖頂開口
  const gw = w * 0.55;
  glass.poly([P(-gw, d.y + 0.15, zf + 0.02), P(gw, d.y + 0.15, zf + 0.02), P(gw, yW, zf + 0.02), P(0, yW + (yA - yW) * 0.6, zf + 0.02), P(-gw, yW, zf + 0.02)], v3(0, 0, s));
  // 頂端小尖
  octPrism(dark.setColor(0.6), d.x, s * (zf + 0.02), 0.04, 0.01, yA, yA + 0.35, 4, 45);
  void depthA; void E;
}

/** 塔頂低坡頂：去角的矩形（避開樓梯小塔）→ 低坡到小平頂 */
function towerRoof(lead, dark, t, turrets) {
  const y0 = t.terrace.y, rise = t.terrace.roof.rise;
  // 鐘樓牆體：西、南、北三面退 1.5 m（CONTRACT：大迴廊牆面退到 x = 1.5），再留 0.9 m 平台走道
  const rec = 1.5, walk = 0.9;
  const x0 = t.x0 + rec + walk, x1 = t.x1 - walk, z0 = t.z0 + rec + walk, z1 = t.z1 - rec - walk;
  const ch = Math.min(x1 - x0, z1 - z0) * 0.24;
  const ring = [
    [x0 + ch, z0], [x1 - ch, z0], [x1, z0 + ch], [x1, z1 - ch], [x1 - ch, z1], [x0 + ch, z1], [x0, z1 - ch], [x0, z0 + ch],
  ];
  const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
  const top = ring.map(([x, z]) => [cxm + (x - cxm) * 0.12, czm + (z - czm) * 0.12]);
  const curb = 0.3;
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    const mx = (ax + bx) / 2 - cxm, mz = (az + bz) / 2 - czm;
    // 直立收邊
    lead.poly([v3(ax, y0, az), v3(bx, y0, bz), v3(bx, y0 + curb, bz), v3(ax, y0 + curb, az)], v3(mx, 0, mz));
    // 斜面
    lead.poly([v3(ax, y0 + curb, az), v3(bx, y0 + curb, bz), v3(top[j][0], y0 + rise, top[j][1]), v3(top[i][0], y0 + rise, top[i][1])], v3(mx, 2, mz));
    // 戧脊
    beam(dark.setColor(0.65), v3(ax, y0 + curb + 0.04, az), v3(top[i][0], y0 + rise + 0.04, top[i][1]), 0.1, 0.08);
  }
  lead.poly(top.map(([x, z]) => v3(x, y0 + rise, z)), Y);
  void turrets;
}

/** 聖器室：雙坡頂（屋脊沿 x，兩端山牆由結構模組做），以及連接詩班席的廊道小雙坡頂 */
function sacristyRoof(lead, S) {
  const zc = (S.z0 + S.z1) / 2;
  const E = S.eave, RG = S.ridge, o = 0.25; // 兩端略出挑蓋住山牆
  lead.poly([v3(S.x0 - o, E, S.z1), v3(S.x1 + o, E, S.z1), v3(S.x1 + o, RG, zc), v3(S.x0 - o, RG, zc)], v3(0, 1, 1));
  lead.poly([v3(S.x0 - o, E, S.z0), v3(S.x1 + o, E, S.z0), v3(S.x1 + o, RG, zc), v3(S.x0 - o, RG, zc)], v3(0, 1, -1));
  const p = S.passage, pc = (p.x0 + p.x1) / 2, pr = p.height + (p.x1 - p.x0) * 0.4;
  for (const [xe, dir] of [[p.x0, -1], [p.x1, 1]]) {
    lead.poly([v3(xe - dir * 0, p.height, p.z0), v3(xe, p.height, p.z1), v3(pc, pr, p.z1), v3(pc, pr, p.z0)], v3(dir, 1, 0));
  }
  lead.poly([v3(p.x0, p.height, p.z0), v3(p.x1, p.height, p.z0), v3(pc, pr, p.z0)], v3(0, 0, -1));
}
