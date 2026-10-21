// src/facades.js — 立面與窗（2 號分身）
// 西立面三門、國王廊、玫瑰窗層、大迴廊、鐘樓窗、全立面線腳與欄杆、側面與後殿窗花、
// 禮拜堂山花、高牆簷口欄杆、袖廊立面、紅門。人像獸像一律不做（歸雕刻模組）。
// 座標全部來自 layout；細部斷面比例為本模組的造型常數。
import * as THREE from 'three';
import { Batch, T } from './facades/kit.js';
import { buildPortal } from './facades/portal.js';
import { buildWestFront } from './facades/westfront.js';
import { buildFlanks } from './facades/flanks.js';

export function build({ layout, materials, variant, rng }) {
  const group = new THREE.Group();
  group.name = 'facades';
  const C = layout.cathedral;
  const ds = { side: THREE.DoubleSide };
  const mats = {
    carved: variant('stoneCarved', ds),
    ashlar: variant('stoneAshlar', ds),
    glass: variant('glassStained', ds),
    wood: variant('doorWood', ds),
    iron: variant('ironWrought', ds),
    red: variant('doorRed', ds),
  };

  // 西立面三門（各自一批，方便相機近拍時的視錐裁切）
  for (const P of C.westFront.portals) {
    const b = new Batch(`portal-${P.id}`);
    buildPortal(b, P, T(0, 0, P.z), { statues: P.jambStatues, sideZ: P.z, r: rng(`facades/portal/${P.id}`) });
    group.add(b.toGroup(mats));
  }

  // 西立面其餘（國王廊、玫瑰窗層、大迴廊、鐘樓、線腳、欄杆）
  for (const b of buildWestFront(C, rng)) group.add(b.toGroup(mats));

  // 側面、後殿、袖廊、紅門
  for (const b of buildFlanks(C, rng)) group.add(b.toGroup(mats));

  return group;
}
