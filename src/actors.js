// src/actors.js — 廣場上的活動物件：人物 12、鴿子 14、貓 2、狗 2
// -----------------------------------------------------------------------------
// 全部程式生成（關節骨架；頭與手是 SDF 雕刻、肢體是漸細旋轉體），顏色用頂點色。
// 每個物件的姿勢與位置只由時間 t 決定：group.userData.update(t)。
// 影片用影格時間呼叫（確定性），互動版用真實時間呼叫。
// 位置、路線、停留點全部來自 layout.actors。
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { sdfHeadParts, sdfHandHanging, FACE } from './sculpture/sdfhuman.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const mod = (a, n) => ((a % n) + n) % n;
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => a + mod(b - a + Math.PI, TAU) * t - Math.PI * t;
const yawOf = (dx, dz) => Math.atan2(dx, dz); // 本地前方 = +z

// -----------------------------------------------------------------------------
// 幾何小工具（頂點色）
// -----------------------------------------------------------------------------
const lin = (c) => c.map((v) => Math.pow(v, 2.2)); // layout 的顏色是感知色 → 線性
function tint(geo, rgb) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), l = lin(rgb);
  for (let i = 0; i < n; i++) { c[i * 3] = l[0]; c[i * 3 + 1] = l[1]; c[i * 3 + 2] = l[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function piv(parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function part(parent, geo, mat, rgb, pos = [0, 0, 0], rot = null, scale = null) {
  const m = new THREE.Mesh(tint(geo, rgb), mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  parent.add(m);
  return m;
}
/** 從樞紐往下（-y）長 len 的膠囊肢段 */
function limb(r, len, seg = 8, rEnd = r, ripple = 0) {
  if (rEnd === r && seg <= 8) {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, seg);
    g.translate(0, -len / 2, 0);
    return g;
  }
  // 漸細的肢段（上粗下細）：旋轉體，兩端圓頭（輪廓由下往上）
  const prof = [];
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); prof.push(new THREE.Vector2(rEnd * Math.sin(a), -len + rEnd - rEnd * Math.cos(a))); }
  for (let j = 1; j < 9 && ripple; j++) { // 布料在肘／膝與袖口堆出的橫向皺褶
    const u = j / 9, rr = rEnd + (r - rEnd) * u;
    prof.push(new THREE.Vector2(rr * (1 + ripple * Math.sin(u * Math.PI * 4.2 + 0.7) * (0.35 + 0.65 * Math.abs(2 * u - 1))), -len + rEnd + (len - r - rEnd) * u));
  }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); prof.push(new THREE.Vector2(r * Math.cos(a), -r + r * Math.sin(a))); }
  return new THREE.LatheGeometry(prof, seg);
}
/** 快取的 SDF 網格 → 帶頂點色（顏色 × 環境遮蔽）的幾何，座標乘 k */
function sdfGeo(m, rgb, k, face = null) {
  const g = new THREE.BufferGeometry(), l = lin(rgb), n = m.col.length;
  const lipC = lin([0.62, 0.30, 0.30]), eyeC = lin([0.07, 0.05, 0.05]), browC = face ? lin(face.brow) : null;
  const mixIn = (c, t, k2) => { for (let j = 0; j < 3; j++) c[j] = c[j] + (t[j] - c[j]) * k2; };
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[3 * i] = m.pos[3 * i] * k; pos[3 * i + 1] = m.pos[3 * i + 1] * k; pos[3 * i + 2] = m.pos[3 * i + 2] * k;
    const ao = m.col[i], c = [l[0], l[1], l[2]];
    if (face) { // 臉部上色：眼、眉、唇（頭部座標，身高 = 1 的單位）
      const x = Math.abs(m.pos[3 * i]), y = m.pos[3 * i + 1], z = m.pos[3 * i + 2];
      if (z > 0.04) {
        const bell = (v, a, b) => Math.max(0, 1 - Math.abs(v - (a + b) / 2) / ((b - a) / 2));
        const F = face.F, ey = F.brow - F.eyeDy;
        mixIn(c, eyeC, 0.85 * bell(x, F.eyeX - 0.009, F.eyeX + 0.009) * bell(y, ey - 0.006, ey + 0.005));
        mixIn(c, browC, 0.8 * bell(x, 0.006, 0.034) * bell(y, F.brow - 0.0045, F.brow + 0.0055));
        mixIn(c, lipC, 0.7 * bell(x, -0.001, F.lipW + 0.002) * bell(y, F.mouth - 0.0093, F.mouth + 0.0103));
      }
    }
    col[3 * i] = c[0] * ao; col[3 * i + 1] = c[1] * ao; col[3 * i + 2] = c[2] * ao;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.idx), 1));
  g.computeVertexNormals();
  return g;
}
function part3(parent, geo, mat, pos = [0, 0, 0], scale = null) { // 已經帶顏色的幾何
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  parent.add(m);
  return m;
}
/** 沿圓周的衣褶：y0（不動）往下到 y1 逐漸加深；hem > 0 時下擺高低起伏 */
function foldGeo(g, { n, amp, y0, y1, ph = 0, hem = 0 }) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = smooth((y0 - y) / (y0 - y1));
    if (t <= 0) continue;
    const th = Math.atan2(z, x);
    const w = 0.6 * Math.sin(n * th + ph) + 0.3 * Math.sin(2.7 * n * th + 2.1 * ph + 1) + 0.1 * Math.sin(5.3 * n * th);
    const k = 1 + amp * t * w;
    p.setX(i, x * k); p.setZ(i, z * k);
    if (hem) p.setY(i, y - hem * t * t * (0.5 + 0.5 * Math.sin(n * th + ph + 0.7)));
  }
  g.computeVertexNormals();
  return g;
}
const sphere = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (r0, r1, h, s = 10) => new THREE.CylinderGeometry(r0, r1, h, s);

// -----------------------------------------------------------------------------
// 路線：折線（loop / pingpong）＋停留點 → sample(t)
// -----------------------------------------------------------------------------
function makeTrack(path) {
  const pts = path.points;
  const nodes = path.mode === 'pingpong' ? [...pts, ...pts.slice(1, -1).reverse()] : pts;
  const dwellAt = new Map((path.dwell || []).map((d) => [d.at, d]));
  const events = [];
  let T = 0, D = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    const dw = dwellAt.get(i);
    if (dw) { events.push({ type: 'dwell', t0: T, dur: dw.sec, p: a, info: dw, d0: D }); T += dw.sec; }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 1e-6) { events.push({ type: 'move', t0: T, dur: len / path.speed, a, b, len, d0: D }); T += len / path.speed; D += len; }
  }
  const at = (t) => {
    const tt = mod(t + (path.start || 0), T);
    let e = events[events.length - 1];
    for (const ev of events) if (tt >= ev.t0 && tt < ev.t0 + ev.dur) { e = ev; break; }
    const u = (tt - e.t0) / e.dur;
    if (e.type === 'dwell') return { x: e.p[0], z: e.p[1], moving: false, dist: e.d0, dwell: e.info, dwellU: u, dwellT: tt - e.t0, ev: e };
    return { x: lerp(e.a[0], e.b[0], u), z: lerp(e.a[1], e.b[1], u), moving: true, dist: e.d0 + e.len * u, dwell: null, ev: e };
  };
  return { at, period: T, length: D };
}
/** 平滑的行進方向（前後各取一點，轉角自然轉彎） */
function trackYaw(track, t, w = 0.6) {
  const a = track.at(t - w), b = track.at(t + w);
  return Math.hypot(b.x - a.x, b.z - a.z) > 1e-4 ? yawOf(b.x - a.x, b.z - a.z) : null;
}

