// src/render/lighting.js — 太陽、天空光與陰影（第 6 號：光影鏡頭輸出）
// -----------------------------------------------------------------------------
// 太陽：three/addons 的 CSM（cascaded shadow maps）。
// - 3 層：0–24 m（近景雕刻、衣褶，約 1.2 cm/texel）、24–90 m（約 4.4 cm）、
//   90 m 以外 = 覆蓋整座島的固定陰影（只算一次）。
// - 陰影穩定：CSM 每層的陰影相機中心對齊 texel；另外用一台「固定 fov 與長寬比」
//   的代理相機計算分層，所以 fov 隨鏡頭變化時陰影 texel 大小不變（逐格不閃爍）。
// - 天空光：scene.environment（PMREM 天空，見 sky.js）提供漫射與反射，
//   另加一盞很弱的半球光補地面反彈的暖色。
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';

export function createSunLighting({ scene, camera, sunDirection, color, intensity, mapSize = 4096, splits = [24, 90, 600], fovForShadows = 52, aspect = 16 / 9, staticBounds = null }) {
  const proxy = new THREE.PerspectiveCamera(fovForShadows, aspect, camera.near, camera.far);
  const maxFar = splits[splits.length - 1];
  const csm = new CSM({
    camera: proxy,
    parent: scene,
    cascades: splits.length,
    maxFar,
    mode: 'custom',
    customSplitsCallback: (cascades, near, far, breaks) => { for (const s of splits) breaks.push(s / far); },
    shadowMapSize: mapSize,
    lightDirection: sunDirection.clone().negate(),
    lightIntensity: intensity,
    lightNear: 1,
    lightFar: 1400,
    lightMargin: 320, // 塔高 69 m、太陽仰角 19° → 影長約 200 m，遮擋物要包含在內
  });
  csm.fade = true;
  csm.updateFrustums();
  for (const l of csm.lights) {
    l.color.copy(color);
    const cam = l.shadow.camera;
    const texel = (cam.right - cam.left) / mapSize;
    l.shadow.bias = -0.00015;
    l.shadow.normalBias = texel * 1.4;
    l.name = 'sun';
  }

  // 最遠一層改成「固定」：太陽與建築都不動，所以整座島的遠景陰影只需要算一次。
  // 每格只重算近的兩層（省下約 1/3 的陰影時間）。
  let staticLight = null;
  if (staticBounds) {
    staticLight = csm.lights[csm.lights.length - 1];
    const lightDir = sunDirection.clone().negate();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), lightDir, new THREE.Vector3(0, 1, 0));
    const inv = m.clone().invert();
    const bb = new THREE.Box3();
    const [a, b] = staticBounds;
    for (let i = 0; i < 8; i++) bb.expandByPoint(new THREE.Vector3(i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]).applyMatrix4(inv));
    const half = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2;
    const center = bb.getCenter(new THREE.Vector3());
    center.z = bb.max.z + 50;
    center.applyMatrix4(m);
    const cam = staticLight.shadow.camera;
    Object.assign(cam, { left: -half, right: half, top: half, bottom: -half, near: 1, far: (bb.max.z - bb.min.z) + 100 });
    cam.updateProjectionMatrix();
    staticLight.position.copy(center);
    staticLight.target.position.copy(center).add(lightDir);
    staticLight.shadow.normalBias = (2 * half / mapSize) * 1.4;
    staticLight.shadow.autoUpdate = false;
    staticLight.shadow.needsUpdate = true;
    staticLight.userData.fixed = { position: staticLight.position.clone(), target: staticLight.target.position.clone() };
  }

  const hemi = new THREE.HemisphereLight(new THREE.Color(0.55, 0.66, 0.85), new THREE.Color(0.42, 0.36, 0.28), 0.12);
  hemi.name = 'skyFill';
  scene.add(hemi);

  const prepared = new WeakSet();
  return {
    csm,
    hemi,
    /** 對場景內所有材質掛上 CSM（在第一次 render 前呼叫；新加的物件再呼叫一次即可） */
    setupMaterials(root) {
      root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (prepared.has(m) || m.isShaderMaterial || m.isMeshBasicMaterial) continue;
          csm.setupMaterial(m);
          prepared.add(m);
        }
      });
    },
    /** 每格呼叫：讓陰影分層跟著相機 */
    update(cam) {
      proxy.position.copy(cam.position);
      proxy.quaternion.copy(cam.quaternion);
      proxy.near = cam.near; proxy.far = cam.far;
      proxy.updateMatrixWorld(true);
      csm.update();
      if (staticLight) {
        staticLight.position.copy(staticLight.userData.fixed.position);
        staticLight.target.position.copy(staticLight.userData.fixed.target);
      }
      for (const l of csm.lights) { l.updateMatrixWorld(); l.target.updateMatrixWorld(); }
    },
    /** 場景內容改變（例如新加模組）後呼叫，固定層會重算一次 */
    invalidateStatic() { if (staticLight) staticLight.shadow.needsUpdate = true; },
    texelSizes() {
      return csm.lights.map((l) => +((l.shadow.camera.right - l.shadow.camera.left) / mapSize * 100).toFixed(2));
    },
  };
}
