// src/explore.js — 互動漫遊版：在場景裡自由走動 / 飛行
// -----------------------------------------------------------------------------
// 和影片共用同一套建築模組、材質、天空、陰影與大氣；只把「固定鏡頭路線」換成
// 玩家操控。碰撞只用 layout.js 的平面輪廓（教堂、周邊建築、河岸），飛行模式不碰撞。
// 這裡用真實時間驅動水面與雲（互動用），影片的確定性輸出仍走 main.js。
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { LAYOUT } from '../layout.js';
import { materials, variant } from '../materials.js';
import { rng } from '../rng.js';
import { createCameraPath } from './render/camera-path.js';
import { createSky, bakeEnvironment } from './render/sky.js';
import { installAtmosphere } from './render/atmosphere.js';
import { createSunLighting } from './render/lighting.js';
import { createPost } from './render/post.js';
import * as structure from './structure.js';
import * as facades from './facades.js';
import * as roofs from './roofs.js';
import * as sculpture from './sculpture.js';
import * as environment from './environment.js';
import * as actors from './actors.js';
import { createAudio } from './audio.js';

const MODULES = [
  ['structure', '牆體與飛扶壁', structure],
  ['facades', '門、玫瑰窗與窗花', facades],
  ['roofs', '屋頂與尖塔', roofs],
  ['sculpture', '雕像與浮雕', sculpture],
  ['environment', '廣場、樹與塞納河', environment],
  ['actors', '行人、鴿子、貓與狗', actors],
];

const $ = (id) => document.getElementById(id);
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const isTouch = matchMedia('(pointer: coarse)').matches;

// -----------------------------------------------------------------------------
// 畫質
// -----------------------------------------------------------------------------
const QUALITY = {
  low: { label: '低', ratio: 0.6, msaa: 0, bloom: false },
  mid: { label: '中', ratio: 1.0, msaa: 0, bloom: true },
  high: { label: '高', ratio: Math.min(devicePixelRatio || 1, 2), msaa: 4, bloom: true },
};
let quality = isTouch ? 'low' : 'mid';
try { const s = localStorage.getItem('nd-quality'); if (QUALITY[s]) quality = s; } catch { /* 無儲存空間也照常運作 */ }

// -----------------------------------------------------------------------------
// 光線與大氣（與影片相同）
// -----------------------------------------------------------------------------
const LOOK = {
  exposure: 0.55,
  sunColor: new THREE.Color(1.0, 0.72, 0.46),
  sunIntensity: 7.0,
  envIntensity: 0.55,
  fog: {
    nearColor: new THREE.Color(0.62, 0.55, 0.46),
    farColor: new THREE.Color(0.50, 0.57, 0.68),
    sunColor: new THREE.Color(0.95, 0.70, 0.45),
    density: 0.0016,
    heightFalloff: 0.012,
  },
};
const sunDir = new THREE.Vector3(...LAYOUT.sun.direction).normalize();

let W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(QUALITY[quality].ratio);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOK.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = installAtmosphere({ sunDirection: sunDir, ...LOOK.fog });
const camera = new THREE.PerspectiveCamera(60, W / H, 0.2, 4000);
camera.rotation.order = 'YXZ';
scene.add(camera);

let sky, lighting, post;
const waterTextures = new Map();
const animated = [];
const audio = createAudio({ layout: LAYOUT });

function makePost() {
  const q = QUALITY[quality];
  const pw = Math.round(W * q.ratio), ph = Math.round(H * q.ratio);
  post = createPost(renderer, scene, camera, pw, ph, { samples: q.msaa, bloom: q.bloom });
}

// -----------------------------------------------------------------------------
// 載入
// -----------------------------------------------------------------------------
async function load() {
  const steps = 3 + MODULES.length;
  let done = 0;
  const progress = (msg) => {
    $('load-step').textContent = msg;
    $('load-bar').style.setProperty('--p', `${Math.round((done / steps) * 100)}%`);
  };

  progress('天空與光線');
  await nextPaint();
  sky = createSky({
    sunDirection: sunDir, skyScale: 0.6, sunDiskScale: 60,
    hazeColor: new THREE.Color(0.62, 0.62, 0.64), groundColor: new THREE.Color(0.20, 0.17, 0.13),
  });
  scene.add(sky.mesh);
  scene.environment = bakeEnvironment(renderer, sky);
  scene.environmentIntensity = LOOK.envIntensity;
  lighting = createSunLighting({
    scene, camera, sunDirection: sunDir, color: LOOK.sunColor, intensity: LOOK.sunIntensity,
    mapSize: isTouch ? 2048 : 4096, fovForShadows: 60, aspect: W / H,
    staticBounds: [
      [LAYOUT.surroundings.island.x0, 0, LAYOUT.surroundings.island.z0],
      [LAYOUT.surroundings.island.x1, LAYOUT.cathedral.spire.top, Math.max(...LAYOUT.surroundings.buildings.map((b) => b.z1))],
    ],
  });
  makePost();
  done++;

  const world = new THREE.Group();
  scene.add(world);
  for (const [name, label, mod] of MODULES) {
    progress(label);
    await nextPaint();
    try {
      const g = mod.build({ layout: LAYOUT, materials, variant, rng });
      world.add(g);
      if (g.userData.update) animated.push(g.userData.update);
    } catch (e) {
      console.error(`[${name}]`, e);
    }
    done++;
  }

  progress('陰影與材質');
  await nextPaint();
  world.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const flow = m && ((m.userData && m.userData.flow) || (/^water/.test(m.name || '') ? materials.water.userData.flow : null));
      if (flow) for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k]) waterTextures.set(m[k], flow);
    }
  });
  lighting.setupMaterials(world);
  done++;

  progress('編譯著色器');
  await nextPaint();
  goTo(SPOTS[0], true);
  renderer.compile(scene, camera);
  done++;
  progress('完成');
}

