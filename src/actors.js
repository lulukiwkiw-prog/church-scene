// src/actors.js — 廣場上的活動物件：人物 12、鴿子 14、貓 2、狗 2
// -----------------------------------------------------------------------------
// 全部程式生成（膠囊、球、圓柱組成的關節骨架），顏色用頂點色。
// 每個物件的姿勢與位置只由時間 t 決定：group.userData.update(t)。
// 影片用影格時間呼叫（確定性），互動版用真實時間呼叫。
// 位置、路線、停留點全部來自 layout.actors。
// -----------------------------------------------------------------------------
import * as THREE from 'three';

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
function limb(r, len, seg = 8) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, seg);
  g.translate(0, -len / 2, 0);
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
function buildPerson(def, M, rng) {
  const h = def.height, child = def.kind === 'child', elder = def.kind === 'elder';
  const o = def.outfit;
  const skinTone = rng.pick([[0.93, 0.76, 0.64], [0.85, 0.66, 0.52], [0.66, 0.47, 0.34], [0.45, 0.31, 0.22], [0.96, 0.82, 0.72]]);
  const hairCol = elder ? rng.pick([[0.85, 0.85, 0.83], [0.70, 0.70, 0.70]]) : rng.pick([[0.12, 0.09, 0.07], [0.32, 0.20, 0.12], [0.55, 0.40, 0.22], [0.05, 0.05, 0.05]]);
  const shoe = [0.08, 0.07, 0.06];
  const legCol = o.trousers || [0.14, 0.14, 0.16];

  const L = 0.47 * h, thighL = 0.245 * h, shinL = 0.205 * h, torsoL = 0.30 * h;
  const headR = (child ? 0.075 : 0.064) * h, shoulder = (child ? 0.1 : 0.118) * h, hipW = 0.052 * h;
  const upA = 0.17 * h, foA = 0.155 * h;

  const root = new THREE.Group();
  root.name = def.id;
  const hips = piv(root, 0, L, 0);
  part(hips, sphere(0.09 * h, 12, 8), M.cloth, legCol, [0, 0, 0], null, [1.1, 0.6, 0.8]);

  const torso = piv(hips, 0, 0, 0);
  const coatLen = def.kind === 'elder' || def.kind === 'local' ? 0.16 * h : 0.05 * h;
  // 外套：由肩到臀下方的旋轉體（略寬、下擺張開）
  const coatProfile = [[0.001, torsoL + 0.02 * h], [0.06 * h, torsoL + 0.01 * h], [0.085 * h, torsoL - 0.05 * h], [0.082 * h, torsoL * 0.5],
    [0.085 * h, 0.02 * h], [0.095 * h, -coatLen]].map(([r, y]) => new THREE.Vector2(r, y));
  part(torso, new THREE.LatheGeometry(coatProfile, 14), M.cloth, o.coat, [0, 0, 0], null, [1.18, 1, 0.78]);
  if (o.skirt) {
    const sk = child ? 0.16 * h : 0.33 * h;
    part(hips, new THREE.CylinderGeometry(0.085 * h, 0.13 * h, sk, 14, 1, true), M.cloth, o.skirt, [0, -sk / 2 + 0.02 * h, 0]);
  }
  if (o.scarf && o.hat !== 'scarf') part(torso, new THREE.TorusGeometry(0.045 * h, 0.018 * h, 6, 12), M.cloth, o.scarf, [0, torsoL - 0.005 * h, 0], [Math.PI / 2, 0, 0]);
  if (def.backpack) part(torso, box(0.17 * h, 0.2 * h, 0.08 * h), M.cloth, def.backpack, [0, torsoL * 0.62, -0.1 * h]);
  if (def.baguette) part(torso, new THREE.CapsuleGeometry(0.022, 0.62, 3, 8), M.cloth, [0.78, 0.55, 0.28], [-0.105 * h, torsoL * 0.55, 0.02], [0.35, 0, Math.PI / 2 - 0.3]);

  // 頭
  const neck = piv(torso, 0, torsoL + 0.01 * h, 0);
  part(neck, cyl(0.022 * h, 0.025 * h, 0.05 * h, 8), M.skin, skinTone, [0, 0.02 * h, 0]);
  const head = piv(neck, 0, 0.045 * h, 0);
  part(head, sphere(headR, 16, 12), M.skin, skinTone, [0, headR, 0.004 * h], null, [0.9, 1.06, 0.98]);
  part(head, sphere(headR * 0.18, 6, 4), M.skin, skinTone, [0, headR * 0.95, headR * 0.95]); // 鼻
  for (const s of [-1, 1]) part(head, sphere(headR * 0.1, 6, 4), M.cloth, [0.05, 0.04, 0.04], [s * headR * 0.36, headR * 1.12, headR * 0.86]); // 眼
  if (o.hat === 'scarf') {
    part(head, new THREE.SphereGeometry(headR * 1.12, 14, 10, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.75), M.cloth, o.scarf, [0, headR * 1.02, 0]);
  } else {
    part(head, new THREE.SphereGeometry(headR * 1.06, 14, 8, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.55), M.cloth, hairCol, [0, headR * 1.05, -0.002 * h]);
    if (def.sex === 'f' && !elder) part(head, box(headR * 1.5, headR * 1.6, headR * 0.5), M.cloth, hairCol, [0, headR * 0.55, -headR * 0.7]);
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
    part(sh, limb(0.03 * h, upA), M.cloth, o.coat);
    const el = piv(sh, 0, -upA + 0.01 * h, 0);
    part(el, limb(0.025 * h, foA), M.cloth, o.coat);
    const hand = piv(el, 0, -foA, 0);
    part(hand, sphere(0.024 * h, 8, 6), M.skin, skinTone, [0, -0.015 * h, 0], null, [0.8, 1.2, 0.6]);
    arms.push({ sh, el, hand, s });
  }
  // 腿
  const legs = [];
  for (const s of [-1, 1]) {
    const th = piv(hips, s * hipW, 0, 0);
    part(th, limb(0.047 * h, thighL + 0.02 * h), M.cloth, legCol);
    const kn = piv(th, 0, -thighL, 0);
    part(kn, limb(0.036 * h, shinL + 0.01 * h), M.cloth, o.skirt && !child ? skinTone.map((v) => v * 0.9) : legCol);
    const ft = piv(kn, 0, -shinL, 0);
    part(ft, box(0.05 * h, 0.035 * h, 0.13 * h), M.cloth, shoe, [0, -0.012 * h, 0.035 * h]);
    legs.push({ th, kn, ft, s });
  }
  const R = arms[1], Lh = arms[0];
  // 手持物
  let cane = null;
  if (def.cane) cane = part(R.hand, cyl(0.011, 0.011, 0.86, 6), M.cloth, [0.20, 0.12, 0.06], [0, -0.43, 0.02]);
  if (def.handbag) part(Lh.el, box(0.22, 0.16, 0.08), M.cloth, [0.18, 0.10, 0.06], [0, -foA * 0.6, 0.06]);
  if (def.camera) part(R.hand, box(0.11, 0.07, 0.06), M.cloth, [0.06, 0.06, 0.07], [-0.03, -0.02, 0.04]);
  if (def.book) part(R.hand, box(0.16, 0.02, 0.22), M.cloth, [0.55, 0.12, 0.10], [-0.07, -0.02, 0.05], [0.3, 0, 0]);

  const rig = { root, hips, torso, neck, head, arms, legs, h, L, thighL, shinL };

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
    if (kind === 'cat' || def.size === 'small') part(head, new THREE.ConeGeometry(S.head * 0.35, S.head * 0.7, 4), M.fur, dark, [s * S.head * 0.5, S.head * 0.85, -S.head * 0.1], [0, 0, -s * 0.25]);
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
  tail.rotation.x = kind === 'cat' ? 2.4 : 2.2;
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
// 主程式
// -----------------------------------------------------------------------------
export function build({ layout, materials, variant, rng }) {
  const A = layout.actors;
  const group = new THREE.Group();
  group.name = 'actors';
  const M = {
    cloth: variant('fabric', { vertexColors: true }),
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

  group.userData.update = (t) => { for (const u of updaters) u(t); };
  group.userData.update(0);
  return group;
}
