// src/roofs/spire.js — 維奧萊-勒-杜克的哥德復興尖塔（八角、鉛包橡木）＋ 16 尊銅像的階梯台座
import * as THREE from 'three';
import { Acc, DEG, v3, beam, box, octPrism, crocket, crocketRib, fleuron, gable, lancetPath, extrudeOnPlane, T } from './geom.js';
import { squarePinnacle } from './pinnacles.js';

const Y = v3(0, 1, 0);
const LEAD = 0.34;     // 尖塔鉛皮的頂點色（照片：比屋面深的灰黑）
const CORE = 0.06;     // 開口後方的陰暗核心

/**
 * 一層八角開放段：核心、角柱（頂端小尖塔）、每面有尖拱雙窗的屏板、三角山花
 */
function openStage(acc, c, o) {
  const { R, y0, y1, coreR, post, panelTop, lancet, gableH, gableW, pinH, oculus } = o;
  const ap = R * Math.cos(22.5 * DEG);
  const edge = 2 * R * Math.sin(22.5 * DEG);
  // 核心
  acc.setColor(CORE);
  octPrism(acc, c.x, c.z, coreR, coreR, y0, y1);
  acc.setColor(LEAD);
  // 屏板（每面一片，挖兩扇尖拱窗 + 上方小圓窗）
  const pw = edge - post * 0.9;
  for (let k = 0; k < 8; k++) {
    const a = 45 * k * DEG;
    const n = v3(Math.cos(a), 0, Math.sin(a));
    const s = new THREE.Shape();
    const ph = panelTop - y0;
    s.moveTo(-pw / 2, 0); s.lineTo(pw / 2, 0); s.lineTo(pw / 2, ph); s.lineTo(-pw / 2, ph); s.lineTo(-pw / 2, 0);
    const lw = lancet.w, gap = (pw - 2 * lw) / 3;
    for (const sx of [-1, 1]) {
      const cxl = sx * (gap / 2 + lw / 2);
      s.holes.push(new THREE.Path(lancetPath(cxl, lw, lancet.sill - y0, lancet.spring - y0, lancet.apex - y0)));
    }
    if (oculus) {
      const hp = new THREE.Path();
      hp.absarc(0, oculus.y - y0, oculus.r, 0, Math.PI * 2, true);
      s.holes.push(hp);
    }
    extrudeOnPlane(acc, s, v3(c.x + n.x * (ap - 0.05), y0, c.z + n.z * (ap - 0.05)), n, 0.16);
    // 窗中柱前的細柱
    const t = v3(-n.z, 0, n.x);
    for (const u of [-(pw / 2 - gap / 2), 0, pw / 2 - gap / 2]) {
      const p = v3(c.x + n.x * (ap + 0.02) + t.x * u, 0, c.z + n.z * (ap + 0.02) + t.z * u);
      octPrism(acc, p.x, p.z, 0.06, 0.06, lancet.sill, lancet.spring + 0.1, 6, 0);
    }
    // 窗台線腳
    box(acc, c.x + n.x * (ap + 0.03), lancet.sill - 0.08, c.z + n.z * (ap + 0.03), 0.16, 0.16, pw, -a);
    // 三角山花（在屏板前面）
    acc.setColor(LEAD * 1.3);
    gable(acc, v3(c.x + n.x * (ap + 0.12), panelTop - 0.35, c.z + n.z * (ap + 0.12)), n, {
      w: gableW, h: gableH, thick: 0.16, hole: gableW * 0.16, crockets: 4, crocketSize: 0.36 * gableW / 2.6, finial: 0.55 * gableW / 2.6,
    });
    acc.setColor(LEAD);
  }
  // 角柱 + 小尖塔
  const pin = squarePinnacle({ w: post * 1.05, d: post * 1.05, H: pinH, colors: true, color: LEAD, slab: false });
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    const r = R - post * 0.35;
    const px = c.x + r * Math.cos(a), pz = c.z + r * Math.sin(a);
    box(acc, px, (y0 + panelTop) / 2, pz, post, panelTop - y0, post, -a);
    // 角柱上的扶壁退縮
    box(acc, px + 0.1 * Math.cos(a), y0 + (panelTop - y0) * 0.25, pz + 0.1 * Math.sin(a), post * 1.15, (panelTop - y0) * 0.5, post * 0.9, -a);
    acc.addBuilt(pin, T(px, panelTop, pz, Math.PI / 2 - a));
  }
  return pin;
}

