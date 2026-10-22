// 預覽器（共用工具，各分身不得修改）：只載入指定模組，用固定的太陽與天空光拍一張。
// 網址參數：
//   m=structure,facades      要載入的 src 模組（逗號分隔）
//   view=west|southwest|south|southeast|east|north|aerial|portal|rose|kings|stryge|spire|parvis|kf
//   t=27                     view=kf 時使用 layout.camera 在第 t 秒的關鍵點（取最接近的）
//   pos=x,y,z&target=x,y,z&fov=40   自訂機位（覆蓋 view）
//   w=1280&h=720
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LAYOUT } from '../layout.js';
import { materials, variant } from '../materials.js';
import { rng } from '../rng.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1280), H = +(q.get('h') || 720);
const modules = (q.get('m') || '').split(',').filter(Boolean);

const VIEWS = {
  west: { pos: [-95, 8, 0], target: [0, 32, 0], fov: 45 },
  southwest: { pos: [-70, 25, 75], target: [20, 30, 0], fov: 45 },
  south: { pos: [64, 30, 110], target: [64, 30, 0], fov: 50 },
  southeast: { pos: [170, 35, 90], target: [70, 30, 0], fov: 45 },
  east: { pos: [200, 30, 0], target: [80, 30, 0], fov: 45 },
  north: { pos: [64, 30, -110], target: [64, 30, 0], fov: 50 },
  aerial: { pos: [-60, 160, 140], target: [50, 10, 0], fov: 45 },
  portal: { pos: [-14, 3, 0], target: [1.5, 9, 0], fov: 45 },
  rose: { pos: [-16, 30, 3], target: [0, 30.5, 0], fov: 42 },
  kings: { pos: [-13, 18, -3], target: [0, 19.2, 0], fov: 42 },
  stryge: { pos: [-7, 47.5, -26], target: [0, 46.6, -20.5], fov: 38 },
  spire: { pos: [20, 70, 45], target: [66, 60, 0], fov: 45 },
  parvis: { pos: [-120, 30, 60], target: [-50, 0, 0], fov: 55 },
};

function pickView() {
  if (q.get('pos')) {
    const p = q.get('pos').split(',').map(Number), t = (q.get('target') || '0,20,0').split(',').map(Number);
    return { pos: p, target: t, fov: +(q.get('fov') || 45) };
  }
  const v = q.get('view') || 'southwest';
  if (v === 'kf') {
    const t = +(q.get('t') || 0);
    const k = LAYOUT.camera.keyframes.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    return { pos: k.position, target: k.target, fov: k.fovDeg };
  }
  return VIEWS[v] || VIEWS.southwest;
}

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.55, 0.68, 0.85);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.68), 3.2);
  const d = LAYOUT.sun.direction;
  const tgt = new THREE.Vector3(0, 0, 0);
  sun.position.set(d[0] * 300, d[1] * 300, d[2] * 300);
  sun.target.position.copy(tgt);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 1, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(new THREE.Color(0.6, 0.7, 0.9), new THREE.Color(0.35, 0.3, 0.25), 0.9));

  if (!modules.includes('environment')) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), new THREE.MeshStandardMaterial({ color: 0x777066, roughness: 1 }));
    g.rotation.x = -Math.PI / 2; g.position.set(20, -0.02, 0); g.receiveShadow = true;
    scene.add(g);
  }

  const stats = { modules: {}, errors: [] };
  for (const name of modules) {
    const t0 = performance.now();
    try {
      const mod = await import(`/src/${name}.js`);
      const group = mod.build({ layout: LAYOUT, materials, variant, rng });
      if (group.userData.update) group.userData.update(+(q.get('at') || 0)); // 會動的模組：指定時間的姿勢
      group.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
      scene.add(group);
      stats.modules[name] = { buildMs: Math.round(performance.now() - t0) };
    } catch (e) {
      stats.errors.push(`${name}: ${e && e.stack ? e.stack : e}`);
    }
  }

  const v = pickView();
  const cam = new THREE.PerspectiveCamera(v.fov, W / H, 0.2, 3000);
  cam.position.set(...v.pos);
  cam.lookAt(new THREE.Vector3(...v.target));

  const t0 = performance.now();
  renderer.render(scene, cam);
  stats.renderMs = Math.round(performance.now() - t0);
  stats.triangles = renderer.info.render.triangles;
  stats.calls = renderer.info.render.calls;
  window.__stats = stats;
  window.__ready = true;
}
main().catch((e) => { window.__stats = { errors: [String(e && e.stack ? e.stack : e)] }; window.__ready = true; });
