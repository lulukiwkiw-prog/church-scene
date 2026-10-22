// src/roofs.js — 3 號分身：屋頂與尖頂（見 CONTRACT.md）
// 鉛皮屋面、屋脊鉛飾、老虎窗、尖塔（含十字與銅公雞）、16 尊銅像台座、
// 所有石造小尖塔（扶壁墩、中間柱、袖廊轉角小塔、塔角扶壁）、樓梯小塔圓錐頂。
import * as THREE from 'three';
import { buildRoofPlanes } from './roofs/roofplanes.js';
import { buildSpire, buildPedestals } from './roofs/spire.js';
import { squarePinnacle, octTurretSpire, turretCone } from './roofs/pinnacles.js';
import { DEG } from './roofs/geom.js';

function mesh(name, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function instanced(name, geo, mat, placements) {
  const im = new THREE.InstancedMesh(geo, mat, placements.length);
  im.name = name;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  placements.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rotY || 0);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
    im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** 原型的 +Z 朝外：南側 0、北側 π、後殿依放射角 */
const outward = (p) => (p.rotationDeg !== undefined ? (90 - p.rotationDeg) * DEG : p.z >= 0 ? 0 : Math.PI);

export function build({ layout, materials, variant, rng }) {
  void rng; // 本模組沒有隨機成分（全部規則重複件）
  const group = new THREE.Group();
  group.name = 'roofs';
  const C = layout.cathedral;
  const leadDark = variant('leadRoof', { vertexColors: true });
  const stone = materials.stoneCarved;

  // ---------------- 屋面 ----------------
  const planes = buildRoofPlanes(layout);
  group.add(mesh('roofs/lead', planes.lead, materials.leadRoof));
  group.add(mesh('roofs/leadwork', planes.dark, leadDark));
  if (planes.glass) group.add(mesh('roofs/dormerOpenings', planes.glass, materials.windowDark));

  // ---------------- 尖塔 ----------------
  const sp = buildSpire(layout);
  group.add(mesh('roofs/spire', sp.spire, leadDark));
  group.add(mesh('roofs/spireRooster', sp.rooster, materials.bronzePolished));
  group.add(mesh('roofs/apostlePedestals', buildPedestals(layout), leadDark));

  // ---------------- 石造小尖塔（InstancedMesh） ----------------
  // 扶壁墩（culée）：依尺寸分組（目前全部相同，仍以尺寸為鍵以防 layout 改動）
  const byKey = new Map();
  for (const p of C.buttressPiers) {
    const key = `${p.width}|${p.depth}|${p.pinnacleTip - p.top}`;
    if (!byKey.has(key)) byKey.set(key, { w: p.width, d: p.depth, H: p.pinnacleTip - p.top, list: [] });
    byKey.get(key).list.push({ x: p.x, y: p.top, z: p.z, rotY: outward(p) });
  }
  let gi = 0;
  for (const g of byKey.values()) group.add(instanced(`roofs/culeePinnacles${gi++}`, squarePinnacle(g), stone, g.list));

  const palee = new Map();
  for (const p of C.paleePiers) {
    const key = `${p.width}|${p.depth}|${p.pinnacleTip - p.top}`;
    if (!palee.has(key)) palee.set(key, { w: p.width, d: p.depth, H: p.pinnacleTip - p.top, list: [] });
    palee.get(key).list.push({ x: p.x, y: p.top, z: p.z, rotY: outward(p) });
  }
  gi = 0;
  for (const g of palee.values()) group.add(instanced(`roofs/paleePinnacles${gi++}`, squarePinnacle(g), stone, g.list));

  // 袖廊轉角小塔頂（到 52 m）
  const turrets = C.transept.facades.flatMap((f) => f.cornerTurrets);
  const t0 = turrets[0];
  group.add(instanced('roofs/transeptTurretSpires', octTurretSpire({ r: t0.size * 0.52, H: t0.pinnacleTip - t0.top }), stone,
    turrets.map((t) => ({ x: t.x, y: t.top, z: t.z, rotY: t.z >= 0 ? 0 : Math.PI }))));

  // 塔角扶壁頂小尖塔：每座塔四角（樓梯小塔所在的角由小塔取代）
  const stairs = C.westFront.stairTurrets;
  const cornerList = [];
  let cb = null;
  // 位置與結構模組一致：鐘樓牆角（西、南、北退 1.5 m）往外推 0.3 m，夾在塔平面內
  const REC = 1.5, PUSH = 0.3;
  for (const t of C.westFront.towers) {
    cb = t.cornerButtresses;
    const h = cb.size / 2;
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    for (const [cx, sx] of [[t.x0 + REC, -1], [t.x1, 1]]) {
      for (const [cz, sz] of [[t.z0 + REC, -1], [t.z1 - REC, 1]]) {
        const x = clamp(cx + sx * PUSH, t.x0 + h, t.x1 - h), z = clamp(cz + sz * PUSH, t.z0 + h, t.z1 - h);
        if (stairs.some((s) => s.tower === t.id && Math.hypot(s.x - x, s.z - z) < s.radius + h)) continue;
        cornerList.push({ x, y: cb.top, z, rotY: Math.atan2(sx, sz) });
      }
    }
  }
  if (cb) group.add(instanced('roofs/towerCornerPinnacles', squarePinnacle({ w: cb.size - 0.3, d: cb.size - 0.3, H: cb.pinnacleTip - cb.top }), stone, cornerList));

  // 樓梯小塔圓錐頂
  const s0 = stairs[0];
  group.add(instanced('roofs/stairTurretCones', turretCone({ r: s0.radius, h: s0.coneTip - s0.top }), stone,
    stairs.map((s) => ({ x: s.x, y: s.top, z: s.z }))));

  return group;
}
