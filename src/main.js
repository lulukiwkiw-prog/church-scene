// src/main.js — 組合場景、光影、鏡頭、逐格算圖（第 6 號：光影鏡頭輸出）
// -----------------------------------------------------------------------------
// 網址參數：
//   render=1            影片模式：固定解析度、無介面，提供 window.__renderFrame(frame)
//   w=1920&h=1080       解析度（render 模式預設 layout.camera.resolution；互動模式預設視窗大小）
//   fps=30              影格率（預設 layout.camera.fps）
//   t=27                互動模式：跳到第 27 秒
//   m=structure,roofs   只載入部分模組（預設全部 5 個）
//   debug=1             加入測試用粗略量體（src/render/debug-scene.js）
//   tone=agx            色調映射改用 AgX（預設 ACES）
//   bloom=0 / msaa=0    關掉 bloom / 多重取樣
//   shadow=2048         陰影貼圖解析度（預設 4096）
//   stress=6            （配 debug=1）加約 6 百萬三角形，量測耗時用
//
// 確定性：一切動畫只由「影格號 / fps」決定；不使用任何真實時間或亂數。
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
import { LOOKS } from './render/looks.js';

const MODULES = ['structure', 'facades', 'roofs', 'sculpture', 'environment', 'actors'];

const q = new URLSearchParams(location.search);
const RENDER = q.get('render') === '1';
const DEBUG = q.get('debug') === '1';
const FPS = +(q.get('fps') || LAYOUT.camera.fps);
const [RW, RH] = LAYOUT.camera.resolution;
let W = +(q.get('w') || (RENDER ? RW : innerWidth));
let H = +(q.get('h') || (RENDER ? RH : innerHeight));
const moduleList = q.get('m') ? q.get('m').split(',').filter(Boolean) : MODULES;

// -----------------------------------------------------------------------------
// 光線與大氣參數（線性 HDR）
// -----------------------------------------------------------------------------
const LOOK = {
  exposure: 0.55,
  sunColor: new THREE.Color(1.0, 0.72, 0.46),   // 仰角 19° 的暖白（偏金）
  sunIntensity: 7.0,
  envIntensity: 0.55,
  skyScale: 0.6,
  sunDisk: 60,
  hazeColor: new THREE.Color(0.62, 0.62, 0.64),
  groundColor: new THREE.Color(0.20, 0.17, 0.13),
  fog: {
    nearColor: new THREE.Color(0.62, 0.55, 0.46),
    farColor: new THREE.Color(0.50, 0.57, 0.68),
    sunColor: new THREE.Color(0.95, 0.70, 0.45),
    density: 0.0016,
    heightFalloff: 0.012,
  },
};

// 光線風格（?look=golden | overcast；沒指定就是 default），定義在 render/looks.js
const PRESET = LOOKS[q.get('look')] || null;
if (PRESET) Object.assign(LOOK, PRESET.look);

const sunDir = new THREE.Vector3(...LAYOUT.sun.direction).normalize();
// ?reel=i：展示影片的第 i 個鏡頭（layout.showreel）；場景時間從 shot.t0 起算
const REEL = q.get('reel') !== null ? LAYOUT.showreel.shots[+q.get('reel')] : null;
const T0 = REEL ? REEL.t0 : 0;
const path = createCameraPath(REEL ? { ...LAYOUT.camera, keyframes: REEL.keyframes, durationSec: REEL.dur, easeEnds: false } : LAYOUT.camera);
const DURATION = path.duration;
const FRAMES = Math.round(DURATION * FPS);

// -----------------------------------------------------------------------------
// renderer / scene
// -----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = q.get('tone') === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = +(q.get('exposure') || LOOK.exposure);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = installAtmosphere({ sunDirection: sunDir, ...LOOK.fog }); // 必須在任何著色器編譯之前

const camera = new THREE.PerspectiveCamera(50, W / H, 0.4, 4000);
scene.add(camera);

const sky = createSky({
  sunDirection: sunDir, skyScale: LOOK.skyScale, sunDiskScale: LOOK.sunDisk,
  hazeColor: LOOK.hazeColor, groundColor: LOOK.groundColor,
  ...(PRESET ? PRESET.sky : {}),
});
scene.add(sky.mesh);
scene.environment = bakeEnvironment(renderer, sky);
scene.environmentIntensity = LOOK.envIntensity;