// -----------------------------------------------------------------------------
// 地點（全部從 layout 讀）
// -----------------------------------------------------------------------------
const C = LAYOUT.cathedral, WF = C.westFront, P = LAYOUT.parvis;
const kf = (t) => LAYOUT.camera.keyframes.find((k) => k.t === t);
const SPOTS = [
  { id: 'parvis', name: '廣場', pos: [-95, 1.7, 6], look: [0, 30, 0] },
  { id: 'judgment', name: '最後審判門', pos: [-12, 1.7, 0], look: [1.5, 8, 0] },
  { id: 'virgin', name: '聖母門', pos: kf(34).position, look: kf(34).target },
  { id: 'kings', name: '國王廊', pos: kf(41).position, look: kf(41).target, fly: true },
  { id: 'rose', name: '玫瑰窗', pos: kf(48).position, look: kf(48).target, fly: true },
  { id: 'stryge', name: '沉思者', pos: kf(55).position, look: kf(55).target, fly: true },
  { id: 'pigeons', name: '孩子與鴿子', pos: [-68, 1.7, 13], look: [-50, 1, 22] },
  { id: 'charlemagne', name: '查理曼像', pos: [P.charlemagne.x - 9, 1.7, P.charlemagne.z - 6], look: [P.charlemagne.x, 4.5, P.charlemagne.z] },
  { id: 'south', name: '南側', pos: [C.transept.crossing.cx - 20, 1.7, 52], look: [C.transept.crossing.cx, 22, 24] },
  { id: 'apse', name: '後殿', pos: [C.apse.eastTipX + 30, 1.7, 30], look: [C.apse.cx, 25, 0] },
  { id: 'seine', name: '塞納河上空', pos: kf(70).position, look: kf(70).target, fly: true },
];

// -----------------------------------------------------------------------------
// 操控：yaw / pitch + 移動
// -----------------------------------------------------------------------------
const EYE = 1.7;
const state = { yaw: 0, pitch: 0, fly: false, film: false, filmT: 0 };
const keys = new Set();
const moveTouch = { x: 0, y: 0 };
const vel = new THREE.Vector3();

function lookAtPoint(target) {
  const d = new THREE.Vector3(...target).sub(camera.position);
  state.yaw = Math.atan2(-d.x, -d.z);
  state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
}

function goTo(spot, instant = false) {
  state.film = false;
  setFly(!!spot.fly || spot.pos[1] > EYE + 0.5);
  camera.position.set(...spot.pos);
  lookAtPoint(spot.look);
  vel.set(0, 0, 0);
  if (!instant) toast(spot.name);
}

function setFly(on) {
  state.fly = on;
  $('mode').textContent = on ? '飛行' : '步行';
  $('mode').setAttribute('aria-pressed', String(on));
  $('updown').hidden = !on || !isTouch;
  if (!on) camera.position.y = EYE;
}