export function buildSpire(L) {
  const C = L.cathedral, S = C.spire, RG = C.roof.ridge;
  const k = Math.tan(C.roof.pitchDeg * DEG);
  const c = v3(S.x, 0, S.z);
  const st = Object.fromEntries(S.stages.map((s) => [s.id, s]));
  const acc = new Acc({ colors: true }).setColor(LEAD);

  // ---------------- 底座（延伸進屋頂內，讓八角座落在四坡交會處） ----------------
  const b = st.base, ln = st.lantern, nd = st.needle, cr = st.cross, ro = st.rooster;
  const plinthBottom = RG - b.radius * 1.05 * k - 0.5;
  octPrism(acc, c.x, c.z, b.radius * 1.03, b.radius * 1.03, plinthBottom, b.y0 + 0.9);
  octPrism(acc, c.x, c.z, b.radius * 1.1, b.radius * 1.06, b.y0 + 0.9, b.y0 + 1.25);   // 底座線腳
  octPrism(acc, c.x, c.z, b.radius * 1.0, b.radius * 1.0, b.y0 + 1.25, b.y0 + 1.45);
  // 底座下段的盲拱板（八面）
  for (let i = 0; i < 8; i++) {
    const a = 45 * i * DEG;
    const ap = b.radius * 1.03 * Math.cos(22.5 * DEG);
    for (const u of [-0.9, 0, 0.9]) {
      const t = v3(-Math.sin(a), 0, Math.cos(a));
      octPrism(acc, c.x + Math.cos(a) * (ap + 0.03) + t.x * u, c.z + Math.sin(a) * (ap + 0.03) + t.z * u, 0.05, 0.05, RG - 2.5, b.y0 + 0.9, 4, 45);
    }
  }

  // ---------------- 第一段：底座開放段（8 開口、8 山花、角柱小尖塔） ----------------
  const y0 = b.y0 + 1.45;
  openStage(acc, c, {
    R: b.radius * 0.97, y0, y1: b.y1, coreR: b.radius * 0.72, post: 0.5,
    panelTop: b.y1 - 2.2,
    lancet: { w: 0.95, sill: y0 + 0.6, spring: b.y1 - 4.7, apex: b.y1 - 3.5 },
    oculus: { y: b.y1 - 3.0, r: 0.28 },
    gableW: 2.55, gableH: 4.3, pinH: 5.6,
  });
  // 第一段頂的平台與欄杆
  octPrism(acc, c.x, c.z, b.radius * 0.86, b.radius * 0.86, b.y1 - 0.4, b.y1 + 0.1);
  railing(acc, c, b.radius * 0.84, b.y1 + 0.1, 0.9);

  // ---------------- 四座大角尖塔（貼在八角底座的斜向四面，腳落在交叉部斜谷上） ----------------
  const bigPin = squarePinnacle({ w: 1.1, d: 1.1, H: 6.5, colors: true, color: LEAD });
  for (let i = 0; i < 4; i++) {
    const a = (45 + 90 * i) * DEG;
    const d = b.radius * 1.12;
    const px = c.x + d * Math.cos(a), pz = c.z + d * Math.sin(a);
    const roofY = RG - Math.min(Math.abs(px - c.x), Math.abs(pz - c.z)) * k;
    const top = b.y0 + 5.5;
    box(acc, px, (roofY - 0.5 + top) / 2, pz, 0.95, top - roofY + 0.5, 0.95, -a);
    box(acc, px, roofY + 0.6, pz, 1.25, 1.2, 1.25, -a);
    // 盲拱小山花
    for (let j = 0; j < 4; j++) {
      const aa = a + j * 90 * DEG;
      const n = v3(Math.cos(aa), 0, Math.sin(aa));
      gable(acc, v3(px + n.x * 0.5, top - 1.6, pz + n.z * 0.5), n, { w: 0.85, h: 1.1, thick: 0.08, crockets: 2, crocketSize: 0.18, finial: 0.25 });
    }
    acc.addBuilt(bigPin, T(px, top, pz, Math.PI / 2 - a));
  }

  // ---------------- 第二段：燈籠段 ----------------
  openStage(acc, c, {
    R: ln.radius, y0: ln.y0 + 0.1, y1: ln.y1, coreR: ln.radius * 0.7, post: 0.38,
    panelTop: ln.y1 - 3.3,
    lancet: { w: 0.74, sill: ln.y0 + 1.6, spring: ln.y1 - 6.0, apex: ln.y1 - 4.75 },
    oculus: { y: ln.y1 - 4.05, r: 0.22 },
    gableW: 2.0, gableH: 3.8, pinH: 4.8,
  });
  octPrism(acc, c.x, c.z, ln.radius * 0.92, ln.radius * 0.9, ln.y1 - 0.5, ln.y1);
  octPrism(acc, c.x, c.z, ln.radius * 0.98, ln.radius * 0.95, ln.y1, ln.y1 + 0.35);

  // ---------------- 第三段：捲葉尖錐 ----------------
  const nr0 = nd.radiusBottom, nr1 = nd.radiusTop;
  octPrism(acc, c.x, c.z, nr0, nr1, nd.y0 + 0.35, nd.y1);
  const rAt = (y) => nr0 + (nr1 - nr0) * ((y - nd.y0 - 0.35) / (nd.y1 - nd.y0 - 0.35));
  // 腰箍
  for (const f of [0.14, 0.32, 0.5, 0.66, 0.8, 0.9]) {
    const yy = nd.y0 + (nd.y1 - nd.y0) * f, rr = rAt(yy);
    octPrism(acc, c.x, c.z, rr * 1.06 + 0.06, rr * 1.06 + 0.04, yy - 0.12, yy + 0.12);
    // 腰箍上的小三角齒飾
    for (let i = 0; i < 8; i++) {
      const a = 45 * i * DEG;
      const ap = (rr * 1.06 + 0.05) * Math.cos(22.5 * DEG);
      const cone = new THREE.ConeGeometry(0.06 + rr * 0.05, 0.3 + rr * 0.15, 4);
      acc.add(cone, T(c.x + ap * Math.cos(a), yy + 0.25, c.z + ap * Math.sin(a), Math.PI / 4));
      cone.dispose();
    }
  }
  // 肋與捲葉（8 條）
  const ribN = 22;
  for (let i = 0; i < 8; i++) {
    const a = (22.5 + 45 * i) * DEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pa = v3(c.x + (nr0 + 0.04) * ca, nd.y0 + 0.4, c.z + (nr0 + 0.04) * sa);
    const pb = v3(c.x + (nr1 + 0.02) * ca, nd.y1 - 0.2, c.z + (nr1 + 0.02) * sa);
    beam(acc, pa, pb, 0.13, 0.13, v3(ca, 0, sa));
    crocketRib(acc, pa, pb, ribN, 1.05, 0.35, () => v3(ca, 0.2, sa), (i % 2) * 0.5);
  }
  // 尖錐腳下的小老虎窗（8 面）與上方 4 面的更小一層
  for (const [yy, hgt, wid, faces] of [[nd.y0 + 1.2, 2.2, 1.15, [0, 1, 2, 3, 4, 5, 6, 7]], [nd.y0 + 8.8, 1.5, 0.7, [0, 2, 4, 6]], [nd.y0 + 14.5, 1.1, 0.45, [1, 3, 5, 7]]]) {
    const rr = rAt(yy + hgt * 0.3);
    for (const i of faces) {
      const a = 45 * i * DEG;
      const n = v3(Math.cos(a), 0, Math.sin(a));
      const ap = rr * Math.cos(22.5 * DEG);
      const base = v3(c.x + n.x * (ap + 0.12), yy, c.z + n.z * (ap + 0.12));
      // 開口（深色）
      acc.setColor(CORE);
      const s = new THREE.Shape();
      const pts = lancetPath(0, wid * 0.5, 0, hgt * 0.45, hgt * 0.75);
      s.setFromPoints(pts);
      extrudeOnPlane(acc, s, base.clone().addScaledVector(n, -0.04), n, 0.06);
      acc.setColor(LEAD);
      // 側框
      const t = v3(-n.z, 0, n.x);
      for (const sx of [-1, 1]) box(acc, base.x + t.x * sx * wid * 0.36, yy + hgt * 0.25, base.z + t.z * sx * wid * 0.36, 0.1, hgt * 0.5, 0.1, -a);
      gable(acc, base.clone().setY(yy + hgt * 0.42), n, { w: wid, h: hgt * 0.62, thick: 0.1, crockets: 2, crocketSize: wid * 0.2, finial: wid * 0.3 });
    }
  }

  // ---------------- 頂端：球節、十字、銅公雞 ----------------
  acc.setColor(LEAD);
  const knob = new THREE.SphereGeometry(0.32, 8, 6);
  acc.add(knob, T(c.x, nd.y1 + 0.05, c.z), { keepNormals: true });
  knob.dispose();
  octPrism(acc, c.x, c.z, 0.38, 0.38, nd.y1 - 0.35, nd.y1 - 0.2);
  for (let i = 0; i < 4; i++) {
    const a = (45 + 90 * i) * DEG;
    crocket(acc, v3(c.x + 0.2 * Math.cos(a), nd.y1 - 0.25, c.z + 0.2 * Math.sin(a)), v3(Math.cos(a), 0.2, Math.sin(a)), 0.45);
  }
  // 十字：豎桿沿 y，橫臂沿 z（面向南北兩側都看得到）
  const cw = cr.width, ch = cr.y1 - cr.y0;
  acc.setColor(0.42);
  box(acc, c.x, (cr.y0 + cr.y1) / 2, c.z, 0.12, ch, 0.12);
  const armY = cr.y0 + ch * 0.68;
  box(acc, c.x, armY, c.z, 0.12, 0.12, cw);
  // 十字三端的三葉飾
  const oct = new THREE.OctahedronGeometry(0.075, 0);
  for (const [py, pz, dy, dz] of [[armY, cw / 2, 0, 1], [armY, -cw / 2, 0, -1], [cr.y1, 0, 1, 0]]) {
    acc.add(oct, T(c.x, py + dy * 0.05, c.z + pz + dz * 0.05));
    acc.add(oct, T(c.x, py + dy * 0.02 + (dz ? 0.08 : 0), c.z + pz + (dz ? dz * 0.0 : 0.08)));
    acc.add(oct, T(c.x, py + dy * 0.02 - (dz ? 0.08 : 0), c.z + pz - (dz ? 0 : 0.08)));
  }
  // 十字交點的光環
  const ring = new THREE.TorusGeometry(0.26, 0.03, 4, 12);
  acc.add(ring, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(c.x, armY, c.z));
  ring.dispose();
  const spire = acc.build();

  // 銅公雞
  const rooster = buildRooster(c.x, ro.y0, c.z, ro.y1 - ro.y0);
  return { spire, rooster };
}