// -----------------------------------------------------------------------------
// 人物
// -----------------------------------------------------------------------------
export function buildPerson(def, M, rng) {
  const h = def.height, child = def.kind === 'child', elder = def.kind === 'elder';
  const o = def.outfit;
  const skinTone = def.skin || rng.pick([[0.93, 0.76, 0.64], [0.85, 0.66, 0.52], [0.66, 0.47, 0.34], [0.45, 0.31, 0.22], [0.96, 0.82, 0.72]]);
  const hairCol = def.hair || (elder ? rng.pick([[0.85, 0.85, 0.83], [0.70, 0.70, 0.70]]) : rng.pick([[0.12, 0.09, 0.07], [0.32, 0.20, 0.12], [0.55, 0.40, 0.22], [0.05, 0.05, 0.05]]));
  const shoe = [0.08, 0.07, 0.06];
  const legCol = o.trousers || [0.14, 0.14, 0.16];

  // 成人依黃金比例（身高 = 1）：約 7.7～8 頭身、肚臍在 0.618、髖 0.48、膝 0.26、肩峰 0.82；
  //   男：肩寬 ≈ 2 頭長、肩：腰 ≈ 1.618（倒三角）；女：肩 ≈ 臀、腰：臀 ≈ 0.7（沙漏）、腿較長。
  // 小孩維持原本較大的頭與較短的四肢。
  const fem = def.sex === 'f' && !child;
  const L = (child ? 0.47 : fem ? 0.485 : 0.48) * h, thighL = (child ? 0.245 : 0.222) * h, shinL = (child ? 0.205 : fem ? 0.225 : 0.22) * h;
  const torsoL = (child ? 0.30 : fem ? 0.36 : 0.365) * h;
  const headR = (child ? 0.075 : 0.064) * h, shoulder = (child ? 0.1 : fem ? 0.104 : 0.124) * h, hipW = (child ? 0.052 : fem ? 0.056 : 0.05) * h;
  const upA = 0.17 * h, foA = 0.155 * h;

  const root = new THREE.Group();
  root.name = def.id;
  const hips = piv(root, 0, L, 0);
  part(hips, sphere(0.08 * h, 14, 10), M.cloth, o.skirt || legCol, [0, 0, 0], null, [fem ? 1.12 : 1.05, 0.6, 0.78]);   // 骨盆（藏在外套下擺內）

  const torso = piv(hips, 0, 0, 0);
  const coatLen = o.skirt ? 0.0 : o.coatLen != null ? o.coatLen * h : def.kind === 'elder' || def.kind === 'local' ? 0.16 * h : 0.05 * h; // 穿裙子的人上衣到腰為止
  const coatFlare = (o.skirt ? 0.09 : o.coatFlare || 0.095) * h; // 長袍下擺半徑
  // 外套：由肩（斜肩）、胸、腰到臀與下襬的旋轉體；女性腰細、有胸線；下半身有衣褶
  const foldPh = rng.next() * TAU;
  // 半徑 × 1.18 才是正面半寬：男 肩 0.124／腰 0.08／臀 0.094；女 肩 0.104／腰 0.073／臀 0.106
  const shR = (child ? 0.085 : fem ? 0.088 : 0.105) * h, chR = (child ? 0.082 : fem ? 0.084 : 0.098) * h;
  const waR = (child ? 0.078 : elder ? 0.088 : fem ? 0.062 : 0.068) * h, hipR = (child ? 0.08 : fem ? 0.09 : 0.08) * h;
  const coatProfile = [[0.001, torsoL + 0.03 * h], [0.045 * h, torsoL + 0.026 * h], [0.075 * h, torsoL + 0.008 * h], [shR, torsoL - 0.02 * h], [chR, torsoL - 0.07 * h],
    [(chR + waR) / 2, torsoL * 0.68], [waR, torsoL * 0.45], [hipR, 0.0], [Math.max(hipR, coatFlare * 0.55) * 1.02, -0.03 * h], [Math.max(coatFlare, hipR), -coatLen]].map(([r, y]) => new THREE.Vector2(r, y));
  const coatG = new THREE.LatheGeometry(coatProfile.reverse(), 36); // 輪廓由下往上，面才朝外（之前反了，外套變成只看得到內側 = 簍空）
  if (fem) { // 胸線：衣服表面自己隆起（不另加球體），布料包在外面
    const pp = coatG.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      if (z <= 0) continue;
      const dx = (Math.abs(x) - 0.03 * h) / (0.032 * h), dy = (y - (torsoL - 0.088 * h)) / (0.04 * h);
      pp.setZ(i, z + 0.018 * h * Math.exp(-(dx * dx + dy * dy)));
    }
  }
  foldGeo(coatG, { n: 11, amp: coatLen > 0.1 * h ? 0.07 : 0.03, y0: torsoL * 0.3, y1: -coatLen, ph: foldPh, hem: coatLen > 0.1 * h ? 0.03 * h : 0 });
  part(torso, coatG, M.cloth, o.coat, [0, 0, 0], null, [1.18, 1, 0.78]);
  let skirt = null;
  if (o.skirt) {
    const sk = (o.skirtLen || (child ? 0.16 : 0.33)) * h, flare = (o.skirtFlare || 0.13) * h;
    // 裙子：由下往上的旋轉體，腰帶處收進腰圍（不再露出裡面），往下很快張開蓋住大腿
    const keys = [[flare, -sk + 0.02 * h], [0.122 * h, -0.02 * h], [0.114 * h, 0.012 * h], [0.092 * h, 0.05 * h]];
    const pts = [];
    for (let i = 0; i < keys.length - 1; i++) {
      const n = i === 0 ? 14 : 3;
      for (let j = 0; j < n; j++) { const u = j / n; pts.push(new THREE.Vector2(lerp(keys[i][0], keys[i + 1][0], u), lerp(keys[i][1], keys[i + 1][1], u))); }
    }
    pts.push(new THREE.Vector2(...keys[keys.length - 1]));
    const g = new THREE.LatheGeometry(pts, 56);
    foldGeo(g, { n: 13, amp: 0.13, y0: 0.0, y1: -sk + 0.02 * h, ph: foldPh + 1.3, hem: 0.05 * sk });
    skirt = part(hips, g, M.cloth, o.skirt);
    skirt.material = M.clothDouble;
  }
  if (!o.scarf && !o.hat?.includes?.('scarf')) part(torso, new THREE.TorusGeometry(0.04 * h, 0.011 * h, 6, 16), M.cloth, o.coat.map((v) => v * 0.82), [0, torsoL + 0.004 * h, 0], [Math.PI / 2, 0, 0]); // 領口
  if (o.scarf && o.hat !== 'scarf') part(torso, new THREE.TorusGeometry(0.045 * h, 0.018 * h, 6, 12), M.cloth, o.scarf, [0, torsoL - 0.005 * h, 0], [Math.PI / 2, 0, 0]);
  if (def.backpack) part(torso, box(0.17 * h, 0.2 * h, 0.08 * h), M.cloth, def.backpack, [0, torsoL * 0.62, -0.1 * h]);
  if (def.baguette) part(torso, new THREE.CapsuleGeometry(0.022, 0.62, 3, 8), M.cloth, [0.78, 0.55, 0.28], [-0.105 * h, torsoL * 0.55, 0.02], [0.35, 0, Math.PI / 2 - 0.3]);

  // 頭
  const neck = piv(torso, 0, torsoL + 0.01 * h, 0);
  part(neck, cyl(0.022 * h, 0.025 * h, 0.05 * h, 8), M.skin, skinTone, [0, 0.02 * h, 0]);
  const head = piv(neck, 0, (child ? 0.045 : 0.02) * h, 0);
  {
    // SDF 雕刻的臉（眉骨、眼窩、鼻、嘴唇、耳）與頭髮：皮膚與頭髮分開上色
    const style = def.hairStyle || (elder ? 'short' : def.sex === 'f' ? 'long' : 'short');
    const parts = sdfHeadParts({ female: def.sex === 'f', hair: style, beard: !!def.beard, veil: o.hat === 'scarf', seed: rng.int(0, 2) }, 0.0085);
    const k = (child ? 1.05 : fem ? 1.0 : 0.95) * h;   // 男性頭略小（約 7.7 頭身）
    part3(head, sdfGeo(parts.skin, skinTone, k, { brow: hairCol, F: def.sex === 'f' ? FACE.f : FACE.m }), M.skin, [0, headR, 0.004 * h]);
    if (parts.hair) part3(head, sdfGeo(parts.hair, hairCol, k), M.cloth, [0, headR, 0.004 * h]);
  }
  if (o.hat === 'scarf') {
    part(head, new THREE.SphereGeometry(headR * 1.12, 14, 10, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.75), M.cloth, o.scarf, [0, headR * 1.02, 0]);
  }
  if (o.hat === 'beret') part(head, sphere(headR * 1.12, 14, 6), M.cloth, [0.08, 0.08, 0.10], [headR * 0.1, headR * 1.85, 0], [0, 0, -0.2], [1, 0.32, 1]);
  if (o.hat === 'cap') {
    part(head, new THREE.SphereGeometry(headR * 1.08, 14, 8, 0, TAU, 0, Math.PI / 2), M.cloth, o.capColor, [0, headR * 1.25, 0]);
    part(head, box(headR * 1.3, headR * 0.08, headR * 0.9), M.cloth, o.capColor, [0, headR * 1.28, headR * 1.05]);
  }

  // 手臂
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = piv(torso, s * shoulder, torsoL - 0.025 * h, 0);
    part(sh, limb(0.031 * h, upA, 14, 0.026 * h, 0.07), M.cloth, o.coat);
    part(sh, sphere(0.032 * h, 12, 8), M.cloth, o.coat);   // 肩
    const el = piv(sh, 0, -upA + 0.01 * h, 0);
    part(el, limb(0.026 * h, foA, 14, 0.019 * h, 0.07), M.cloth, o.coat);
    part(el, sphere(0.027 * h, 10, 8), M.cloth, o.coat);   // 手肘
    const hand = piv(el, 0, -foA, 0);
    part3(hand, sdfGeo(sdfHandHanging(0.006), skinTone, 0.92 * h), M.skin, [0, -0.004 * h, 0], [s, 1, 1]);
    arms.push({ sh, el, hand, s });
  }
  // 腿
  const legs = [];
  for (const s of [-1, 1]) {
    const th = piv(hips, s * hipW, 0, 0);
    part(th, limb(0.05 * h, thighL + 0.02 * h, 14, 0.04 * h, 0.04), M.cloth, legCol);
    const kn = piv(th, 0, -thighL, 0);
    part(kn, limb(0.04 * h, shinL + 0.01 * h, 14, 0.027 * h, o.skirt && !child ? 0 : 0.04), M.cloth, o.skirt && !child ? skinTone.map((v) => v * 0.9) : legCol);
    const ft = piv(kn, 0, -shinL, 0);
    part(ft, sphere(0.5, 14, 8), M.cloth, shoe, [0, -0.014 * h, 0.04 * h], null, [0.056 * h, 0.04 * h, 0.15 * h]);       // 鞋身
    part(ft, sphere(0.5, 10, 6), M.cloth, shoe, [0, -0.012 * h, -0.02 * h], null, [0.05 * h, 0.05 * h, 0.06 * h]);       // 鞋跟處
    legs.push({ th, kn, ft, s });
  }
  const R = arms[1], Lh = arms[0];
  // 手持物
  let cane = null;
  if (def.cane) cane = part(R.hand, cyl(0.011, 0.011, 0.86, 6), M.cloth, [0.20, 0.12, 0.06], [0, -0.43, 0.02]);
  if (def.handbag) part(Lh.el, box(0.22, 0.16, 0.08), M.cloth, [0.18, 0.10, 0.06], [0, -foA * 0.6, 0.06]);
  if (def.camera) part(R.hand, box(0.11, 0.07, 0.06), M.cloth, [0.06, 0.06, 0.07], [-0.03, -0.02, 0.04]);
  if (def.book) part(R.hand, box(0.16, 0.02, 0.22), M.cloth, [0.55, 0.12, 0.10], [-0.07, -0.02, 0.05], [0.3, 0, 0]);

  const rig = { root, hips, torso, neck, head, arms, legs, h, L, thighL, shinL, skirt, skinTone, hairCol };

  /** 姿勢：phase 步伐相位、amp 擺幅、run 跑步 */
  rig.walk = (phase, amp, run = false) => {
    const sp = Math.sin(phase);
    for (const lg of legs) {
      const sgn = lg.s < 0 ? 1 : -1;
      const sw = amp * sp * sgn;
      lg.th.rotation.set(-sw, 0, 0);
      const swingFwd = Math.cos(phase) * sgn; // >0：這條腿往前擺（懸空）
      lg.kn.rotation.set(0.12 + (run ? 1.3 : 0.75) * amp * Math.max(0, swingFwd), 0, 0);
      lg.ft.rotation.set(-0.1 * Math.max(0, -swingFwd), 0, 0);
    }
    for (const a of arms) {
      const sgn = a.s < 0 ? 1 : -1; // 手臂與同側腿相反
      a.sh.rotation.set(amp * 0.8 * sp * sgn, 0, a.s * 0.06);
      a.el.rotation.set(run ? -1.3 : -0.25 - 0.15 * Math.abs(sp), 0, 0);
    }
    hips.position.y = L + (run ? 0.03 : 0.012) * h * Math.cos(2 * phase) - (run ? 0.02 * h : 0);
    torso.rotation.set(run ? 0.22 : 0.03, 0.08 * sp, 0);
  };
  rig.stand = (t) => {
    for (const lg of legs) { lg.th.rotation.set(0, 0, lg.s * 0.03); lg.kn.rotation.set(0.04, 0, 0); lg.ft.rotation.set(0, 0, 0); }
    for (const a of arms) { a.sh.rotation.set(0.05 * Math.sin(t * 0.7 + a.s), 0, a.s * 0.08); a.el.rotation.set(-0.15, 0, 0); }
    hips.position.y = L;
    torso.rotation.set(0.01 * Math.sin(t * 1.6), 0, 0); // 呼吸
  };
  rig.sit = () => {
    for (const lg of legs) { lg.th.rotation.set(-Math.PI / 2 + 0.05, 0, lg.s * 0.08); lg.kn.rotation.set(Math.PI / 2 - 0.05, 0, 0); lg.ft.rotation.set(0, 0, 0); }
    torso.rotation.set(-0.08, 0, 0);
  };
  rig.look = (yawRel, pitch) => {
    head.rotation.set(clamp(pitch, -0.75, 0.6), clamp(yawRel, -1.0, 1.0) * 0.75, 0);
    neck.rotation.set(0, clamp(yawRel, -1.0, 1.0) * 0.25, 0);
  };
  rig.lookAt = (p) => {
    const wp = root.position;
    const dx = p[0] - wp.x, dz = p[2] - wp.z, dy = p[1] - (wp.y + 0.93 * h);
    const rel = mod(yawOf(dx, dz) - root.rotation.y + Math.PI, TAU) - Math.PI;
    rig.look(rel, -Math.atan2(dy, Math.hypot(dx, dz)));
  };
  rig.cane = cane;
  return rig;
}

