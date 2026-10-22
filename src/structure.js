// src/structure.js — 第 1 號：結構（所有石造量體與牆上洞口）
// -----------------------------------------------------------------------------
// 全部幾何依材質合併成少數幾個 Mesh（非索引、平面法線、公尺 UV、頂點色明暗）。
//   stoneAshlar*    主體牆、雙塔、立面扶壁、扶壁墩下段、袖廊、聖器室
//   stoneWeathered* 飛扶壁、扶壁墩上段、中間柱、北側樓廊外牆
//   windowDark      西玫瑰窗與塔窗洞底（暗色室內）
// 洞口裡面的東西（玻璃、窗花、門扇、拱圈線腳）歸立面模組。
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { MeshBuilder, frame, slab } from './structure/geom.js';
import { buildWestFront } from './structure/westfront.js';
import { buildBody } from './structure/body.js';
import { buildButtresses } from './structure/buttresses.js';

/** 大迴廊層（y 38–46）牆面退縮量：x = 1.5（CONTRACT 指定，layout 未列） */
const GALLERY_RECESS_X = 1.5;

export function build({ layout, materials, variant, rng }) {
  const group = new THREE.Group();
  group.name = 'structure';
  const L = layout.cathedral;

  const M = { ashlar: new MeshBuilder(), weathered: new MeshBuilder(), dark: new MeshBuilder() };
  const report = { notes: [], cornerButtresses: [] };
  const plinthH = L.westFront.plinth.height;

  /**
   * 勒腳：沿外牆 a→b 的凸出基座，outward = 外法線；gaps = 沿 a→b 的 [u0,u1] 不做段（門洞）
   */
  const plinth = (mb, a, b, outward, gaps = []) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const proj = 0.3;
    const prof = [[0, -0.3], [proj, -0.3], [proj, plinthH - 0.3], [0, plinthH]];
    const runs = [];
    let u = 0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > u) runs.push([u, Math.min(g0, len)]);
      u = Math.max(u, g1);
    }
    if (u < len) runs.push([u, len]);
    for (const [u0, u1] of runs) {
      if (u1 - u0 < 0.05) continue;
      const o = [a[0] + ux * u0, a[1] + uz * u0];
      // 斷面平面 = (外法線, y)，沿牆方向擠出
      const F = frame(o, outward, [ux, uz]);
      const t = mb.tone;
      mb.tone = t * 0.96;
      slab(mb, F, prof, u1 - u0, 0);
      mb.tone = t;
    }
  };

  const ctx = { L, M, rng, plinth, report, galleryRecessX: GALLERY_RECESS_X };
  buildWestFront(ctx);
  buildBody(ctx);
  buildButtresses(ctx);

  const add = (mb, mat, name) => {
    if (!mb.triCount) return;
    const mesh = new THREE.Mesh(mb.geometry(), mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(M.ashlar, variant('stoneAshlar', { vertexColors: true }), 'structure/ashlar');
  add(M.weathered, variant('stoneWeathered', { vertexColors: true }), 'structure/weathered');
  add(M.dark, materials.windowDark, 'structure/darkInterior');

  group.userData.report = report;
  return group;
}