// ---- 平面碰撞（步行模式）：由 layout 輪廓組成 ----
const S = C.section;
const rects = [
  [WF.x0 - 1.7, C.nave.x0 + 0.5, WF.z0 - 0.3, WF.z1 + 0.3],                 // 西立面與雙塔（含扶壁）
  [C.nave.x0, C.apse.cx, -S.culeeOuterZ, S.culeeOuterZ],                    // 中殿、詩班席（含扶壁墩）
  [C.transept.crossing.x0 - 1.2, C.transept.crossing.x1 + 1.2, -C.transept.armZ - 0.4, C.transept.armZ + 0.4],
  [C.sacristy.x0, C.sacristy.x1, C.sacristy.z0, C.sacristy.z1],
  [C.sacristy.passage.x0, C.sacristy.passage.x1, C.sacristy.passage.z0, C.sacristy.passage.z1],
  [P.charlemagne.x - P.charlemagne.pedestal.length / 2, P.charlemagne.x + P.charlemagne.pedestal.length / 2,
    P.charlemagne.z - P.charlemagne.pedestal.width / 2, P.charlemagne.z + P.charlemagne.pedestal.width / 2],
  [P.cryptEntrance.x0, P.cryptEntrance.x1, P.cryptEntrance.z0, P.cryptEntrance.z1],
  ...LAYOUT.surroundings.buildings.map((b) => [b.x0, b.x1, b.z0, b.z1]),
];
const RIVER = LAYOUT.surroundings.seine;
const bridges = LAYOUT.surroundings.bridges;
const R = 0.45; // 身體半徑

function blocked(x, z) {
  for (const [x0, x1, z0, z1] of rects) if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) return true;
  if (Math.hypot(x - C.apse.cx, z) < S.culeeOuterZ + R && x > C.apse.cx) return true; // 後殿半圓
  // 塞納河：只能走橋
  if (z > RIVER.quayWall.z - R && z < RIVER.leftBankQuayWall.z + R) {
    if (!bridges.some((b) => x > b.x0 + 1.2 && x < b.x1 - 1.2)) return true;
  }
  const isl = LAYOUT.surroundings.island;
  return x < isl.x0 || x > isl.x1 || z < isl.z0 || z > RIVER.leftBankQuayWall.z + 30;
}

function step(dt) {
  if (state.film) return;
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + moveTouch.y;
  const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + moveTouch.x;
  const up = (keys.has('KeyE') || keys.has('Space') || touchUp > 0 ? 1 : 0) - (keys.has('KeyQ') || keys.has('KeyC') || touchUp < 0 ? 1 : 0);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = state.fly ? (run ? 40 : 14) : (run ? 9 : 3.2);

  const sy = Math.sin(state.yaw), cy = Math.cos(state.yaw);
  const want = new THREE.Vector3(-sy * fwd + cy * side, state.fly ? up : 0, -cy * fwd - sy * side);
  if (want.lengthSq() > 1) want.normalize();
  want.multiplyScalar(speed);
  vel.lerp(want, 1 - Math.exp(-dt * 10));

  const p = camera.position;
  if (state.fly) {
    p.addScaledVector(vel, dt);
    p.y = Math.max(0.8, Math.min(400, p.y));
  } else {
    const nx = p.x + vel.x * dt, nz = p.z + vel.z * dt;
    if (!blocked(nx, p.z)) p.x = nx;
    if (!blocked(p.x, nz)) p.z = nz;
    p.y = EYE;
  }
}

// ---- 鍵盤與滑鼠 ----
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('button')) return;
  keys.add(e.code);
  if (e.code === 'KeyF') setFly(!state.fly);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  if (isTouch || document.pointerLockElement) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* 不支援就用拖曳 */ }
});


function turn(dx, dy, k) {
  state.yaw -= dx * k;
  state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * k));
}
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) turn(e.movementX, e.movementY, 0.0022); });

// 沒有 pointer lock 時：拖曳轉視角（桌機）
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag || document.pointerLockElement) return;
  turn(e.clientX - drag.x, e.clientY - drag.y, 0.004);
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => {
  camera.fov = Math.max(20, Math.min(75, camera.fov + Math.sign(e.deltaY) * 3));
  camera.updateProjectionMatrix();
  e.preventDefault();
}, { passive: false });

// ---- 觸控：左半邊搖桿移動、右半邊拖曳轉頭 ----
let touchUp = 0;
const touches = new Map();
canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    const left = t.clientX < W * 0.45;
    touches.set(t.identifier, { kind: left ? 'move' : 'look', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY });
    if (left) { $('stick').hidden = false; $('stick').style.transform = `translate(${t.clientX - 50}px, ${t.clientY - 50}px)`; }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier);
    if (!s) continue;
    if (s.kind === 'look') turn(t.clientX - s.x, t.clientY - s.y, 0.005);
    else {
      const dx = t.clientX - s.x0, dy = t.clientY - s.y0, m = Math.min(1, Math.hypot(dx, dy) / 50);
      const a = Math.atan2(dy, dx);
      moveTouch.x = Math.cos(a) * m;
      moveTouch.y = -Math.sin(a) * m;
      $('knob').style.transform = `translate(${Math.cos(a) * m * 30}px, ${Math.sin(a) * m * 30}px)`;
    }
    s.x = t.clientX; s.y = t.clientY;
  }
  e.preventDefault();
}, { passive: false });
const endTouch = (e) => {
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier);
    if (s && s.kind === 'move') { moveTouch.x = 0; moveTouch.y = 0; $('stick').hidden = true; $('knob').style.transform = ''; }
    touches.delete(t.identifier);
  }
};
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);
for (const [id, v] of [['up', 1], ['down', -1]]) {
  $(id).addEventListener('pointerdown', () => { touchUp = v; });
  $(id).addEventListener('pointerup', () => { touchUp = 0; });
  $(id).addEventListener('pointerleave', () => { touchUp = 0; });
}