/** 欄杆圈：八邊、扶手 + 小柱 */
function railing(acc, c, r, y, h) {
  for (let i = 0; i < 8; i++) {
    const a0 = (22.5 + 45 * i) * DEG, a1 = (22.5 + 45 * (i + 1)) * DEG;
    const p0 = v3(c.x + r * Math.cos(a0), y, c.z + r * Math.sin(a0));
    const p1 = v3(c.x + r * Math.cos(a1), y, c.z + r * Math.sin(a1));
    beam(acc, p0.clone().setY(y + h), p1.clone().setY(y + h), 0.1, 0.08);
    beam(acc, p0.clone().setY(y + 0.1), p1.clone().setY(y + 0.1), 0.12, 0.12);
    const n = 6;
    for (let j = 0; j < n; j++) {
      const p = p0.clone().lerp(p1, (j + 0.5) / n);
      box(acc, p.x, y + h / 2, p.z, 0.05, h, 0.05);
    }
  }
}

/** 銅公雞（風向標）：桿、身體、尾羽、頭冠 */
function buildRooster(x, y0, z, h) {
  const acc = new Acc();
  octPrism(acc, x, z, 0.025, 0.025, y0 - 0.05, y0 + h * 0.3, 6, 0);
  const s = h; // 約 0.6 m
  const sph = new THREE.SphereGeometry(1, 10, 8);
  // 身體（沿 x 的橢球）
  acc.add(sph, T(x, y0 + s * 0.45, z, 0, s * 0.26, s * 0.17, s * 0.1), { keepNormals: true });
  // 胸頸
  acc.add(sph, new THREE.Matrix4().compose(v3(x + s * 0.2, y0 + s * 0.62, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.6)), v3(s * 0.08, s * 0.16, s * 0.07)), { keepNormals: true });
  // 頭
  acc.add(sph, T(x + s * 0.25, y0 + s * 0.8, z, 0, s * 0.07, s * 0.07, s * 0.055), { keepNormals: true });
  // 喙
  const beak = new THREE.ConeGeometry(s * 0.025, s * 0.08, 4);
  acc.add(beak, new THREE.Matrix4().compose(v3(x + s * 0.34, y0 + s * 0.79, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), v3(1, 1, 1)));
  // 冠
  for (let i = 0; i < 3; i++) acc.add(new THREE.OctahedronGeometry(1, 0), T(x + s * (0.2 + i * 0.035), y0 + s * (0.88 + (i === 1 ? 0.03 : 0)), z, 0, s * 0.025, s * 0.045, s * 0.015));
  // 尾羽：三片扇形
  for (let i = 0; i < 4; i++) {
    const ang = 0.5 + i * 0.32;
    acc.add(new THREE.OctahedronGeometry(1, 0), new THREE.Matrix4().compose(
      v3(x - s * 0.24 - Math.cos(ang) * s * 0.12, y0 + s * 0.5 + Math.sin(ang) * s * 0.16, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)), v3(s * 0.2, s * 0.05, s * 0.025)));
  }
  // 腳
  for (const dz of [-0.03, 0.03]) octPrism(acc, x + s * 0.02, z + dz * s, 0.012, 0.012, y0 + s * 0.15, y0 + s * 0.35, 4, 45);
  sph.dispose(); beak.dispose();
  return acc.build();
}