// -----------------------------------------------------------------------------
// 四足動物（貓、狗）
// -----------------------------------------------------------------------------
function buildQuadruped(def, M, kind) {
  const S = kind === 'cat' ? { H: 0.24, len: 0.42, r: 0.075, head: 0.065, leg: 0.022, tail: 0.3 }
    : kind === 'goat' ? { H: 0.42, len: 0.58, r: 0.12, head: 0.075, leg: 0.024, tail: 0.08 }
      : def.size === 'small' ? { H: 0.26, len: 0.40, r: 0.085, head: 0.075, leg: 0.026, tail: 0.18 }
      : { H: 0.46, len: 0.66, r: 0.13, head: 0.1, leg: 0.04, tail: 0.3 };
  const col = def.coat, dark = col.map((v) => v * 0.55);
  const root = new THREE.Group();
  root.name = def.id;
  const body = piv(root, 0, S.H, 0);
  part(body, new THREE.CapsuleGeometry(S.r, S.len - 2 * S.r, 4, 12), M.fur, col, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.95]);
  const neck = piv(body, 0, S.r * 0.5, S.len / 2 - S.r * 0.3);
  const head = piv(neck, 0, S.r * 0.6, S.r * 0.4);
  part(head, sphere(S.head, 12, 10), M.fur, col, [0, 0, 0], null, kind === 'cat' ? [1.1, 0.95, 1.0] : [0.95, 0.95, 1.1]);
  const snout = kind === 'cat' ? 0.4 : 1.0;
  part(head, sphere(S.head * 0.55, 10, 8), M.fur, kind === 'cat' ? col : col.map((v) => v * 0.9), [0, -S.head * 0.25, S.head * (0.7 + 0.35 * snout)], null, [0.9, 0.75, 1 + snout * 0.6]);
  part(head, sphere(S.head * 0.14, 6, 4), M.cloth, [0.04, 0.03, 0.03], [0, -S.head * 0.12, S.head * (1.15 + 0.5 * snout)]);
  for (const s of [-1, 1]) {
    part(head, sphere(S.head * 0.12, 6, 4), M.cloth, kind === 'cat' ? [0.55, 0.62, 0.20] : [0.06, 0.04, 0.03], [s * S.head * 0.42, S.head * 0.22, S.head * 0.82]);
    if (kind === 'goat') {
      // 山羊：往後彎的角、橫向的耳朵
      const horn = new THREE.ConeGeometry(S.head * 0.17, S.head * 1.3, 6); horn.translate(0, S.head * 0.65, 0);
      part(head, horn, M.fur, def.horns, [s * S.head * 0.35, S.head * 0.75, -S.head * 0.15], [-0.9, 0, -s * 0.18]);
      part(head, box(S.head * 0.7, S.head * 0.2, S.head * 0.35), M.fur, col, [s * S.head * 0.9, S.head * 0.25, -S.head * 0.15], [0, 0, s * 0.35]);
    } else if (kind === 'cat' || def.size === 'small') part(head, new THREE.ConeGeometry(S.head * 0.35, S.head * 0.7, 4), M.fur, dark, [s * S.head * 0.5, S.head * 0.85, -S.head * 0.1], [0, 0, -s * 0.25]);
    else part(head, box(S.head * 0.25, S.head * 0.9, S.head * 0.5), M.fur, dark, [s * S.head * 0.95, -S.head * 0.1, -S.head * 0.1], [0, 0, s * 0.25]);
  }
  const legs = [];
  for (const [fx, fz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = piv(body, fx * S.r * 0.55, -S.r * 0.3, fz * (S.len / 2 - S.r * 0.8));
    const up = S.H * 0.55, lo = S.H * 0.55;
    part(hip, limb(S.leg * 1.3, up), M.fur, col);
    const knee = piv(hip, 0, -up + S.leg, 0);
    part(knee, limb(S.leg, lo), M.fur, fz > 0 ? col : dark);
    legs.push({ hip, knee, front: fz > 0, side: fx });
  }
  const tail = piv(body, 0, S.r * 0.5, -S.len / 2 + S.r * 0.3);
  part(tail, limb(S.leg * 0.9, S.tail), M.fur, kind === 'cat' ? col : dark, [0, 0, 0], null);
  tail.rotation.x = kind === 'cat' ? 2.4 : kind === 'goat' ? 1.0 : 2.2; // 山羊的短尾巴往上翹
  if (kind === 'goat') {
    part(head, new THREE.ConeGeometry(S.head * 0.18, S.head * 0.6, 5), M.fur, col.map((v) => v * 0.92), [0, -S.head * 0.85, S.head * 0.95], [Math.PI, 0, 0]); // 鬍子
    part(neck, new THREE.TorusGeometry(S.r * 0.55, S.r * 0.09, 5, 12), M.cloth, def.collar, [0, S.r * 0.25, S.r * 0.2], [Math.PI / 2 - 0.5, 0, 0]); // 金色項圈
  }
  const collar = kind === 'dog' ? part(neck, new THREE.TorusGeometry(S.r * 0.62, S.r * 0.08, 5, 12), M.cloth, [0.6, 0.1, 0.1], [0, S.r * 0.25, S.r * 0.2], [Math.PI / 2 - 0.5, 0, 0]) : null;

  const rig = { root, body, neck, head, legs, tail, S, collar };
  rig.walk = (phase, amp, gallop = false) => {
    for (const lg of legs) {
      const off = gallop ? (lg.front ? 0 : Math.PI * 0.6) + (lg.side > 0 ? 0.3 : 0) : ((lg.front === (lg.side > 0)) ? 0 : Math.PI);
      const s = Math.sin(phase + off);
      lg.hip.rotation.set(-amp * s, 0, 0);
      lg.knee.rotation.set((lg.front ? -1 : 1) * amp * 0.9 * Math.max(0, Math.cos(phase + off)), 0, 0);
    }
    body.position.y = S.H + (gallop ? 0.03 : 0.008) * Math.cos(2 * phase);
    body.rotation.set(gallop ? 0.08 * Math.sin(phase) : 0, 0, 0);
  };
  return rig;
}

