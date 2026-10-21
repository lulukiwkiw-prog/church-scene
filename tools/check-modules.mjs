// 檢查 src 模組（共用工具）：
//   node tools/check-modules.mjs [structure facades ...]
// - 不得使用 Math.random / Date.now / performance.now / new Date（影片每次要一模一樣）
// - 建築模組不得自建材質、不得加燈光
// - 同樣輸入 build 兩次，幾何必須逐位元相同（固定種子）
// - 三角形數不得超過預算
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { LAYOUT } from '../layout.js';
import { materials, variant } from '../materials.js';
import { rng } from '../rng.js';

export const BUDGETS = {
  structure: 400_000,
  facades: 1_500_000,
  roofs: 600_000,
  sculpture: 2_500_000,
  environment: 1_000_000,
};
const BUILD_MODULES = Object.keys(BUDGETS);
const names = process.argv.slice(2).length ? process.argv.slice(2) : BUILD_MODULES;

let failed = false;
const fail = (m) => { failed = true; console.log(`  ✗ ${m}`); };

function sourceChecks(name) {
  const src = readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of ['Math.random', 'Date.now', 'performance.now', 'new Date']) if (src.includes(bad)) fail(`${name}: 不可使用 ${bad}`);
  if (/new\s+THREE\.\w*Material\s*\(/.test(src)) fail(`${name}: 不可自建材質，請用 materials.js`);
  if (/new\s+THREE\.\w*Light\s*\(/.test(src)) fail(`${name}: 不可自建燈光`);
  if (/materials\.\w+\.clone\(|\.material\.clone\(|variant\([^)]*\)\.clone\(/.test(src)) fail(`${name}: 不可 clone 材質，請用 variant()`);
}

function digest(group) {
  const h = createHash('sha1');
  let tris = 0;
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (o.isLight) fail(`${group.name}: 含有燈光 ${o.type}`);
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    const g = o.geometry;
    h.update(o.type); h.update(new Float32Array(o.matrixWorld.elements));
    for (const key of Object.keys(g.attributes).sort()) { h.update(key); h.update(new Uint8Array(g.attributes[key].array.buffer)); }
    if (g.index) h.update(new Uint8Array(g.index.array.buffer));
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) h.update(m.name || '?');
    if (o.isInstancedMesh) h.update(new Uint8Array(o.instanceMatrix.array.buffer));
    if (o.isMesh) {
      const per = (g.index ? g.index.count : g.attributes.position.count) / 3;
      tris += per * (o.isInstancedMesh ? o.count : 1);
    }
  });
  return { hash: h.digest('hex'), tris };
}

for (const name of names) {
  console.log(`● ${name}`);
  sourceChecks(name);
  const mod = await import(`../src/${name}.js`);
  const t0 = process.hrtime.bigint();
  const a = mod.build({ layout: LAYOUT, materials, variant, rng });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const b = mod.build({ layout: LAYOUT, materials, variant, rng });
  if (!(a instanceof THREE.Group)) { fail(`${name}: build() 必須回傳 THREE.Group`); continue; }
  const da = digest(a), db = digest(b);
  if (da.hash !== db.hash) fail(`${name}: 兩次 build 結果不同（隨機數沒有固定種子？）`);
  const budget = BUDGETS[name];
  if (budget && da.tris > budget) fail(`${name}: 三角形 ${da.tris.toLocaleString()} 超過預算 ${budget.toLocaleString()}`);
  console.log(`  三角形 ${Math.round(da.tris).toLocaleString()} / ${budget ? budget.toLocaleString() : '-'}，build ${ms.toFixed(0)} ms，hash ${da.hash.slice(0, 10)}`);
}
if (failed) { console.log('檢查未通過'); process.exit(1); }
console.log('模組檢查通過');
