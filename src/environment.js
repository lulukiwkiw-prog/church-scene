// src/environment.js — 第 5 號：廣場與環境（見 CONTRACT.md）
// 地面、廣場物件、樹（3 月新芽）、塞納河與河堤、橋、周邊奧斯曼建築、花園與噴泉。
// 所有座標與尺寸取自 layout.js；幾何依材質合併成少數 Mesh 以控制 draw call。
import * as THREE from 'three';
import { Buckets } from './environment/geom.js';
import { buildGround } from './environment/ground.js';
import { buildRiver, buildBridges } from './environment/river.js';
import { buildParvis } from './environment/parvis.js';
import { buildBuildings } from './environment/buildings.js';
import { buildGardens } from './environment/gardens.js';
import { buildTrees } from './environment/trees.js';

export function build({ layout, materials, variant, rng }) {
  const group = new THREE.Group();
  group.name = 'environment';
  const B = new Buckets();
  buildGround(B, layout);
  buildRiver(B, layout);
  buildBridges(B, layout);
  buildParvis(B, layout);
  buildGardens(B, layout);
  buildBuildings(B, layout, rng);
  buildTrees(B, layout, rng);
  B.emit(group, materials, variant, {
    // 水面與地面不投影（只接收）；玻璃燈罩不投影
    'water/water': { castShadow: false },
    'gardens/water': { castShadow: false },
    'ground/stonePaving': { castShadow: false },
    'ground/stoneTrace': { castShadow: false },
    'ground/asphalt': { castShadow: false },
    'parvis/glassLamp': { castShadow: false },
  });
  return group;
}
