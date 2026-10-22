// src/sculpture.js — 第 4 號：雕刻（全部人像與獸像，程式生成）
// 人像產生器在 src/sculpture/figure.js；獸像在 beasts.js；門楣與拱圈在 reliefs.js。
// 位置全部取自 layout.js；門楣與拱圈用 tympanumRegisters() / archivoltRing() 定位。
import * as THREE from 'three';
import { compassToLocal, archivoltRing } from '../layout.js';
import { Mesher, facing, transM, scaleM } from './sculpture/geo.js';
import { figure, spec, SEAT_HEIGHT } from './sculpture/figure.js';
import { gargoyle, chimera, stryge, evangelistBeast, horse, beastHead } from './sculpture/beasts.js';
import { sdfCreature } from './sculpture/sdfbeast.js';
import {
  westPortalFrame, transeptPortalFrame, placeFigure, tympanum,
  archivoltSlots, archivoltMatrix, ARCHIVOLT_THEMES, archivoltTemplate,
} from './sculpture/reliefs.js';

const DEG = Math.PI / 180;

// 門側像題材（每側由外往內）
const JAMB_SUBJECTS = {
  portalJudgment: [
    ['apostle', 'apostle', 'apostle', 'john', 'apostle', 'peter'],   // 北側（觀者左）
    ['apostle', 'apostle', 'apostle', 'apostle', 'andrew', 'paul'],  // 南側
  ],
  portalVirgin: [['king', 'angel', 'denis', 'angel'], ['prophet', 'stephen', 'queen', 'bishop']],
  portalStAnne: [['king', 'queen', 'king', 'prophet'], ['king', 'woman', 'paul', 'peter']],
};
const TRUMEAU = { portalJudgment: 'christ', portalVirgin: 'virgin', portalStAnne: 'bishop' };
const TYMPANUM_THEME = { portalJudgment: 'judgment', portalVirgin: 'virgin', portalStAnne: 'anne' };
const NICHE_KIND = ['denis', 'ecclesia', 'synagoga', 'stephen'];