const lighting = createSunLighting({
  scene, camera, sunDirection: sunDir, color: LOOK.sunColor, intensity: LOOK.sunIntensity,
  mapSize: +(q.get('shadow') || 4096), aspect: W / H,
  // 固定遠景陰影涵蓋的範圍：整座西堤島 + 對岸第一排建築（由 layout 讀）
  staticBounds: [
    [LAYOUT.surroundings.island.x0, 0, LAYOUT.surroundings.island.z0],
    [LAYOUT.surroundings.island.x1, LAYOUT.cathedral.spire.top, Math.max(...LAYOUT.surroundings.buildings.map((b) => b.z1))],
  ],
});

const post = createPost(renderer, scene, camera, W, H, { samples: q.get('msaa') === '0' ? 0 : 4, bloom: q.get('bloom') !== '0' });

// -----------------------------------------------------------------------------
// 建築模組（任何一個丟例外都捕捉並繼續）
// -----------------------------------------------------------------------------
const stats = { modules: {}, errors: [], frames: FRAMES, fps: FPS, duration: DURATION, w: W, h: H };
const waterTextures = new Map(); // texture → flow
const animated = []; // 會動的模組：group.userData.update(t)

async function loadModules() {
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);
  for (const name of moduleList) {
    try {
      const mod = await import(`./${name}.js`);
      const group = mod.build({ layout: LAYOUT, materials, variant, rng });
      if (!group || !group.isObject3D) throw new Error('build() 沒有回傳 Object3D');
      world.add(group);
      if (group.userData.update) animated.push(group.userData.update);
      let tris = 0;
      group.traverse((o) => {
        if (o.isMesh && o.geometry) {
          const g = o.geometry, n = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
          tris += n * (o.isInstancedMesh ? o.count : 1);
        }
      });
      stats.modules[name] = { triangles: Math.round(tris) };
    } catch (e) {
      stats.errors.push(`${name}: ${e && e.stack ? e.stack : e}`);
      console.error(`[module ${name}]`, e);
    }
  }
  if (DEBUG) {
    try {
      const { buildDebugScene } = await import('./render/debug-scene.js');
      world.add(buildDebugScene(LAYOUT, materials));
      // 壓力測試：?debug=1&stress=6 → 加約 600 萬三角形（量測算圖耗時用）
      const stress = +(q.get('stress') || 0);
      if (stress > 0) {
        const geo = new THREE.IcosahedronGeometry(1.2, 40); // 33,620 三角形
        const per = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        const n = Math.round(stress * 1e6 / per);
        const C = LAYOUT.cathedral;
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(geo, i % 2 ? materials.stoneCarved : materials.stoneAshlar);
          const a = (i * 0.6180339887) % 1, b = (i * 0.7548776662) % 1, c = (i * 0.5698402910) % 1;
          m.position.set(-2 + a * (C.totalLength + 2), 1 + c * 45, (b - 0.5) * C.totalWidth);
          world.add(m);
        }
      }
    } catch (e) {
      stats.errors.push(`debug: ${e && e.stack ? e.stack : e}`);
    }
  }
  // 全部 Mesh 投射與接收陰影；收集水面貼圖
  world.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      // variant('water') 是 clone，userData 也一併複製；保險起見名稱以 water 開頭也算
      const flow = (m.userData && m.userData.flow) || (/^water/.test(m.name || '') ? materials.water.userData.flow : null);
      if (flow) for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k]) waterTextures.set(m[k], flow);
    }
  });
  lighting.setupMaterials(world);
}

// -----------------------------------------------------------------------------
// 依時間設定整個場景（唯一的動畫入口）
// -----------------------------------------------------------------------------
const _wp = new THREE.Vector3();
const shot = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, shot: '' };
function setTime(tc) {
  path.sample(tc, shot);
  const t = tc + T0; // 場景時間
  camera.position.copy(shot.position);
  camera.fov = shot.fov;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.lookAt(shot.target);
  camera.updateMatrixWorld(true);

  sky.mesh.position.copy(camera.position);
  sky.uniforms.time.value = t;

  // 水面：normalMap 依影格時間位移（flow 單位：公尺 / 秒；texture offset 單位：平鋪）
  for (const [tex, flow] of waterTextures) {
    const ox = flow[0] * t * tex.repeat.x, oy = flow[1] * t * tex.repeat.y;
    tex.offset.set(-(ox - Math.floor(ox)), -(oy - Math.floor(oy)));
  }

  for (const u of animated) u(t); // 人物與動物（只由影格時間決定）
  // 展示影片：飛過鏡頭前幾公尺內的鴿子或人物會變成一閃而過的巨大色塊，在離鏡頭 6 m 內時先藏起來
  if (REEL) {
    const actors = scene.getObjectByName('actors');
    if (actors) for (const o of actors.children) o.visible = o.getWorldPosition(_wp).distanceTo(camera.position) > 6;
  }
  lighting.update(camera);
}