// -----------------------------------------------------------------------------
// 介面
// -----------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function buildUI() {
  const list = $('spots');
  for (const s of SPOTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.addEventListener('click', () => goTo(s));
    list.appendChild(b);
  }
  $('mode').addEventListener('click', () => setFly(!state.fly));
  const sb = $('sound'), mb = $('music');
  sb.addEventListener('click', () => {
    if (audio.running) { audio.stop(); sb.textContent = '聲音：關'; sb.setAttribute('aria-pressed', 'false'); mb.hidden = true; }
    else { audio.start(); sb.textContent = '聲音：開'; sb.setAttribute('aria-pressed', 'true'); mb.hidden = false; }
  });
  mb.addEventListener('click', () => {
    audio.setMusic(!audio.musicOn);
    mb.textContent = audio.musicOn ? '音樂：開' : '音樂：關';
    mb.setAttribute('aria-pressed', String(audio.musicOn));
  });
  $('film').addEventListener('click', () => {
    state.film = !state.film;
    state.filmT = 0;
    $('film').setAttribute('aria-pressed', String(state.film));
    $('film').textContent = state.film ? '停止' : '影片路線';
    if (!state.film) setFly(camera.position.y > EYE + 0.5); // 停在目前位置繼續操控
    else camera.fov = 60;
  });
  const qb = $('quality');
  const label = () => { qb.textContent = `畫質：${QUALITY[quality].label}`; };
  label();
  qb.addEventListener('click', () => {
    quality = { low: 'mid', mid: 'high', high: 'low' }[quality];
    try { localStorage.setItem('nd-quality', quality); } catch { /* 略過 */ }
    renderer.setPixelRatio(QUALITY[quality].ratio);
    renderer.setSize(W, H);
    makePost();
    label();
  });
  $('help-toggle').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
  $('help-touch').hidden = !isTouch;
  $('help-keys').hidden = isTouch;
  $('hint').textContent = isTouch ? '左下拖曳移動，右邊拖曳轉頭' : '點畫面鎖定滑鼠 · WASD 移動 · Shift 加速 · F 切換飛行';
}

addEventListener('resize', () => {
  W = innerWidth; H = innerHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
  const q = QUALITY[quality];
  post.setSize(Math.round(W * q.ratio), Math.round(H * q.ratio));
});

// -----------------------------------------------------------------------------
// 主迴圈
// -----------------------------------------------------------------------------
const path = createCameraPath(LAYOUT.camera);
const shot = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, shot: '' };
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  const dt = Math.min(0.1, clock.getDelta());
  elapsed += dt;

  if (state.film) {
    state.filmT += dt;
    if (state.filmT >= path.duration) { $('film').click(); }
    else {
      path.sample(state.filmT, shot);
      camera.position.copy(shot.position);
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(shot.target);
      state.yaw = camera.rotation.y; state.pitch = camera.rotation.x;
    }
  } else {
    step(dt);
    camera.rotation.set(state.pitch, state.yaw, 0);
  }
  camera.updateMatrixWorld(true);

  sky.mesh.position.copy(camera.position);
  sky.uniforms.time.value = elapsed;
  for (const [tex, flow] of waterTextures) {
    const ox = flow[0] * elapsed * tex.repeat.x, oy = flow[1] * elapsed * tex.repeat.y;
    tex.offset.set(-(ox - Math.floor(ox)), -(oy - Math.floor(oy)));
  }
  for (const u of animated) u(elapsed);
  audio.update(camera);
  lighting.update(camera);
  post.composer.render(dt);

  const p = camera.position;
  $('coords').textContent = `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)} m`;
  requestAnimationFrame(frame);
}

buildUI();
load()
  .then(() => {
    $('loading').hidden = true;
    $('hud').hidden = false;
    // 提示停留幾秒，或第一次操作就收起
    const hideHint = () => { $('hint').hidden = true; };
    setTimeout(hideHint, 7000);
    addEventListener('keydown', hideHint, { once: true });
    addEventListener('pointerdown', hideHint, { once: true });
    clock.getDelta();
    requestAnimationFrame(frame);
  })
  .catch((e) => {
    console.error(e);
    $('load-step').textContent = `載入失敗：${e && e.message ? e.message : e}。這個場景需要支援 WebGL2 的瀏覽器。`;
  });
