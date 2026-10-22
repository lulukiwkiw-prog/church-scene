// src/roofs/pinnacles.js — 哥德式小尖塔（石材與鉛皮共用的參數化原型）
// 原型以「底面中心 = 原點、+Y 往上、+Z 朝外（徑向）、X 沿牆」建立，
// 交給 InstancedMesh 或 Acc.addBuilt() 以矩陣擺放。
import * as THREE from 'three';
import { Acc, DEG, v3, box, octPrism, crocket, crocketRib, fleuron, gable } from './geom.js';

/**
 * 方形小尖塔：墩頂壓頂板 → 方形塔身（四面小山花、四角小尖）→ 八角捲葉尖錐 → 頂飾
 * w = 沿牆寬、d = 徑向深、H = 總高（從墩頂到尖端）
 */
export function squarePinnacle({ w, d, H, colors = false, color = 1, slab = true }) {
  const acc = new Acc({ colors }).setColor(color);
  const s = Math.min(w, d) * 0.62;
  const sl = slab ? Math.min(0.28, 0.05 * H) : 0;
  if (slab) {
    box(acc, 0, sl / 2, 0, w + 0.12, sl, d + 0.12);
    box(acc, 0, sl + 0.05, 0, w * 0.86, 0.1, d * 0.86);
  }
  const yb = sl + 0.34 * H;       // 塔身頂
  const yNeedleTop = H * 0.86;
  const fin = H - yNeedleTop;
  // 塔身
  box(acc, 0, (sl + yb) / 2, 0, s, yb - sl, s);
  // 塔身線腳
  box(acc, 0, yb - 0.02 * H, 0, s * 1.12, 0.04 * H, s * 1.12);
  // 四角小尖
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = sx * s * 0.5, cz = sz * s * 0.5, r = s * 0.11;
    box(acc, cx, (sl + yb + 0.04 * H) / 2, cz, r * 1.6, yb + 0.04 * H - sl, r * 1.6);
    const cone = new THREE.ConeGeometry(r * 1.1, 0.2 * H, 4);
    acc.add(cone, new THREE.Matrix4().makeRotationY(Math.PI / 4).setPosition(cx, yb + 0.04 * H + 0.1 * H, cz));
    crocket(acc, v3(cx, yb + 0.1 * H, cz), v3(sx, 0, sz), s * 0.16);
  }
  // 四面小山花
  for (let k = 0; k < 4; k++) {
    const a = k * 90 * DEG;
    const n = v3(Math.cos(a), 0, Math.sin(a));
    const base = v3(n.x * (s / 2 + 0.03), yb - 0.1 * H, n.z * (s / 2 + 0.03));
    gable(acc, base, n, { w: s * 0.92, h: 0.27 * H, thick: Math.max(0.05, s * 0.08), crockets: 2, crocketSize: s * 0.17, finial: s * 0.22 });
  }
  // 八角尖錐
  const rN = s * 0.47;
  octPrism(acc, 0, 0, rN, 0.03, yb, yNeedleTop);
  // 尖錐底部箍
  octPrism(acc, 0, 0, rN * 1.12, rN * 1.08, yb, yb + 0.03 * H);
  const ribN = Math.max(3, Math.round((yNeedleTop - yb) / Math.max(0.22, s * 0.28)));
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pa = v3(rN * ca, yb + 0.03 * H, rN * sa), pb = v3(0.03 * ca, yNeedleTop, 0.03 * sa);
    crocketRib(acc, pa, pb, ribN, s * 0.2, s * 0.09, () => v3(ca, 0.25, sa), (k % 2) * 0.5);
  }
  fleuron(acc, v3(0, yNeedleTop - 0.02 * H, 0), fin + 0.02 * H);
  return acc.build();
}

/**
 * 八角小塔頂（袖廊轉角小塔）：開放式八角燈籠（細柱、小山花、角尖）→ 高捲葉尖錐 → 頂飾
 * r = 外接圓半徑，H = 總高
 */