// -----------------------------------------------------------------------------
// 鴿子
// -----------------------------------------------------------------------------
function buildPigeon(def, M, r) {
  const variety = r.next();
  const base = variety < 0.65 ? [0.52, 0.55, 0.62] : variety < 0.8 ? [0.35, 0.33, 0.36] : variety < 0.92 ? [0.55, 0.42, 0.32] : [0.86, 0.86, 0.84];
  const wingCol = base.map((v) => v * 0.92), bar = base.map((v) => v * 0.35);
  const root = new THREE.Group();
  root.name = def.id;
  const body = piv(root, 0, 0.095, 0);
  part(body, sphere(0.085, 12, 10), M.feather, base, [0, 0, 0], null, [0.8, 0.78, 1.35]);
  part(body, sphere(0.06, 10, 8), M.feather, variety < 0.92 ? [0.30, 0.45, 0.38] : base, [0, 0.045, 0.07], null, [1, 1, 1.1]); // 頸部虹彩
  const head = piv(body, 0, 0.085, 0.1);
  part(head, sphere(0.035, 10, 8), M.feather, base.map((v) => v * 0.9));
  part(head, new THREE.ConeGeometry(0.008, 0.026, 5), M.cloth, [0.15, 0.12, 0.12], [0, -0.005, 0.042], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) part(head, sphere(0.007, 5, 4), M.cloth, [0.85, 0.35, 0.10], [s * 0.022, 0.008, 0.022]);
  part(body, box(0.09, 0.012, 0.13), M.feather, bar, [0, 0.01, -0.16], [-0.25, 0, 0]); // 尾
  const wings = [];
  for (const s of [-1, 1]) {
    const w = piv(body, s * 0.055, 0.035, 0.03);
    const g = box(0.2, 0.012, 0.13);
    g.translate(s * 0.1, 0, -0.04);
    part(w, g, M.feather, wingCol);
    const gb = box(0.05, 0.013, 0.12); gb.translate(s * 0.03, 0.001, -0.05);
    part(w, gb, M.feather, bar);
    wings.push({ w, s });
  }
  for (const s of [-1, 1]) part(root, cyl(0.005, 0.005, 0.06, 4), M.cloth, [0.75, 0.25, 0.25], [s * 0.02, 0.03, 0.01]);
  const rig = { root, body, head, wings };
  rig.fold = () => { for (const { w, s } of wings) w.rotation.set(0, s * 1.35, s * 0.25); };
  rig.flap = (a) => { for (const { w, s } of wings) w.rotation.set(0, s * -0.1, s * a); };
  return rig;
}