renderer.info.autoReset = false; // 統計整格（陰影 + 主畫面 + 後製）的三角形與 draw call
function renderAt(t) {
  setTime(t);
  renderer.info.reset();
  post.composer.render(0);
}

// -----------------------------------------------------------------------------
// 啟動
// -----------------------------------------------------------------------------
async function main() {
  await loadModules();
  setTime(0);
  renderer.compile(scene, camera);
  if (RENDER) {
    const px = new Uint8Array(4);
    window.__renderFrame = (frame) => {
      const t = frame / FPS;
      renderAt(t);
      // 讀回 1 個像素，強制等 GPU（SwiftShader）真的畫完，耗時才準
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { frame, t, shot: shot.shot, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    };
    renderAt(0);
    stats.triangles = renderer.info.render.triangles;
    stats.calls = renderer.info.render.calls;
    stats.shadowTexelCm = lighting.texelSizes();
    // 除錯：畫面座標（0–1）射線，回傳打到的物件名稱鏈
    window.__pick = (nx, ny) => {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), camera);
      return rc.intersectObjects(scene.children, true).slice(0, 3).map((h) => {
        const names = []; for (let o = h.object; o; o = o.parent) if (o.name) names.push(o.name);
        return { d: +h.distance.toFixed(2), names: names.join(' < '), type: h.object.type };
      });
    };
    window.__stats = stats;
    window.__ready = true;
    return;
  }
  setupUI();
}

function setupUI() {
  const ui = document.getElementById('ui');
  ui.hidden = false;
  const slider = document.getElementById('time');
  const label = document.getElementById('label');
  const play = document.getElementById('play');
  slider.max = String(FRAMES - 1);
  let frame = Math.round(Math.min(Math.max(+(q.get('t') || 0), 0), DURATION) * FPS);
  frame = Math.min(frame, FRAMES - 1);
  let playing = false;
  const draw = () => {
    const t = frame / FPS;
    renderAt(t);
    slider.value = String(frame);
    label.textContent = `${t.toFixed(2)} s  ·  影格 ${frame}/${FRAMES - 1}  ·  ${shot.shot}`;
  };
  slider.addEventListener('input', () => { frame = +slider.value; draw(); });
  play.addEventListener('click', () => { playing = !playing; play.textContent = playing ? '❚❚' : '▶'; if (playing) tick(); });
  // 播放：每次畫面更新前進一格（只用影格號，不用時間戳；慢機器上就是慢動作）
  const tick = () => {
    if (!playing) return;
    frame = (frame + 1) % FRAMES;
    draw();
    requestAnimationFrame(tick);
  };
  addEventListener('keydown', (e) => {
    if (e.key === ' ') { play.click(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { frame = Math.min(FRAMES - 1, frame + (e.shiftKey ? FPS : 1)); draw(); }
    if (e.key === 'ArrowLeft') { frame = Math.max(0, frame - (e.shiftKey ? FPS : 1)); draw(); }
  });
  addEventListener('resize', () => {
    if (q.get('w')) return;
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H);
    post.setSize(W, H);
    draw();
  });
  for (const k of LAYOUT.camera.keyframes) {
    const b = document.createElement('button');
    b.textContent = String(k.t);
    b.title = k.shot || '';
    b.addEventListener('click', () => { frame = Math.min(FRAMES - 1, Math.round(k.t * FPS)); draw(); });
    document.getElementById('kfs').appendChild(b);
  }
  draw();
  window.__stats = stats;
  window.__ready = true;
}

main().catch((e) => {
  stats.errors.push(`main: ${e && e.stack ? e.stack : e}`);
  console.error(e);
  window.__stats = stats;
  window.__ready = true;
});