export function octTurretSpire({ r, H, colors = false, color = 1, coreColor = 0.35 }) {
  const acc = new Acc({ colors }).setColor(color);
  const ap = r * Math.cos(22.5 * DEG);
  // 底座線腳
  octPrism(acc, 0, 0, r * 1.12, r * 1.12, 0, 0.35);
  octPrism(acc, 0, 0, r * 1.02, r * 1.0, 0.35, 0.5);
  // 燈籠段
  const yL1 = 0.33 * H;
  if (colors) acc.setColor(coreColor);
  octPrism(acc, 0, 0, r * 0.62, r * 0.62, 0.5, yL1);
  acc.setColor(color);
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    const cx = r * 0.92 * Math.cos(a), cz = r * 0.92 * Math.sin(a);
    box(acc, cx, (0.5 + yL1) / 2, cz, r * 0.17, yL1 - 0.5, r * 0.17, -a);
    // 角尖
    const cone = new THREE.ConeGeometry(r * 0.12, 0.13 * H, 4);
    acc.add(cone, new THREE.Matrix4().makeRotationY(Math.PI / 4 - a).setPosition(cx, yL1 + 0.15 * H, cz));
    box(acc, cx, yL1 + 0.04 * H, cz, r * 0.15, 0.08 * H, r * 0.15, -a);
    crocket(acc, v3(cx, yL1 + 0.16 * H, cz), v3(Math.cos(a), 0, Math.sin(a)), r * 0.2);
  }
  // 燈籠頂的線腳
  octPrism(acc, 0, 0, r * 0.98, r * 0.98, yL1 - 0.08 * H * 0.5, yL1);
  // 八面小山花（每面一座，含尖拱開口的視覺）
  for (let k = 0; k < 8; k++) {
    const a = 45 * k * DEG;
    const n = v3(Math.cos(a), 0, Math.sin(a));
    const base = v3(n.x * (ap + 0.02), yL1 - 0.06 * H, n.z * (ap + 0.02));
    gable(acc, base, n, { w: 2 * r * Math.sin(22.5 * DEG) * 0.95, h: 0.15 * H, thick: 0.08, crockets: 2, crocketSize: r * 0.22, finial: r * 0.28 });
  }
  // 捲葉尖錐
  const y0 = yL1, y1 = H * 0.9;
  const rN = r * 0.8;
  octPrism(acc, 0, 0, rN, 0.04, y0, y1);
  for (const f of [0.3, 0.6]) {
    const yy = y0 + (y1 - y0) * f, rr = rN * (1 - f) + 0.04 * f;
    octPrism(acc, 0, 0, rr * 1.12, rr * 1.08, yy - 0.08, yy + 0.08);
  }
  const ribN = Math.max(5, Math.round((y1 - y0) / 0.55));
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    crocketRib(acc, v3(rN * ca, y0, rN * sa), v3(0.04 * ca, y1, 0.04 * sa), ribN, r * 0.32, r * 0.14, () => v3(ca, 0.25, sa), (k % 2) * 0.5);
  }
  fleuron(acc, v3(0, y1 - 0.05, 0), H - y1 + 0.05);
  return acc.build();
}

/** 樓梯小塔的圓錐頂（八角石錐，帶捲葉肋與頂飾） */
export function turretCone({ r, h, colors = false, color = 1 }) {
  const acc = new Acc({ colors }).setColor(color);
  octPrism(acc, 0, 0, r * 1.08, r * 1.12, -0.25, 0.08);
  const yTop = h * 0.86;
  octPrism(acc, 0, 0, r, 0.03, 0.08, yTop);
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    crocketRib(acc, v3(r * ca, 0.1, r * sa), v3(0.03 * ca, yTop, 0.03 * sa), 4, r * 0.24, r * 0.12, () => v3(ca, 0.3, sa), (k % 2) * 0.5);
  }
  fleuron(acc, v3(0, yTop - 0.03, 0), h - yTop + 0.03);
  return acc.build();
}
