// src/render/debug-scene.js — 測試用的粗略量體（只有 ?debug=1 才加入場景）
// -----------------------------------------------------------------------------
// 用來在建築模組完成前檢查天空、光影、霧、鏡頭路線與構圖。位置全部讀 layout。
// 不是正式場景的一部分；正式模組完成後不要開。
// -----------------------------------------------------------------------------
import * as THREE from 'three';

function box(mat, x0, x1, y0, y1, z0, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

// 有縱向衣褶的人像替身（測試陰影銳利度）
function figure(mat, height) {
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r = 0.26 + 0.06 * Math.sin(t * Math.PI);
    if (t > 0.82) r = 0.14 + 0.04 * Math.cos((t - 0.82) / 0.18 * Math.PI * 0.5); // 頭
    pts.push(new THREE.Vector2(r * (t > 0.98 ? 0.4 : 1), t * height));
  }
  const g = new THREE.LatheGeometry(pts, 48);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    if (y > height * 0.8) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.sin(a * 9) * (1 - y / height);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export function buildDebugScene(L, materials) {
  const g = new THREE.Group();
  g.name = 'debug';
  const stone = materials.stoneAshlar, carved = materials.stoneCarved, dark = materials.windowDark;
  const S = L.surroundings, C = L.cathedral, W = C.westFront, P = L.parvis;

  // 地面（島）與塞納河
  const isl = S.island;
  const ground = box(materials.stonePaving, isl.x0, isl.x1, -1, 0, isl.z0, isl.z1);
  g.add(ground);
  const r = S.seine.south;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set((r.x0 + r.x1) / 2, r.waterY, (r.z0 + r.z1) / 2);
  // UV 1 = 1 m
  const uv = water.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (r.x1 - r.x0), uv.getY(i) * (r.z1 - r.z0));
  g.add(water);
  g.add(box(materials.stoneQuay, r.x0, r.x1, r.waterY - 1, 0, r.z0 - 2, r.z0));
  g.add(box(materials.stoneQuay, r.x0, r.x1, r.waterY - 1, 0, r.z1, r.z1 + 4));
  g.add(box(materials.stonePaving, r.x0, r.x1, -1, 0, r.z1 + 4, 200));

  for (const b of S.buildings) {
    const m = box(materials.facadeHaussmann, b.x0, b.x1, 0, b.eave, b.z0, b.z1);
    g.add(m);
    g.add(box(materials.zincRoof, b.x0 + 1, b.x1 - 1, b.eave, b.ridge, b.z0 + 2, b.z1 - 2));
  }

  // 西立面：雙塔 + 中段
  for (const t of W.towers) {
    g.add(box(stone, t.x0, t.x1, 0, t.terrace.y, t.z0, t.z1));
    // 鐘樓尖窗（暗）
    for (const s of [-1, 1]) {
      const zc = (t.z0 + t.z1) / 2 + s * t.belfry.openings.offset;
      g.add(box(dark, -0.05, 0.2, t.belfry.openings.sill, t.belfry.openings.sill + t.belfry.openings.height, zc - 1.2, zc + 1.2));
    }
  }
  g.add(box(stone, 0, W.x1, W.portalZone.yTop, W.centerSectionTop, -6, 6));
  // 門區：三座門之間的實牆 + 階梯狀斜面
  const portals = [...W.portals].sort((a, b) => a.z - b.z);
  let z = W.z0;
  for (const p of portals) {
    g.add(box(stone, 0, W.x1, 0, W.portalZone.yTop, z, p.z - p.outerWidth / 2));
    g.add(box(stone, 0, W.x1, p.outerApex, W.portalZone.yTop, p.z - p.outerWidth / 2, p.z + p.outerWidth / 2));
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const hw = p.outerWidth / 2 + (p.openingWidth / 2 - p.outerWidth / 2) * (f + 1 / steps);
      const x0 = f * p.splayDepth, x1 = (f + 1 / steps) * p.splayDepth;
      const top = p.outerApex + (p.openingApex - p.outerApex) * (f + 1 / steps);
      g.add(box(carved, x0, x1, 0, p.outerApex, p.z - p.outerWidth / 2, p.z - hw));
      g.add(box(carved, x0, x1, 0, p.outerApex, p.z + hw, p.z + p.outerWidth / 2));
      g.add(box(carved, x0, x1, top, p.outerApex, p.z - hw, p.z + hw));
    }
    g.add(box(materials.doorWood, p.splayDepth, p.splayDepth + 0.3, 0, p.openingApex, p.z - p.openingWidth / 2, p.z + p.openingWidth / 2));
    for (const s of p.jambStatues) {
      const f = figure(carved, s.height);
      f.position.set(s.x - 0.2, s.y, s.z);
      g.add(f);
    }
    z = p.z + p.outerWidth / 2;
  }
  g.add(box(stone, 0, W.x1, 0, W.portalZone.yTop, z, W.z1));
  for (const b of W.buttresses) g.add(box(stone, -b.projection, 0, 0, b.top, b.z - b.width / 2, b.z + b.width / 2));

  // 國王廊
  const K = W.galleryOfKings;
  g.add(box(stone, -0.4, 0, K.yBottom - 0.4, K.yBottom, W.z0, W.z1));
  g.add(box(stone, -0.4, 0, K.yTop, K.yTop + 0.5, W.z0, W.z1));
  for (const s of K.statues) {
    const f = figure(carved, s.height);
    f.position.set(-0.3, s.y, s.z);
    g.add(f);
  }
  // 玫瑰窗 + 前方雕像
  const R = W.roseTier;
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(R.westRose.diameter / 2, R.westRose.diameter / 2, 0.3, 48), materials.glassStained);
  rose.rotation.z = Math.PI / 2;
  rose.position.set(-0.1, R.westRose.y, 0);
  g.add(rose);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R.westRose.diameter / 2, 0.35, 12, 64), carved);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-0.25, R.westRose.y, 0);
  g.add(ring);
  g.add(box(stone, -R.terrace.depth, 0, R.terrace.y - 0.4, R.terrace.y, W.z0, W.z1));
  for (const s of R.statues) {
    const f = figure(carved, s.height);
    f.position.set(s.x, s.y, s.z);
    g.add(f);
  }
  // 大迴廊細柱
  const G = W.grandGallery;
  for (let zz = W.z0 + 0.6; zz < W.z1; zz += 1.2) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(G.colonnetteRadius, G.colonnetteRadius, G.arcadeTop - G.yBottom, 12), carved);
    c.position.set(-0.2, (G.yBottom + G.arcadeTop) / 2, zz);
    g.add(c);
  }
  g.add(box(stone, -0.5, W.x1, G.arcadeTop, G.arcadeTop + 0.5, W.z0, W.z1));
  // 怪獸與沉思者
  for (const c of W.chimeras) {
    const f = figure(carved, c.height);
    f.position.set(c.x - 0.3, c.y, c.z);
    g.add(f);
  }

  // 中殿 + 詩班席（量體）、屋頂、袖廊、尖塔
  const sec = C.section, H = C.heights;
  g.add(box(stone, W.x1, C.apse.cx, 0, H.wallTop, -sec.vesselWallZ - 0.6, sec.vesselWallZ + 0.6));
  g.add(box(stone, W.x1, C.apse.cx, 0, H.aisleRoofLow, -sec.chapelOuterZ, sec.chapelOuterZ));
  g.add(box(stone, W.x1, C.apse.cx, 0, H.tribuneRoofLow, -sec.innerAisleOuterZ, sec.innerAisleOuterZ));
  const apse = new THREE.Mesh(new THREE.CylinderGeometry(sec.vesselWallZ + 0.6, sec.vesselWallZ + 0.6, H.wallTop, 10, 1, false, 0, Math.PI), stone);
  apse.position.set(C.apse.cx, H.wallTop / 2, 0);
  g.add(apse);
  const roofShape = new THREE.Shape([new THREE.Vector2(-C.roof.eaveZ, 0), new THREE.Vector2(C.roof.eaveZ, 0), new THREE.Vector2(0, C.roof.ridge - C.roof.eave)]);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: C.apse.cx - W.x1, bevelEnabled: false });
  const roof = new THREE.Mesh(roofGeo, materials.leadRoof);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(W.x1, C.roof.eave, 0);
  g.add(roof);
  const T = C.transept;
  g.add(box(stone, T.crossing.x0, T.crossing.x1, 0, H.wallTop, -T.armZ, T.armZ));
  for (const f of T.facades) {
    const rr = new THREE.Mesh(new THREE.CylinderGeometry(f.rose.diameter / 2, f.rose.diameter / 2, 0.3, 48), materials.glassStained);
    rr.rotation.x = Math.PI / 2;
    rr.position.set(f.rose.x, f.rose.y, f.z + Math.sign(f.z) * 0.1);
    g.add(rr);
  }
  const sp = C.spire;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(sp.octagonRadius, sp.top - sp.base, 8), materials.leadRoof);
  spire.position.set(sp.x, (sp.top + sp.base) / 2, sp.z);
  g.add(spire);
  for (const b of C.buttressPiers) g.add(box(stone, b.x - b.width / 2, b.x + b.width / 2, 0, b.top, b.z - b.depth / 2, b.z + b.depth / 2));
  for (const fb of C.flyingButtresses) {
    for (const fl of fb.flights) {
      const a = new THREE.Vector3(...fl.foot), b = new THREE.Vector3(...fl.head);
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, len), stone);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.lookAt(b);
      g.add(m);
    }
  }

  // 樹（3 月：稀疏淡綠，用低多邊形球代替）
  const trees = [...P.trees, ...S.gardens.flatMap((gd) => gd.trees)];
  for (const t of trees) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, t.height * 0.6, 8), materials.barkPlane);
    trunk.position.set(t.x, t.height * 0.3, t.z);
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(t.canopyRadius, 1), materials.grass);
    crown.position.set(t.x, t.height - t.canopyRadius, t.z);
    g.add(crown);
  }
  return g;
}
