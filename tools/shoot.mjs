// 拍預覽圖（共用工具）：
//   node tools/shoot.mjs --m structure,facades --view west --out out/structure-west.png [--w 1280 --h 720]
//   node tools/shoot.mjs --m structure --pos -40,10,20 --target 0,20,0 --fov 40 --out out/x.png
// 會印出 build 時間、三角形數、draw call 與錯誤。
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { startServer } from './server.mjs';
import { launch } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = args.out || `out/${(args.m || 'none').replace(/,/g, '+')}-${args.view || 'view'}.png`;
const w = +(args.w || 1280), h = +(args.h || 720);
const qs = new URLSearchParams();
for (const k of ['m', 'view', 't', 'pos', 'target', 'fov']) if (args[k] !== undefined) qs.set(k, args[k]);
qs.set('w', w); qs.set('h', h);

const { server, port } = await startServer();
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/tools/preview.html?${qs}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  const stats = await page.evaluate(() => window.__stats);
  mkdirSync(dirname(out), { recursive: true });
  await page.locator('canvas').screenshot({ path: out });
  console.log(JSON.stringify({ out, ...stats }, null, 1));
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  if (stats.errors && stats.errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