/** 16 尊銅像的階梯台座：沿四條屋脊往下、每尊一階 */
export function buildPedestals(L) {
  const C = L.cathedral, RG = C.roof.ridge, cx = C.transept.crossing.cx;
  const k = Math.tan(C.roof.pitchDeg * DEG);
  const acc = new Acc({ colors: true }).setColor(0.58);
  for (const g of C.apostleGroups) {
    const sts = g.statues;
    for (let i = 0; i < sts.length; i++) {
      const s = sts[i];
      const along = s.z === 0 ? v3(Math.sign(s.x - cx), 0, 0) : v3(0, 0, Math.sign(s.z));
      const across = v3(along.z, 0, along.x);
      const d = Math.hypot(s.x - cx, s.z);
      const step = i + 1 < sts.length ? Math.hypot(sts[i + 1].x - s.x, sts[i + 1].z - s.z) : 2.0;
      const prev = i > 0 ? Math.hypot(sts[i - 1].x - s.x, sts[i - 1].z - s.z) : 2.0;
      const a0 = d - prev / 2, a1 = d + step / 2;
      const len = a1 - a0, mid = (a0 + a1) / 2;
      const wid = 1.3;
      const bottom = RG - (wid / 2) * k - 0.3;
      const pc = v3(cx, 0, 0).addScaledVector(along, mid);
      const rot = along.x !== 0 ? 0 : Math.PI / 2;
      acc.setColor(0.58);
      box(acc, pc.x, (bottom + s.y - 0.15) / 2, pc.z, len, s.y - 0.15 - bottom, wid, rot);
      // 壓頂板（出挑）
      acc.setColor(0.66);
      box(acc, pc.x, s.y - 0.075, pc.z, len + 0.12, 0.15, wid + 0.14, rot);
      // 雕像正下方的小方座
      acc.setColor(0.62);
      box(acc, s.x, s.y - 0.2, s.z, 0.9, 0.12, 0.9, rot);
      // 立面的盲拱線條（兩側）
      for (const sd of [-1, 1]) {
        const p = pc.clone().addScaledVector(across, sd * (wid / 2 + 0.02));
        box(acc, p.x, s.y - 0.45, p.z, along.x !== 0 ? len : 0.05, 0.08, along.x !== 0 ? 0.05 : len);
      }
    }
  }
  return acc.build();
}