export function build({ layout, materials, variant, rng }) {
  const group = new THREE.Group();
  group.name = 'sculpture';
  const C = layout.cathedral, WF = C.westFront;
  const R = (n) => rng(`sculpture/${n}`);
  const stone = variant('stoneCarved', { vertexColors: true });
  const copper = variant('copperVerdigris', { vertexColors: true });
  const bronze = variant('bronzeDark', { vertexColors: true });

  const out = (M, mat, name) => {
    if (!M.I.length) return;
    const mesh = new THREE.Mesh(M.toGeometry(), mat);
    mesh.name = name;
    group.add(mesh);
  };
  const S = (kind, name, over) => spec(kind, R(name), over);
  const fig = (M, Sp, pos, dir, h) => {
    const k = Sp.pose === 'seat' ? h / SEAT_HEIGHT : h;
    M.push(facing(pos, dir[0], dir[1], k));
    figure(M, Sp);
    M.pop();
  };

  // ======================= 西立面：門 =======================
  const portalsM = new Mesher();
  const archInst = new Map(); // 樣板名 → 矩陣陣列
  const addArch = (key, m) => { if (!archInst.has(key)) archInst.set(key, []); archInst.get(key).push(m); };

  const doArchivolts = (p, frame, theme, tag) => {
    const kinds = ARCHIVOLT_THEMES[theme];
    // 拱圈雕像起點：與立面模組的拱圈起點一致（門側像頂 + 0.75；無門側像則為最低起拱線）
    const js = p.jambStatues && p.jambStatues[0];
    const minSpring = Math.min(...Array.from({ length: p.archivolts }, (_, k) => archivoltRing(p, k).springing));
    const yStart = js ? Math.max(p.doorHeight + 0.12, js.y + js.height + 0.75) : minSpring;
    for (let k = 0; k < p.archivolts; k++) {
      const kind = kinds[Math.min(k, kinds.length - 1)];
      for (const slot of archivoltSlots(p, k, yStart)) {
        const v = (slot.i + (slot.side > 0 ? 1 : 0) + k) % 2;
        const m = frame.clone().multiply(archivoltMatrix(slot, slot.h, 0.16));
        addArch(`${kind}/${v}`, m);
      }
    }
    void tag;
  };

  for (const p of WF.portals) {
    const frame = westPortalFrame(p);
    // 門側像
    const subj = JAMB_SUBJECTS[p.id];
    p.jambStatues.forEach((js, idx) => {
      const sideIdx = js.z < p.z ? 0 : 1;
      const i = idx % p.jambStatuesPerSide;
      const kind = subj[sideIdx][i] || 'apostle';
      const Sp = S(kind === 'andrew' ? 'apostle' : kind, `jamb/${p.id}/${idx}`, { lod: 2 });
      if (kind === 'andrew') { Sp.hold = { L: 'book', R: 'cross' }; Sp.arms.R = 'hold'; }
      const f = js.facingDeg * DEG;
      fig(portalsM, Sp, [js.x, js.y, js.z], [-Math.cos(f), Math.sin(f)], js.height);
    });
    // 門中柱像
    const t = p.trumeauStatue;
    const Ts = S(TRUMEAU[p.id], `trumeau/${p.id}`, { lod: 2, head: { turn: 0, tilt: 0.05 } });
    fig(portalsM, Ts, [t.x, t.y, t.z], [-1, 0], t.height);
    if (p.id === 'portalStAnne') { // 聖瑪塞爾腳下的龍
      portalsM.push(facing([t.x - 0.25, t.y + 0.12, t.z], -1, 0, 0.5));
      portalsM.tube([[0, 0, -0.3], [0.2, 0.05, 0], [0, 0.1, 0.3], [-0.15, 0.2, 0.45]], [0.12, 0.14, 0.1, 0.06], 8, 12, 0.8);
      portalsM.pushTRS(-0.2, 0.3, 0.55, 0.3, 0, 0, 0.35); beastHead(portalsM, { kind: 'dog', jaw: 0.5, horns: 'small' }); portalsM.pop();
      portalsM.pop();
    }
    // 門楣浮雕
    portalsM.push(frame);
    tympanum(portalsM, p, TYMPANUM_THEME[p.id], R(`tympanum/${p.id}`));
    portalsM.pop();
    // 拱圈小坐像
    doArchivolts(p, frame, TYMPANUM_THEME[p.id], p.id);
  }

  // 扶壁壁龕像
  WF.buttressNicheStatues.forEach((n, i) => {
    fig(portalsM, S(NICHE_KIND[i], `niche/${i}`, { lod: 2 }), [n.x, n.y, n.z], [-1, 0], n.height);
  });
  out(portalsM, stone, 'sculpture-west-portals');

  // ======================= 國王廊 =======================
  const kingsM = new Mesher();
  WF.galleryOfKings.statues.forEach((k, i) => {
    const Sp = S('king', `kings/${i}`, { lod: 2 });
    fig(kingsM, Sp, [k.x, k.y, k.z], [-1, 0], k.height);
  });
  out(kingsM, stone, 'sculpture-kings');

  // ======================= 玫瑰窗前五尊 =======================
  const roseM = new Mesher();
  const RT = WF.roseTier;
  for (const st of RT.statues) {
    const kind = { virgin: 'virgin', angelN: 'angel', angelS: 'angel', adam: 'adam', eve: 'eve' }[st.id] || 'angel';
    const over = { lod: st.id === 'virgin' ? 2 : 1 };
    if (kind === 'angel') { over.arms = { R: 'hold', L: 'hold' }; over.hold = { [st.z < 0 ? 'L' : 'R']: 'candle' }; over.head = { turn: st.z < 0 ? 0.25 : -0.25 }; }
    fig(roseM, S(kind, `rose/${st.id}`, over), [st.x, st.y, st.z], [-1, st.z === 0 ? 0 : -Math.sign(st.z) * 0.15], st.height);
    // 小台座（露臺面到人像底）
    const ty = RT.terrace.y;
    if (st.y > ty) {
      roseM.box(st.x, ty + (st.y - ty) * 0.45, st.z, 0.5, (st.y - ty) * 0.9, 0.5, 0.75);
      roseM.box(st.x, st.y - 0.06, st.z, 0.72, 0.12, 0.72, 0.85);
    }
  }
  out(roseM, stone, 'sculpture-rose-tier');

  // ======================= 怪獸與沉思者 =======================
  const chimM = new Mesher();
  const north = compassToLocal(0);
  WF.chimeras.forEach((c, i) => {
    const r = R(`chimera/${i}`);
    if (c.id === 'stryge') {
      chimM.push(facing([c.x - 0.1, c.y, c.z + 0.1], north[0], north[2], c.height));
      stryge(chimM);
      chimM.pop();
      return;
    }
    const dx = c.x === 0 ? -1 : 1;
    const dz = Math.abs(Math.abs(c.z) - WF.z1) < 0.01 ? Math.sign(c.z) : 0;
    chimM.push(facing([c.x, c.y, c.z], dx, dz, c.height));
    // 四種造型（獅、羊、鷹、狼）各配固定的翅膀，共用快取；轉個角度讓每隻看起來不一樣
    const kind = r.pick(['lion', 'goat', 'eagle', 'dog']);
    chimM.pushTRS(0, 0, 0, 0, r.range(-0.22, 0.22), 0);
    sdfCreature(chimM, kind, { lion: 'bat', goat: null, eagle: 'feather', dog: 'bat' }[kind]);
    chimM.pop();
    chimM.pop();
  });
  out(chimM, stone, 'sculpture-chimeras');

  // ======================= 袖廊門 =======================
  const transM_ = new Mesher();
  for (const f of C.transept.facades) {
    const p = f.portal;
    const frame = transeptPortalFrame(f);
    const theme = f.z < 0 ? 'cloitre' : 'etienne';
    transM_.push(frame);
    const ts = p.trumeauStatue;
    const kind = f.z < 0 ? 'virginPlain' : 'stephen';
    placeFigure(transM_, S(kind, `trumeau/${f.id}`, { lod: 2, head: { turn: 0 } }), 0, 1.6, p.splayDepth - 0.5 + 0.1 * ts.height, ts.height, 1);
    tympanum(transM_, p, theme, R(`tympanum/${f.id}`));
    transM_.pop();
    doArchivolts(p, frame, theme, f.id);
    // 山牆頂像
    const g = f.gableStatue;
    if (g) {
      const s = Math.sign(f.z);
      if (f.z < 0) { // 十字架
        transM_.box(g.x, g.y + g.height * 0.5, f.z, 0.22, g.height, 0.22, 0.85);
        transM_.box(g.x, g.y + g.height * 0.68, f.z, g.height * 0.55, 0.22, 0.22, 0.85);
      } else {
        fig(transM_, S('stephen', `gable/${f.id}`, { lod: 1 }), [g.x, g.y, f.z - s * 0.4], [0, s], g.height);
      }
    }
  }
  out(transM_, stone, 'sculpture-transepts');

  // 拱圈樣板 → InstancedMesh
  for (const [key, mats] of archInst) {
    const [kind, v] = key.split('/');
    const T = archivoltTemplate(kind, R(`archivolt/${kind}/${v}`));
    const geo = T.toGeometry();
    const im = new THREE.InstancedMesh(geo, stone, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = `sculpture-archivolt-${kind}-${v}`;
    group.add(im);
  }

  // ======================= 滴水獸 =======================
  const gKinds = [{ kind: 'dog' }, { kind: 'goat', horns: 'small' }, { kind: 'lion' }];
  const gInst = gKinds.map(() => []);
  C.gargoyles.forEach((g, i) => {
    const r = R(`gargoyle/${i}`);
    const v = r.int(0, gKinds.length - 1);
    const L = Math.hypot(g.dir[0], g.dir[2]) || 1;
    const m = facing([g.x, g.y, g.z], g.dir[0] / L, g.dir[2] / L, g.length);
    m.multiply(new THREE.Matrix4().makeRotationZ(r.range(-0.06, 0.06)));
    gInst[v].push(m);
  });
  gKinds.forEach((o, v) => {
    if (!gInst[v].length) return;
    const T = new Mesher();
    gargoyle(T, { ...o, nu: 10, headNu: 12 });
    const im = new THREE.InstancedMesh(T.toGeometry(), stone, gInst[v].length);
    gInst[v].forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = `sculpture-gargoyles-${o.kind}`;
    group.add(im);
  });

  // ======================= 尖塔腳下 16 尊銅像 =======================
  const cuM = new Mesher();
  const apostleKinds = ['peter', 'paul', 'apostle', 'john', 'apostle', 'apostle', 'apostle', 'apostle', 'apostle', 'thomas', 'apostle', 'apostle'];
  const symbol = { west: 'angel', east: 'eagle', north: 'lion', south: 'ox' };
  let ai = 0;
  const sx = C.spire.x, sz = C.spire.z;
  for (const g of C.apostleGroups) {
    for (const st of g.statues) {
      let dx = st.x - sx, dz = st.z - sz;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      if (st.kind === 'apostle') {
        const kind = st.facingSpire ? 'thomas' : apostleKinds[ai % apostleKinds.length];
        ai++;
        const Sp = S(kind, `apostles/${g.id}/${ai}`, { lod: 1, sdf: true, head: { halo: null } });
        if (kind === 'thomas') Sp.head.tilt = -0.35;
        const dir = st.facingSpire ? [-dx, -dz] : [dx, dz];
        fig(cuM, Sp, [st.x, st.y, st.z], dir, st.height);
      } else {
        const sym = symbol[g.id];
        if (sym === 'angel') {
          fig(cuM, S('angel', `apostles/${g.id}/sym`, { lod: 1, sdf: true, arms: { R: 'hold', L: 'hold' }, hold: { L: 'book' } }), [st.x, st.y, st.z], [dx, dz], st.height);
        } else {
          cuM.push(facing([st.x, st.y, st.z], dx, dz, st.height));
          sdfCreature(cuM, sym, 'feather');
          cuM.pop();
        }
      }
    }
  }
  out(cuM, copper, 'sculpture-roof-bronzes');

  // ======================= 查理曼騎馬像 =======================
  const ch = layout.parvis.charlemagne;
  const chM = new Mesher();
  const fd = ch.facingDeg * DEG;
  const top = ch.pedestal.height;
  const hs = 2.6; // 馬的鬐甲高
  chM.push(facing([ch.x, top, ch.z], Math.cos(fd), Math.sin(fd), 1));
  chM.push(new THREE.Matrix4().makeTranslation(0, 0, -0.3).multiply(scaleM(hs)));
  horse(chM);
  chM.pop();
  // 騎者：只做腰以上 + 兩腿跨在馬身兩側
  const Hr = 3.3;
  const seatY = 0.98 * hs;
  const oy = seatY - 0.47 * Hr;
  const rider = S('king', 'charlemagne', { lod: 2, yStart: 0.45, feet: false, arms: { R: 'raised', L: 'forward' }, hold: { R: 'scepter' }, head: { beard: 1, crown: true, turn: 0, tilt: 0 } });
  chM.push(transM(0, oy, -0.4).multiply(scaleM(Hr)));
  figure(chM, rider);
  for (const s of [-1, 1]) {
    chM.tube([[s * 0.08, 0.48, 0.0], [s * 0.19, 0.31, 0.1], [s * 0.2, 0.1, 0.03]], [0.06, 0.045, 0.035], 10, 10, 0.85);
    chM.ellipsoid(s * 0.2, 0.08, 0.07, 0.03, 0.025, 0.06, 8, 5, 0.85);
    // 斗篷下擺垂在馬側
    chM.tube([[s * 0.11, 0.5, -0.06], [s * 0.18, 0.36, -0.12], [s * 0.2, 0.22, -0.16]], [0.07, 0.06, 0.03], 10, 8, 0.75, { sx: 0.4 });
  }
  chM.pop();
  // 步行的羅蘭與奧利維耶
  for (const s of [-1, 1]) {
    const Sp = S('knight', `charlemagne/knight/${s}`, { lod: 1 });
    if (s > 0) Sp.hold = { R: 'lance' };
    chM.push(transM(s * 0.88, 0, 1.25).multiply(new THREE.Matrix4().makeRotationY(-s * 0.15)).multiply(scaleM(2.9)));
    figure(chM, Sp);
    chM.pop();
  }
  chM.pop();
  out(chM, bronze, 'sculpture-charlemagne');

  return group;
}
