// src/render/camera-path.js — 鏡頭路線（第 6 號：光影鏡頭輸出）
// -----------------------------------------------------------------------------
// 依 layout.camera.keyframes 產生「時間 → { position, target, fov }」。
//
// - position 與 target 各用一條 centripetal Catmull-Rom 曲線穿過關鍵點。
// - Catmull-Rom 的參數 u 與弧長不成比例，直接用 u 會在關鍵點兩側速度跳動。
//   所以先把每條曲線做弧長參數化，再用「單調三次 Hermite（Fritsch–Carlson）」
//   內插「時間 → 弧長」：在每個關鍵點準時抵達、速度 C1 連續、不倒退；
//   起點與終點速度為 0（緩起緩停）。
// - fov 一樣用單調三次 Hermite 平滑內插。
// 純函式、無 DOM，Node 也能跑（tools 可以拿來檢查路線）。
// -----------------------------------------------------------------------------
import * as THREE from 'three';

/** 單調三次 Hermite 內插（Fritsch–Carlson）。端點斜率預設 0（緩起緩停）。 */
export function monotoneCubic(xs, ys, slope0 = 0, slopeN = 0) {
  const n = xs.length;
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array(n).fill(0);
  m[0] = slope0;
  m[n - 1] = slopeN;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  const f = (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const s = (x - xs[i]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
  f.slopes = m;
  return f;
}

/** 一條穿過 points 的 centripetal Catmull-Rom 曲線，附「時間 → 點」的弧長等速對應 */
function timedCurve(points, times) {
  const n = points.length;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  // 弧長表：每段細分 SUB 份
  const SUB = 400;
  const us = [0], ss = [0];
  const prev = curve.getPoint(0), cur = new THREE.Vector3();
  let acc = 0;
  for (let k = 1; k <= (n - 1) * SUB; k++) {
    const u = k / ((n - 1) * SUB);
    curve.getPoint(u, cur);
    acc += cur.distanceTo(prev);
    prev.copy(cur);
    us.push(u); ss.push(acc);
  }
  const knotS = range(n).map((i) => ss[i * SUB]);
  const sOfT = monotoneCubic(times, knotS, 0, 0);
  const uOfS = (s) => {
    if (s <= 0) return 0;
    if (s >= acc) return 1;
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ss[mid] <= s) lo = mid; else hi = mid; }
    const span = ss[hi] - ss[lo];
    return span > 0 ? us[lo] + (us[hi] - us[lo]) * (s - ss[lo]) / span : us[lo];
  };
  return {
    curve, length: acc, knotS,
    at(t, target = new THREE.Vector3()) { return curve.getPoint(uOfS(sOfT(t)), target); },
    speed(t, dt = 1 / 120) { return (sOfT(t + dt) - sOfT(t - dt)) / (2 * dt); },
  };
}

function range(n) { return Array.from({ length: n }, (_, i) => i); }

/**
 * @param {object} cam  layout.camera
 * @returns {{ duration:number, fps:number, sample(t:number, out?:object):{position:THREE.Vector3,target:THREE.Vector3,fov:number,shot:string}, keyframes:object[] }}
 */
export function createCameraPath(cam) {
  const kfs = cam.keyframes;
  const times = kfs.map((k) => k.t);
  const pos = timedCurve(kfs.map((k) => k.position), times);
  const tgt = timedCurve(kfs.map((k) => k.target), times);
  const fov = monotoneCubic(times, kfs.map((k) => k.fovDeg), 0, 0);
  const shotAt = (t) => {
    let s = '';
    for (const k of kfs) if (k.t <= t + 1e-9 && k.shot) s = k.shot;
    return s;
  };
  return {
    duration: cam.durationSec,
    fps: cam.fps,
    keyframes: kfs,
    position: pos,
    target: tgt,
    sample(t, out = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, shot: '' }) {
      const tt = Math.min(Math.max(t, 0), cam.durationSec);
      pos.at(tt, out.position);
      tgt.at(tt, out.target);
      out.fov = fov(tt);
      out.shot = shotAt(tt);
      return out;
    },
  };
}
