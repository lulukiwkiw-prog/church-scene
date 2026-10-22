// 產生可以獨立部署的網頁（不依賴 Claude、不依賴外部 CDN 的 three.js）。執行：npm run site
//
// 產出：
//   index.html              完整的 HTML 文件（由 explore.html 的內容加上 <head>、本機 importmap 產生）
//   vendor/three/…          three.js 與用到的 addons（從 node_modules 複製，提交進 git）
//   dist/                   只含執行時需要的檔案，可以整個資料夾丟到任何靜態主機
//   out/notre-dame-site.zip dist 的壓縮檔（Netlify Drop、Cloudflare Pages 直接上傳用）
//
// GitHub Pages：Settings → Pages → Deploy from a branch → 選分支與 / (root)，
// 網址會是 https://<帳號>.github.io/<repo>/
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_DIR = join(ROOT, 'node_modules/three');
const VENDOR = join(ROOT, 'vendor/three');
const DIST = join(ROOT, 'dist');
const rel = (p) => relative(ROOT, p).split('\\').join('/');

// ---------- 1. 從 explore.html 產生 index.html ----------
const fragment = readFileSync(join(ROOT, 'explore.html'), 'utf8');
const title = /<title>([^<]*)<\/title>/.exec(fragment)[1];
let body = fragment
  .replace(/<title>[^<]*<\/title>\n?/, '')
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
const description = '在 2019 年火災前的巴黎聖母院與前廣場自由飛行：所有建築、雕像、角色、天空與聲音都由程式在瀏覽器即時生成，沒有任何 3D 模型、貼圖或照片。';
const importmap = `<script type="importmap">
{ "imports": { "three": "./vendor/three/build/three.module.min.js", "three/addons/": "./vendor/three/addons/" } }
</script>`;
// 把 fragment 裡屬於 <head> 的標籤（字型連結、樣式）移進 <head>；importmap 放在 module script 之前
const headTags = [];
let rest = body;
for (const re of [/<link rel="preconnect"[^>]*>\n?/g, /<link rel="stylesheet"[^>]*>\n?/g, /<style>[\s\S]*?<\/style>\n?/g]) {
  rest = rest.replace(re, (m) => { headTags.push(m.trim()); return ''; });
}
const page = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="Notre-Dame Explorer｜程式生成的巴黎聖母院">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#1c1813">
<link rel="icon" href="data:,">
<style>html, body { margin: 0; height: 100%; } body { overflow: hidden; }</style>
${headTags.join('\n')}
${importmap}
</head>
<body>
${rest.trim()}
</body>
</html>
`;
writeFileSync(join(ROOT, 'index.html'), page);

// ---------- 2. 找出執行時用到的原始碼（從 src/explore.js 往下追 import）----------
const specRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const sources = new Set();
const addons = new Set();
function walk(file) {
  const abs = normalize(file);
  if (sources.has(abs)) return;
  sources.add(abs);
  const text = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of text.matchAll(specRe)) {
    const spec = m[1] || m[2] || m[3];
    if (spec.startsWith('.')) walk(resolve(dirname(abs), spec));
    else if (spec.startsWith('three/addons/')) addons.add(spec.slice('three/addons/'.length));
  }
}
walk(join(ROOT, 'src/explore.js'));

// ---------- 3. 複製 three 與用到的 addons（同樣往下追 addons 之間的 import）----------
const JSM = join(THREE_DIR, 'examples/jsm');
function walkAddon(name) {
  const file = join(JSM, name);
  const out = join(VENDOR, 'addons', name);
  if (existsSync(out) && addons.has(`done:${name}`)) return;
  addons.add(`done:${name}`);
  mkdirSync(dirname(out), { recursive: true });
  cpSync(file, out);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    const spec = m[1] || m[2] || m[3];
    if (spec.startsWith('.')) walkAddon(rel(resolve(dirname(file), spec)).replace(/^node_modules\/three\/examples\/jsm\//, ''));
    else if (spec.startsWith('three/addons/')) walkAddon(spec.slice('three/addons/'.length));
  }
}
rmSync(VENDOR, { recursive: true, force: true });
mkdirSync(join(VENDOR, 'build'), { recursive: true });
cpSync(join(THREE_DIR, 'build/three.module.min.js'), join(VENDOR, 'build/three.module.min.js'));
cpSync(join(THREE_DIR, 'LICENSE'), join(VENDOR, 'LICENSE'));
for (const a of [...addons].filter((x) => !x.startsWith('done:'))) walkAddon(a);

// ---------- 4. 組出 dist/ 與 zip ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
const copy = (from, to = from) => { mkdirSync(dirname(join(DIST, to)), { recursive: true }); cpSync(join(ROOT, from), join(DIST, to), { recursive: true }); };
copy('index.html');
copy('vendor');
for (const s of sources) copy(rel(s));
writeFileSync(join(DIST, '.nojekyll'), '');
writeFileSync(join(DIST, 'README.txt'), 'Notre-Dame Explorer\n把整個資料夾放到任何靜態網站主機（Netlify、Cloudflare Pages、GitHub Pages…）即可，不需要伺服器程式。\n注意：不能直接用檔案總管雙擊 index.html 開啟（瀏覽器不允許 file:// 載入 ES module），請透過網址開啟。\n本機測試：在這個資料夾執行 `python3 -m http.server`，再開 http://localhost:8000\n');
mkdirSync(join(ROOT, 'out'), { recursive: true });
const zip = join(ROOT, 'out/notre-dame-site.zip');
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: DIST });

const size = (p) => (statSync(p).size / 1048576).toFixed(2);
console.log(`index.html 已產生；vendor/three ${[...addons].filter((x) => x.startsWith('done:')).length} 個 addon；dist 內 ${sources.size} 個原始檔`);
console.log(`zip: ${rel(zip)}（${size(zip)} MB）`);
