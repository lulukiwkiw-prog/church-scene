// src/environment/ground.js — 地面：島、廣場鋪面、考古標線、街道、左岸地面、水面
import { groundPoly, groundRect } from './geom.js';

// 疊層高度（公尺）：避免與 y = 0 鋪面 z-fighting
export const LAYER = { trace: 0.03, street: 0.035, sand: 0.04, grass: 0.075, plate: 0.05 };

/** 島的範圍：layout.island 與島上建築的聯集（行政警察總署 x0 = -230 超出 island.x0） */
export function islandBounds(L) {
  const I = L.surroundings.island;
  const on = L.surroundings.buildings.filter((b) => b.z1 <= I.z1);
  return {
    x0: Math.min(I.x0, ...on.map((b) => b.x0)),
    x1: Math.max(I.x1, ...on.map((b) => b.x1)),
    z0: Math.min(I.z0, ...on.map((b) => b.z0)),
    z1: I.z1,
    y: I.y,
  };
}
/** 左岸 / 水面的外框（遠景用） */
export const FAR = { x0: -420, x1: 480, z0: -320, z1: 320 };

const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

export function buildGround(B, L) {
  const { parvis, surroundings: S } = L;
  const isl = islandBounds(L);
  const ce = parvis.cryptEntrance;
  const crypt = rect(ce.x0, ce.x1, ce.z0, ce.z1);

  // 島：整片石板地面（廣場、人行道、教堂底下），挖出地下室入口
  groundPoly(B.get('ground', 'stonePaving'), rect(isl.x0, isl.x1, isl.z0, isl.z1), [crypt], isl.y);

  // 考古標線
  const gt = B.get('ground', 'stoneTrace');
  const yT = parvis.y + LAYER.trace;
  for (const tr of parvis.paving.medievalTraces) {
    if (tr.type === 'band') {
      const inside = ce.x0 >= tr.x0 && ce.x1 <= tr.x1 && ce.z0 >= tr.z0 && ce.z1 <= tr.z1;
      const overlap = !(ce.x1 <= tr.x0 || ce.x0 >= tr.x1 || ce.z1 <= tr.z0 || ce.z0 >= tr.z1);
      if (inside) groundPoly(gt, rect(tr.x0, tr.x1, tr.z0, tr.z1), [crypt], yT);
      else if (!overlap) groundRect(gt, tr.x0, tr.x1, tr.z0, tr.z1, yT);
      else {
        // 部分重疊：切成不含地下室的四塊
        groundRect(gt, tr.x0, ce.x0, tr.z0, tr.z1, yT);
        groundRect(gt, ce.x1, tr.x1, tr.z0, tr.z1, yT);
        groundRect(gt, ce.x0, ce.x1, tr.z0, Math.max(tr.z0, ce.z0), yT);
        groundRect(gt, ce.x0, ce.x1, Math.min(tr.z1, ce.z1), tr.z1, yT);
      }
    } else if (tr.type === 'outline') {
      // 淺色石條框線：寬 0.5 m，每邊兩端各延伸半寬讓轉角接滿
      const w = 0.5, p = tr.points;
      for (let i = 0; i < p.length; i++) {
        const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length];
        const l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
        const nx = -uz * w / 2, nz = ux * w / 2, ex = ux * w / 2, ez = uz * w / 2;
        groundPoly(gt, [
          [ax - ex + nx, az - ez + nz], [ax - ex - nx, az - ez - nz],
          [bx + ex - nx, bz + ez - nz], [bx + ex + nx, bz + ez + nz],
        ], [], yT + 0.002 * (i % 2));
      }
    }
  }

  // 街道（柏油）
  const ga = B.get('ground', 'asphalt');
  for (const st of S.streets) groundRect(ga, st.x0, st.x1, st.z0, Math.min(st.z1, isl.z1), LAYER.street);

  // 左岸：高牆頂之後的地面與沿河馬路（蒙特貝羅堤岸）
  const zL = S.seine.leftBankQuayWall.z;
  groundRect(B.get('ground', 'stonePaving'), FAR.x0, FAR.x1, zL, FAR.z1, 0);
  const b = S.buildings.find((q) => q.id === 'leftBankRow');
  const z0Road = zL + 2.5, z1Road = b ? b.z0 - 3 : zL + 9;
  groundRect(ga, FAR.x0, FAR.x1, z0Road, z1Road, LAYER.street);

  // 水面：塞納河南支流（向外延伸成環島的河面，遠景看得到島的邊緣也在水上）
  const sn = S.seine.south;
  const lq = S.seine.lowerQuay;
  const water = B.get('water', 'water');
  groundPoly(water, [[FAR.x0, FAR.z0], [FAR.x1, FAR.z0], [FAR.x1, lq.z0 + 0.3], [FAR.x0, lq.z0 + 0.3]], [], sn.waterY);
}