// -----------------------------------------------------------------------------
// 白馬（菲比斯的坐騎）
// -----------------------------------------------------------------------------
function buildHorse(def, M) {
  const col = def.coat, shade = col.map((v) => v * 0.82), hoof = [0.16, 0.14, 0.12];
  const root = new THREE.Group();
  root.name = 'horse';
  const H = 1.22; // 背部中心高（馬肩高約 1.6 m）
  const body = piv(root, 0, H, 0);
  // 身體：前後長約 2.1 m、胸腔厚
  part(body, new THREE.CapsuleGeometry(0.32, 1.45, 6, 16), M.fur, col, [0, 0, 0], [Math.PI / 2, 0, 0], [0.92, 1, 1.22]);
  part(body, sphere(0.36, 14, 10), M.fur, col, [0, 0.04, -0.72], null, [0.95, 1.05, 1]); // 臀部
  part(body, sphere(0.36, 14, 10), M.fur, col, [0, 0.06, 0.68], null, [0.9, 1.1, 1]); // 胸
  part(body, box(0.7, 0.5, 0.85), M.clothDouble, def.saddleCloth, [0, 0.07, 0.05]); // 馬衣
  part(body, box(0.42, 0.1, 0.55), M.cloth, [0.30, 0.18, 0.10], [0, 0.39, 0.05]); // 馬鞍
  const neck = piv(body, 0, 0.22, 0.88);
  neck.rotation.x = 0.55; // 頸部斜向前上
  const ng = new THREE.CapsuleGeometry(0.17, 0.6, 4, 12); ng.translate(0, 0.4, 0);
  part(neck, ng, M.fur, col, [0, 0, 0], null, [0.75, 1, 1.25]);
  part(neck, box(0.06, 0.7, 0.14), M.fur, shade, [0, 0.42, -0.16]); // 鬃毛
  const head = piv(neck, 0, 0.82, 0.02);
  head.rotation.x = 1.75; // 頭往前下
  const hg = new THREE.CapsuleGeometry(0.12, 0.42, 4, 12); hg.translate(0, 0.27, 0);
  part(head, hg, M.fur, col, [0, 0, 0], null, [0.8, 1, 1.1]);
  for (const s of [-1, 1]) {
    part(head, new THREE.ConeGeometry(0.04, 0.13, 5), M.fur, col, [s * 0.06, -0.02, -0.1], [-1.2, 0, 0]);
    part(head, sphere(0.022, 6, 4), M.cloth, [0.04, 0.03, 0.03], [s * 0.1, 0.12, 0.05]);
  }
  const legs = [];
  for (const [fx, fz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = piv(body, fx * 0.2, -0.18, fz * 0.72);
    part(hip, limb(0.1, 0.5), M.fur, col);
    const knee = piv(hip, 0, -0.48, 0);
    part(knee, limb(0.055, 0.52), M.fur, col);
    part(knee, cyl(0.065, 0.075, 0.09, 8), M.cloth, hoof, [0, -0.52, 0]);
    legs.push({ hip, knee, front: fz > 0, side: fx });
  }
  const tail = piv(body, 0, 0.18, -1.02);
  tail.rotation.x = 2.75;
  part(tail, new THREE.ConeGeometry(0.09, 0.75, 6).translate(0, -0.375, 0), M.fur, shade);
  const saddle = piv(body, 0, 0.44, 0.05);
  const rig = { root, body, neck, head, legs, tail, saddle };
  rig.walk = (phase, amp) => {
    for (const lg of legs) {
      const off = (lg.front === (lg.side > 0)) ? 0 : Math.PI;
      const sn = Math.sin(phase + off);
      lg.hip.rotation.set(-amp * sn, 0, 0);
      lg.knee.rotation.set((lg.front ? -1 : 1) * amp * 1.1 * Math.max(0, Math.cos(phase + off)), 0, 0);
    }
    body.position.y = H + 0.02 * Math.cos(2 * phase);
    neck.rotation.x = 0.75 + 0.06 * Math.sin(2 * phase); // 走路時點頭
  };
  return rig;
}

// -----------------------------------------------------------------------------
// 主程式
// -----------------------------------------------------------------------------
export function build({ layout, materials, variant, rng }) {
  const A = layout.actors;
  const group = new THREE.Group();
  group.name = 'actors';
  const M = {
    cloth: variant('fabric', { vertexColors: true }),
    clothDouble: variant('fabric', { vertexColors: true, side: THREE.DoubleSide }), // 裙子、披風（看得到內側）
    skin: variant('skin', { vertexColors: true }),
    feather: variant('feather', { vertexColors: true }),
    fur: variant('fur', { vertexColors: true }),
  };
  const updaters = [];
  const people = new Map();
  const benches = layout.parvis.benches;

  // ---------------- 人物 ----------------
  for (const def of A.people) {
    const r = rng(`actors/person/${def.id}`);
    const rig = buildPerson(def, M, r);
    group.add(rig.root);
    const h = def.height;
    const stride = (def.kind === 'child' ? 0.9 : def.kind === 'elder' ? 0.95 : 1.35) * h / 1.7;
    const amp = def.kind === 'elder' ? 0.28 : def.kind === 'child' ? 0.75 : 0.4;
    const lean = def.kind === 'elder' ? 0.17 : 0;
    const P = rig.root.position;
    const tilt = () => { rig.torso.rotation.x += lean; };
    const elderCane = () => {
      if (!rig.cane) return;
      const R = rig.arms[1];
      R.sh.rotation.x = -0.25 + 0.08 * Math.sin(rig._phase || 0);
      R.el.rotation.x = -0.45;
      rig.cane.rotation.set(0.6, 0, 0);
    };
    let update;
    if (def.path) {
      const track = makeTrack(def.path);
      const side = def.path.side || 0;
      const L2 = Math.max(stride, track.length / Math.max(1, Math.round(track.length / stride)));
      people.set(def.id, { track, rig, def });
      update = (t) => {
        const s = track.at(t);
        const yawMove = trackYaw(track, t) ?? rig.root.rotation.y;
        let yaw = yawMove;
        P.set(s.x + Math.cos(yawMove) * side, 0, s.z - Math.sin(yawMove) * side);
        if (s.moving) {
          rig._phase = (s.dist / L2) * TAU;
          rig.walk(rig._phase, amp);
          tilt();
          rig.root.rotation.y = yaw;
          rig.look(0.15 * Math.sin(t * 0.37 + h), 0.05);
          elderCane();
        } else {
          const d = s.dwell;
          const ly = yawOf(d.look[0] - s.x, d.look[2] - s.z);
          const k = smooth(s.dwellT / 1.2) * (1 - smooth((s.dwellT - (d.sec - 1.2)) / 1.2));
          yaw = angLerp(yawMove, ly, k);
          rig.root.rotation.y = yaw;
          rig.stand(t);
          tilt();
          if (d.pose === 'lookUp') { rig.torso.rotation.x -= 0.1 * k; rig.lookAt(d.look); rig.head.rotation.x *= k; }
          if (d.pose === 'photo') {
            const R = rig.arms[1], Lf = rig.arms[0];
            const up = smooth((s.dwellT - 1.5) / 1.0) * (1 - smooth((s.dwellT - (d.sec - 1.8)) / 1.0));
            R.sh.rotation.set(-1.35 * up, 0, 0.25 * up); R.el.rotation.set(-1.55 * up - 0.15, 0, 0);
            Lf.sh.rotation.set(-1.25 * up, 0, -0.35 * up); Lf.el.rotation.set(-1.6 * up - 0.15, 0, 0);
            rig.lookAt(d.look);
            rig.head.rotation.x = lerp(rig.head.rotation.x, -0.25, up);
          }
        }
      };
    } else if (def.circle) {
      const c = def.circle;
      update = (t) => {
        const th = c.phase + (c.speed / c.radius) * t;
        P.set(c.center[0] + Math.cos(th) * c.radius, 0, c.center[1] + Math.sin(th) * c.radius);
        rig.root.rotation.y = yawOf(-Math.sin(th), Math.cos(th));
        rig.walk((c.speed * t / stride) * TAU, amp, true);
        rig.root.position.y = 0.04 * Math.abs(Math.sin((c.speed * t / stride) * TAU)); // 跑步騰空
        rig.look(0.5, 0.1); // 看著前面的同伴
      };
    } else if (def.dash) {
      const d = def.dash;
      const dx = d.target[0] - d.home[0], dz = d.target[1] - d.home[1], dist = Math.hypot(dx, dz), yawIn = yawOf(dx, dz);
      update = (t) => {
        const tt = mod(t - d.offset, d.period);
        let u, yaw, phase = 0, mode = 'idle';
        if (tt < d.runIn) { u = smooth(tt / d.runIn); yaw = yawIn; mode = 'run'; phase = (u * dist / stride) * TAU; }
        else if (tt < d.runIn + d.stay) { u = 1; yaw = yawIn; mode = 'cheer'; }
        else if (tt < d.runIn + d.stay + d.walkBack) { const w = (tt - d.runIn - d.stay) / d.walkBack; u = 1 - w; yaw = yawIn + Math.PI; mode = 'walk'; phase = (w * dist / (stride * 0.7)) * TAU; }
        else { u = 0; yaw = yawIn + Math.PI * 0.9; mode = 'idle'; }
        P.set(d.home[0] + dx * u, 0, d.home[1] + dz * u);
        rig.root.rotation.y = yaw;
        if (mode === 'run') { rig.walk(phase, 0.8, true); rig.root.position.y = 0.05 * Math.abs(Math.sin(phase)); }
        else if (mode === 'walk') rig.walk(phase, 0.45);
        else {
          rig.stand(t);
          if (mode === 'cheer') { // 雙手高舉、跳
            const j = Math.abs(Math.sin(t * 7));
            for (const a of rig.arms) { a.sh.rotation.set(-2.6 - 0.3 * j, 0, a.s * 0.4); a.el.rotation.set(-0.3, 0, 0); }
            rig.root.position.y = 0.12 * j;
            rig.look(0, -0.6); // 抬頭看飛走的鴿子
          } else rig.look(0.3 * Math.sin(t * 0.8), 0);
        }
      };
    } else if (def.idle) {
      const d = def.idle;
      update = (t) => {
        P.set(d.at[0], 0, d.at[1]);
        rig.root.rotation.y = yawOf(d.face[0] - d.at[0], d.face[1] - d.at[1]);
        rig.stand(t);
        const k = smooth((Math.sin((t / d.period) * TAU) + 1) / 2 * 1.4 - 0.2);
        const a = d.lookCycle[0], b = d.lookCycle[1];
        rig.lookAt([lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]);
        rig.torso.rotation.x += 0.12 * (1 - k) - 0.06 * k;
        rig.arms[1].sh.rotation.x = -0.35 * k; // 抬手指向教堂
        rig.arms[1].el.rotation.x = -0.2 - 0.6 * k;
      };
    } else if (def.sit) {
      const b = benches[def.sit.bench];
      const fx = Math.cos(b.facingDeg * Math.PI / 180), fz = Math.sin(b.facingDeg * Math.PI / 180);
      const ax = -fz, az = fx; // 長椅長度方向
      update = (t) => {
        P.set(b.x + ax * def.sit.offset + fx * 0.08, 0.46 - rig.L, b.z + az * def.sit.offset + fz * 0.08);
        rig.root.rotation.y = yawOf(fx, fz);
        rig.sit();
        const R = rig.arms[1], Lf = rig.arms[0];
        R.sh.rotation.set(-0.75, 0, 0.15); R.el.rotation.set(-1.1, 0, 0);
        Lf.sh.rotation.set(-0.7, 0, -0.1); Lf.el.rotation.set(-1.15, 0, 0);
        const glance = smooth((Math.sin(t * 0.21) - 0.75) * 5); // 偶爾抬頭看看
        rig.look(glance * 0.6 * Math.sin(t * 0.13), lerp(0.45, -0.05, glance));
        Lf.el.rotation.x -= 0.25 * smooth((Math.sin(t * 0.5) - 0.92) * 12); // 翻頁
      };
    }
    update(0);
    updaters.push(update);
  }

  // ---------------- 狗 ----------------
  for (const def of A.dogs) {
    const rig = buildQuadruped(def, M, 'dog');
    group.add(rig.root);
    let leash = null;
    if (def.follows) {
      leash = new THREE.Mesh(tint(cyl(0.006, 0.006, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2), [0.6, 0.1, 0.1]), M.cloth);
      group.add(leash);
    }
    const stride = rig.S.H * 1.6;
    const update = (t) => {
      if (def.follows) {
        const owner = people.get(def.follows);
        const lag = def.behind / owner.def.path.speed;
        const s = owner.track.at(t - lag);
        const yaw = trackYaw(owner.track, t - lag) ?? 0;
        const sniff = 0.35 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.3);
        rig.root.position.set(s.x + Math.cos(yaw) * (def.sideOffset + sniff), 0, s.z - Math.sin(yaw) * (def.sideOffset + sniff));
        rig.root.rotation.y = yaw + 0.25 * Math.cos(t * 0.9);
        rig.walk((s.dist / stride) * TAU, 0.5);
        rig.tail.rotation.set(2.2, 0.5 * Math.sin(t * 9), 0);
        rig.neck.rotation.set(0.25 + 0.2 * Math.sin(t * 0.7), 0.3 * Math.sin(t * 0.5), 0); // 低頭嗅聞
        // 狗繩：主人左手 → 項圈
        group.updateMatrixWorld(true);
        const hand = new THREE.Vector3(), col = new THREE.Vector3();
        owner.rig.arms[0].hand.getWorldPosition(hand);
        rig.collar.getWorldPosition(col);
        leash.position.copy(hand);
        leash.scale.set(1, 1, hand.distanceTo(col));
        leash.lookAt(col);
      } else {
        const c = def.circle;
        const th = c.phase + (c.speed / c.radius) * t;
        rig.root.position.set(c.center[0] + Math.cos(th) * c.radius, 0, c.center[1] + Math.sin(th) * c.radius);
        rig.root.rotation.y = yawOf(-Math.sin(th), Math.cos(th));
        rig.walk((c.speed * t / (stride * 1.6)) * TAU, 0.75, true);
        rig.tail.rotation.set(2.0, 0.7 * Math.sin(t * 14), 0);
        rig.neck.rotation.set(-0.15, -0.35, 0);
      }
    };
    update(0);
    updaters.push(update);
  }

  // ---------------- 貓 ----------------
  for (const def of A.cats) {
    const rig = buildQuadruped(def, M, 'cat');
    group.add(rig.root);
    let update;
    if (def.pose === 'sit') {
      update = (t) => {
        rig.root.position.set(def.at[0], 0, def.at[1]);
        rig.root.rotation.y = def.faceDeg * Math.PI / 180;
        rig.body.position.y = rig.S.H * 0.95;
        rig.body.rotation.set(-0.75, 0, 0); // 坐姿：身體往上翹
        for (const lg of rig.legs) {
          if (lg.front) { lg.hip.rotation.set(0.75, 0, 0); lg.knee.rotation.set(0, 0, 0); }
          else { lg.hip.rotation.set(-0.6, 0, lg.side * 0.2); lg.knee.rotation.set(2.2, 0, 0); }
        }
        rig.neck.rotation.set(0.75 + 0.1 * Math.sin(t * 0.4), 0.6 * Math.sin(t * 0.23), 0); // 轉頭張望
        rig.tail.rotation.set(1.4, 0.9 + 0.35 * Math.sin(t * 1.7), 0);
      };
    } else {
      const track = makeTrack(def.path);
      const stride = rig.S.H * 1.5;
      update = (t) => {
        const s = track.at(t);
        rig.root.position.set(s.x, 0, s.z);
        rig.root.rotation.y = trackYaw(track, t, 0.8) ?? 0;
        rig.walk((s.dist / stride) * TAU, 0.45);
        rig.body.position.y -= 0.02; // 貓走路壓低身體
        rig.tail.rotation.set(2.6 + 0.12 * Math.sin(t * 1.3), 0.3 * Math.sin(t * 0.9), 0);
        rig.neck.rotation.set(-0.05, 0.25 * Math.sin(t * 0.3), 0);
      };
    }
    update(0);
    updaters.push(update);
  }

  // ---------------- 鴿子 ----------------
  const dash = A.people.find((p) => p.dash)?.dash;
  A.pigeons.forEach((def, i) => {
    const r = rng(`actors/pigeon/${def.id}`);
    const rig = buildPigeon(def, M, r);
    group.add(rig.root);
    const w1 = r.range(0.05, 0.11), w2 = r.range(0.11, 0.2), p1 = r.range(0, TAU), p2 = r.range(0, TAU), p3 = r.range(0, TAU), p4 = r.range(0, TAU);
    const rr = def.radius * r.range(0.4, 1);
    const ground = (t) => [
      def.center[0] + rr * (0.62 * Math.sin(w1 * t + p1) + 0.38 * Math.sin(w2 * t + p2)),
      def.center[1] + rr * (0.62 * Math.cos(w1 * 0.9 * t + p3) + 0.38 * Math.sin(w2 * 1.1 * t + p4)),
    ];
    const peckPh = r.range(0, TAU), peckF = r.range(0.6, 1.1);
    // 飛行事件
    const flight = (t) => {
      if (def.scareBy && dash) {
        const k = Math.floor((t - dash.offset) / dash.period);
        const start = dash.offset + k * dash.period + dash.runIn - 0.9 + i * 0.07;
        const tau = t - start, dur = 7 + (i % 4) * 0.6;
        if (tau >= 0 && tau < dur) return { tau, dur, R: 6 + (i % 3), H: 4 + (i % 5), dir: i % 2 ? 1 : -1, hop: false };
        return null;
      }
      const P = 13 + i * 1.7, tau = mod(t + i * 3.1, P);
      return tau < 1.3 ? { tau, dur: 1.3, hop: true } : null;
    };
    const update = (t) => {
      const g = ground(t), g2 = ground(t + 0.3);
      const vx = g2[0] - g[0], vz = g2[1] - g[1], spd = Math.hypot(vx, vz) / 0.3;
      let x = g[0], z = g[1], y = 0, yaw = yawOf(vx, vz);
      const f = flight(t);
      if (!f) {
        rig.fold();
        rig.body.rotation.set(0, 0, 0);
        const walking = spd > 0.12;
        const bob = walking ? Math.sin(t * 2 * TAU) : 0;
        const peck = walking ? 0 : smooth((Math.sin(t * peckF * TAU + peckPh) - 0.6) * 4);
        rig.head.position.z = 0.1 + 0.025 * bob;
        rig.head.rotation.set(1.3 * peck, 0.4 * Math.sin(t * 0.7 + p2) * (1 - peck), 0);
        rig.body.rotation.x = 0.35 * peck;
      } else if (f.hop) {
        const e = Math.sin((f.tau / f.dur) * Math.PI);
        y = 0.5 * e;
        rig.flap(0.9 * Math.sin(t * 40) * e + 0.2);
        rig.head.rotation.set(-0.1, 0, 0);
      } else {
        const e = smooth(f.tau / 1.3) * (1 - smooth((f.tau - (f.dur - 1.6)) / 1.6));
        const th = f.dir * (f.tau / f.dur) * TAU * 0.9 + i;
        const ax = def.center[0] + Math.cos(th) * f.R, az = def.center[1] + Math.sin(th) * f.R;
        const gEnd = ground(t);
        x = lerp(gEnd[0], ax, e); z = lerp(gEnd[1], az, e); y = f.H * e + 0.3 * Math.sin(f.tau * 2.1 + i) * e;
        yaw = e > 0.3 ? yawOf(-Math.sin(th) * f.dir, Math.cos(th) * f.dir) : yaw;
        const glide = e > 0.95 && Math.sin(f.tau * 1.3 + i) > 0.4;
        rig.flap(glide ? 0.15 : 1.1 * Math.sin(t * (e < 0.9 ? 42 : 30) + i));
        rig.body.rotation.set(-0.35 * (1 - e) + 0.05, 0, 0);
        rig.head.rotation.set(-0.2, 0, 0);
      }
      rig.root.position.set(x, y, z);
      rig.root.rotation.y = yaw;
    };
    update(0);
    updaters.push(update);
  });

  // ---------------- 《巴黎聖母院》的角色 ----------------
  const ST = A.story;
  if (ST) {
    const D = ST.dance.center, BEAT_S = 60 / ST.dance.tempoBpm;
    const danceCenter = (t) => [D[0] + 0.9 * Math.sin(t * 0.45), D[1] + 0.6 * Math.sin(t * 0.9)];
    const relYaw = (P, yaw, x, z) => mod(yawOf(x - P.x, z - P.z) - yaw + Math.PI, TAU) - Math.PI;
    const mk = (def, kind, sex) => {
      const rig = buildPerson({ ...def, kind, sex }, M, rng(`actors/story/${def.id}`));
      group.add(rig.root);
      return rig;
    };

    // 愛絲梅拉達：主角，紅色長裙、金色腰帶、手拿鈴鼓
    const es = mk(ST.esmeralda, 'local', 'f');
    {
      const h = es.h;
      part(es.torso, new THREE.TorusGeometry(0.09 * h, 0.02 * h, 8, 28), M.cloth, ST.esmeralda.outfit.sash, [0, 0.045 * h, 0], [Math.PI / 2, 0, 0], [1.2, 0.85, 1]);
      part(es.head, new THREE.TorusGeometry(es.h * 0.052, 0.007 * h, 6, 24), M.cloth, ST.esmeralda.outfit.headband, [0, 0.085 * h, 0], [Math.PI / 2 - 0.2, 0, 0], [0.88, 1.12, 1]);
      for (const s of [-1, 1]) part(es.head, sphere(0.012 * h, 6, 4), M.cloth, ST.esmeralda.outfit.sash, [s * 0.043 * h, 0.046 * h, -0.002 * h]); // 耳環
      const tamb = part(es.arms[1].hand, cyl(0.12, 0.12, 0.045, 16), M.cloth, [0.78, 0.62, 0.40], [0, -0.06, 0.04], [0, 0, Math.PI / 2]);
      tamb.name = 'tambourine';
    }
    updaters.push((t) => {
      const beat = t / BEAT_S;
      const [x, z] = danceCenter(t);
      es.root.position.set(x, 0, z);
      // 每 8 拍的最後 2 拍轉一圈
      const b8 = mod(beat, 8), spin = b8 > 6 ? smooth((b8 - 6) / 2) : 0;
      es.root.rotation.y = -Math.PI / 2 + 0.8 * Math.sin(t * 0.35) + spin * TAU;
      es.walk(beat * Math.PI, 0.28);
      es.hips.position.y += 0.02 * Math.abs(Math.sin(beat * Math.PI));
      es.torso.rotation.set(-0.05, 0.15 * Math.sin(beat * Math.PI / 2), 0.12 * Math.sin(beat * Math.PI));
      const swap = Math.floor(beat / 8) % 2 === 1; // 每 8 拍換手
      const up = es.arms[swap ? 0 : 1], sweep = es.arms[swap ? 1 : 0];
      up.sh.rotation.set(-2.7 + 0.15 * Math.sin(beat * TAU), 0, up.s * 0.25);
      up.el.rotation.set(-0.35, 0, 0);
      sweep.sh.rotation.set(-1.1 + 0.6 * Math.sin(beat * Math.PI / 2), 0, sweep.s * (0.7 + 0.3 * Math.sin(beat * Math.PI / 2)));
      sweep.el.rotation.set(-0.3, 0, 0);
      const flare = 1 + 0.4 * spin * (1 - spin) * 4 + 0.08 * Math.abs(Math.sin(beat * Math.PI));
      es.skirt.scale.set(flare, 1 - 0.1 * (flare - 1), flare);
      es.look(0.3 * Math.sin(beat * Math.PI / 4), -0.1);
    });

    // 4 名伴舞：繞著愛絲梅拉達慢慢轉圈，服裝較低調
    ST.dancers.forEach((def, i) => {
      const d = mk(def, 'local', 'f');
      updaters.push((t) => {
        const beat = t / BEAT_S;
        const [cx, cz] = danceCenter(t);
        const th = i * Math.PI / 2 + 0.22 * t, r = ST.dance.ringRadius + 0.35 * Math.sin(t * 0.7 + i);
        const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
        d.root.position.set(x, 0, z);
        d.root.rotation.y = yawOf(cx - x, cz - z) + 0.35 * Math.sin(beat * Math.PI / 2 + i);
        d.walk(beat * Math.PI + i, 0.22);
        d.torso.rotation.z = 0.1 * Math.sin(beat * Math.PI + i);
        const clap = mod(beat + i, 4) < 0.5; // 每 4 拍拍一次手
        for (const a of d.arms) {
          if (clap) { a.sh.rotation.set(-1.9, 0, -a.s * 0.25); a.el.rotation.set(-0.5, 0, 0); }
          else { a.sh.rotation.set(-1.6 + 0.9 * Math.sin(beat * Math.PI / 2 + i + (a.s > 0 ? 0 : Math.PI)), 0, a.s * 0.5); a.el.rotation.set(-0.4, 0, 0); }
        }
        if (d.skirt) d.skirt.scale.set(1 + 0.08 * Math.abs(Math.sin(beat * Math.PI)), 1, 1 + 0.08 * Math.abs(Math.sin(beat * Math.PI)));
        d.look(0, -0.05);
      });
    });

    // 小山羊佳麗：繞著愛絲梅拉達蹦跳，她旋轉時佳麗用後腳站起來
    if (ST.djali) {
      const dj = ST.djali;
      const g = buildQuadruped(dj, M, 'goat');
      group.add(g.root);
      updaters.push((t) => {
        const beat = t / BEAT_S;
        const [cx, cz] = danceCenter(t);
        const th = -(dj.speed / dj.radius) * t + 1.2; // 與伴舞反方向
        const x = cx + Math.cos(th) * dj.radius, z = cz + Math.sin(th) * dj.radius;
        const b8 = mod(beat, 8), rear = b8 > 6 ? Math.sin(((b8 - 6) / 2) * Math.PI) : 0;
        g.root.position.set(x, 0, z);
        g.root.rotation.y = rear > 0.05 ? yawOf(cx - x, cz - z) : yawOf(Math.sin(th), -Math.cos(th));
        g.walk(beat * Math.PI, 0.55 * (1 - rear), true);
        const hop = Math.abs(Math.sin(beat * Math.PI)) * (1 - rear);
        g.root.position.y = 0.06 * hop;
        // 後腳站立：身體往上翹、前腳往前收
        g.body.rotation.x = -1.0 * rear;
        g.body.position.y += 0.2 * rear;
        for (const lg of g.legs) if (lg.front) { lg.hip.rotation.x -= 0.9 * rear; lg.knee.rotation.x -= 0.8 * rear; } else lg.hip.rotation.x += 1.0 * rear;
        g.neck.rotation.set(0.3 * rear - 0.1, 0, 0);
        g.tail.rotation.set(1.0 + 0.3 * Math.sin(t * 9), 0.3 * Math.sin(t * 7), 0);
      });
    }

    // 加西莫多：駝背、肩膀一高一低，趴在北塔欄杆後偷看，不時縮回去躲
    {
      const q = mk(ST.quasimodo, 'local', 'm');
      const h = q.h;
      part(q.torso, sphere(0.11 * h, 12, 10), M.cloth, ST.quasimodo.outfit.coat, [0.035 * h, 0.24 * h, -0.075 * h], null, [1.25, 1, 1]); // 駝背
      q.arms[0].sh.position.y -= 0.035 * h;
      q.arms[1].sh.position.y += 0.01 * h;
      part(q.head, sphere(q.h * 0.02, 6, 4), M.skin, q.skinTone, [-0.035 * h, 0.1 * h, 0.05 * h]); // 臉上的疣
      const A0 = ST.quasimodo.at;
      updaters.push((t) => {
        q.root.position.set(A0[0], A0[1], A0[2]);
        const [ex, ez] = danceCenter(t);
        q.root.rotation.y = yawOf(ex - A0[0], ez - A0[2]);
        q.stand(t);
        const cyc = mod(t, 11), hide = cyc > 8.5 ? Math.sin(((cyc - 8.5) / 2.5) * Math.PI) : 0; // 縮下去躲一下
        q.root.position.y = A0[1] - 0.45 * hide;
        q.torso.rotation.set(0.3 + 0.5 * hide, 0.1, 0.12);
        for (const a of q.arms) { a.sh.rotation.set(-1.15 - 0.2 * hide, 0, a.s * 0.25); a.el.rotation.set(-0.55, 0, 0); } // 扶著欄杆
        for (const lg of q.legs) { lg.th.rotation.set(-0.35 - 0.6 * hide, 0, lg.s * 0.1); lg.kn.rotation.set(0.5 + 1.0 * hide, 0, 0); }
        q.lookAt([ex, 1.3, ez]);
        q.head.rotation.x -= 0.3; // 駝背時頭要往上抬才看得到廣場
      });
    }

    // 副主教法羅路：黑色長袍、紫色腰帶與小圓帽，站在聖母露臺俯視
    {
      const f = mk(ST.frollo, 'local', 'm');
      const h = f.h, trim = ST.frollo.outfit.trim;
      part(f.torso, new THREE.TorusGeometry(0.088 * h, 0.014 * h, 6, 16), M.cloth, trim, [0, 0.04 * h, 0], [Math.PI / 2, 0, 0], [1.15, 0.8, 1]);
      part(f.head, new THREE.SphereGeometry(0.066 * h, 12, 6, 0, TAU, 0, 1.0), M.cloth, trim, [0, 0.075 * h, -0.01 * h]);
      part(f.torso, box(0.06 * h, 0.03 * h, 0.01 * h), M.cloth, [0.95, 0.95, 0.95], [0, 0.29 * h, 0.075 * h]); // 白領
      const A0 = ST.frollo.at;
      updaters.push((t) => {
        f.root.position.set(A0[0], A0[1], A0[2]);
        const [ex, ez] = danceCenter(t);
        f.root.rotation.y = yawOf(ex - A0[0], ez - A0[2]);
        f.stand(t);
        const cyc = mod(t, 16);
        const grip = smooth((cyc - 5) / 1.5) * (1 - smooth((cyc - 10) / 1.5)); // 抓住欄杆
        const away = cyc > 12.5 && cyc < 15 ? Math.sin(((cyc - 12.5) / 2.5) * Math.PI) : 0; // 痛苦地別過頭
        for (const a of f.arms) {
          a.sh.rotation.set(lerp(-0.35, -0.95, grip), 0, a.s * lerp(-0.38, 0.12, grip)); // 平常雙手交握在身前
          a.el.rotation.set(lerp(-1.35, -0.35, grip), 0, 0);
        }
        f.arms[1].sh.rotation.x -= 0.6 * away; f.arms[1].el.rotation.x -= 0.6 * away; // 手按胸口
        f.torso.rotation.x = 0.12 + 0.12 * grip;
        f.lookAt([ex, 1.3, ez]);
        f.head.rotation.y += 0.9 * away;
        f.head.rotation.x -= 0.25 * away;
      });
    }

    // 侍衛隊長菲比斯：騎白馬巡邏，臉一直看著愛絲梅拉達
    const ph = ST.phoebus;
    const track = makeTrack(ph.path);
    const horse = buildHorse(ph.horse, M);
    group.add(horse.root);
    const pb = buildPerson({ ...ph, kind: 'tourist', sex: 'm' }, M, rng(`actors/story/${ph.id}`));
    horse.saddle.add(pb.root);
    {
      const h = pb.h;
      part(pb.torso, sphere(0.1 * h, 12, 8), M.cloth, ph.outfit.armor, [0, 0.2 * h, 0.02 * h], null, [1.15, 1.1, 0.75]); // 胸甲
      part(pb.torso, box(0.26 * h, 0.4 * h, 0.012 * h), M.clothDouble, ph.outfit.cape, [0, 0.12 * h, -0.075 * h], [0.12, 0, 0]); // 披風
      part(pb.head, new THREE.SphereGeometry(0.07 * h, 12, 8, 0, TAU, 0, Math.PI / 2), M.cloth, ph.outfit.armor, [0, 0.075 * h, 0]); // 頭盔
      part(pb.head, new THREE.ConeGeometry(0.02 * h, 0.12 * h, 6), M.cloth, ph.outfit.cape, [0, 0.19 * h, -0.02 * h], [-0.4, 0, 0]); // 羽飾
      pb.root.position.set(0, -pb.L, 0);
    }
    const hStride = 1.7;
    updaters.push((t) => {
      const s = track.at(t);
      const yaw = trackYaw(track, t, 1.0) ?? 0;
      horse.root.position.set(s.x, 0, s.z);
      horse.root.rotation.y = yaw;
      horse.walk((s.dist / hStride) * TAU, 0.38);
      horse.tail.rotation.set(2.75, 0.15 * Math.sin(t * 1.3), 0);
      // 騎姿：雙腿跨在馬背兩側
      for (const lg of pb.legs) { lg.th.rotation.set(-1.25, 0, lg.s * 0.5); lg.kn.rotation.set(1.35, 0, 0); lg.ft.rotation.set(0, 0, 0); }
      pb.hips.position.y = pb.L + 0.01 * Math.cos((s.dist / hStride) * TAU * 2);
      for (const a of pb.arms) { a.sh.rotation.set(-0.55, 0, a.s * 0.15); a.el.rotation.set(-0.9, 0, 0); } // 握韁繩
      const [ex, ez] = danceCenter(t);
      const rel = relYaw(horse.root.position, yaw, ex, ez);
      const tw = clamp(rel * 0.45, -0.7, 0.7);
      pb.torso.rotation.set(0, tw, 0);
      pb.look(rel - tw, 0.15);
    });

    // 兩名侍衛：步行跟在後面，手持長戟
    for (const g of ST.guards) {
      const gr = mk(g, 'tourist', 'm');
      const h = gr.h;
      part(gr.head, new THREE.SphereGeometry(0.072 * h, 12, 8, 0, TAU, 0, Math.PI / 2), M.cloth, [0.55, 0.56, 0.58], [0, 0.07 * h, 0]);
      part(gr.head, cyl(0.1 * h, 0.1 * h, 0.006 * h, 14), M.cloth, [0.55, 0.56, 0.58], [0, 0.075 * h, 0]); // 帽簷
      // 長戟：抵銷手臂角度（肩 -0.35、肘 -1.2）讓它直立
      const hal = piv(gr.arms[1].hand, 0, -0.02, 0.03);
      hal.rotation.x = 1.55;
      part(hal, cyl(0.016, 0.016, 2.2, 6), M.cloth, [0.32, 0.22, 0.12], [0, 0.55, 0]);
      part(hal, box(0.02, 0.28, 0.16), M.cloth, [0.62, 0.63, 0.66], [0, 1.55, 0.06]); // 戟刃
      const stride = 1.35 * h / 1.7;
      updaters.push((t) => {
        const lagT = g.lag / ph.path.speed;
        const s = track.at(t - lagT);
        const yaw = trackYaw(track, t - lagT, 1.0) ?? 0;
        gr.root.position.set(s.x + Math.cos(yaw) * g.side, 0, s.z - Math.sin(yaw) * g.side);
        gr.root.rotation.y = yaw;
        gr.walk((s.dist / stride) * TAU, 0.38);
        gr.arms[1].sh.rotation.set(-0.35, 0, 0.1); gr.arms[1].el.rotation.set(-1.2, 0, 0); // 長戟直立
        const [ex, ez] = danceCenter(t);
        const glance = smooth((Math.sin(t * 0.17 + g.side * 3) - 0.6) * 4);
        gr.look(glance * clamp(relYaw(gr.root.position, yaw, ex, ez), -1, 1), 0.05);
      });
    }

    // 遊唱詩人葛林果利：戴羽毛帽、抱著魯特琴邊走邊彈唱
    {
      const gg = ST.gringoire;
      const g = mk(gg, 'local', 'm');
      const h = g.h;
      part(g.head, cyl(0.1 * h, 0.1 * h, 0.012 * h, 14), M.cloth, gg.outfit.hatColor, [0, 0.12 * h, 0]);
      part(g.head, new THREE.SphereGeometry(0.06 * h, 12, 6, 0, TAU, 0, Math.PI / 2), M.cloth, gg.outfit.hatColor, [0, 0.12 * h, 0]);
      part(g.head, new THREE.ConeGeometry(0.012 * h, 0.16 * h, 5), M.cloth, [0.92, 0.88, 0.80], [0.05 * h, 0.17 * h, -0.04 * h], [-0.6, 0, -0.5]); // 羽毛
      const lute = piv(g.torso, 0.02 * h, 0.13 * h, 0.1 * h);
      lute.rotation.set(0, 0, 0.9);
      part(lute, sphere(0.1 * h, 12, 10), M.cloth, [0.55, 0.32, 0.12], [0, 0, 0], null, [1, 1.25, 0.45]);
      part(lute, box(0.03 * h, 0.26 * h, 0.02 * h), M.cloth, [0.25, 0.15, 0.06], [0, 0.22 * h, 0]);
      part(lute, sphere(0.025 * h, 8, 6), M.cloth, [0.1, 0.07, 0.04], [0, 0.03 * h, 0.044 * h]); // 音孔
      const gtrack = makeTrack(gg.path);
      const stride = 1.1 * h / 1.7;
      const play = (t) => {
        const L = g.arms[0], R = g.arms[1];
        L.sh.rotation.set(-0.85, 0, -0.55); L.el.rotation.set(-1.25, 0, 0); // 按弦
        R.sh.rotation.set(-0.45, 0, 0.35); R.el.rotation.set(-1.55 + 0.18 * Math.sin(t * 14), 0, 0); // 撥弦
        g.head.rotation.z = 0.08 * Math.sin((t / BEAT_S) * Math.PI); // 跟著拍子擺頭
      };
      updaters.push((t) => {
        const s = gtrack.at(t);
        g.root.position.set(s.x, 0, s.z);
        if (s.moving) {
          g.root.rotation.y = trackYaw(gtrack, t) ?? g.root.rotation.y;
          g.walk((s.dist / stride) * TAU, 0.3);
        } else {
          const d = s.dwell;
          g.root.rotation.y = yawOf(d.look[0] - s.x, d.look[2] - s.z);
          g.stand(t);
          g.torso.rotation.z = 0.06 * Math.sin((t / BEAT_S) * Math.PI);
        }
        play(t);
        g.look(0.25 * Math.sin(t * 0.4), -0.05);
      });
    }
  }

  group.userData.update = (t) => { for (const u of updaters) u(t); };
  group.userData.update(0);
  return group;
}
