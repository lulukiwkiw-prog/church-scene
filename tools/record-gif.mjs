// 錄製互動網頁的實際操作畫面（拖曳轉視角＋按 W 前進）：
//   node tools/record-gif.mjs [--out out/explore.gif] [--frames 125] [--w 1280 --h 720]
// 用假時鐘讓每個畫格固定 0.1 s，所以軟體渲染再慢，錄出來的動作速度仍是真的（10 fps）。
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startServer } from './server.mjs';
import { launch } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = args.out || 'out/explore.gif';
const N = +(args.frames || 125), w = +(args.w || 1280), h = +(args.h || 720);
const dir = 'out/gifframes';
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });

const { server, port } = await startServer();
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), now = performance.now.bind(performance);
    let manual = false, fake = 0, queue = [];
    window.requestAnimationFrame = (cb) => (manual ? (queue.push(cb), 0) : raf(cb));
    performance.now = () => (manual ? fake : now());
    window.__manual = () => { fake = now(); manual = true; };
    window.__step = () => { fake += 100; const q = queue; queue = []; q.forEach((cb) => cb(fake)); };
  });
  await page.goto(`http://127.0.0.1:${port}/${args.page || "index.html"}`);
  await page.waitForFunction(() => document.getElementById('hud') && !document.getElementById('hud').hidden, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  if (await page.locator('#help').isVisible()) await page.click('#help-close');
  await page.evaluate(() => window.__manual());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__step());

  // 動作腳本：每個畫格 0.1 s
  const cx = w / 2, cy = h / 2;
  let mx = cx, my = cy, dragging = false;
  const drag = async (dx, dy) => {
    if (!dragging) { await page.mouse.move(mx, my); await page.mouse.down(); dragging = true; }
    mx += dx; my += dy; await page.mouse.move(mx, my);
  };
  const release = async () => { if (dragging) { await page.mouse.up(); dragging = false; mx = cx; my = cy; } };
  let walking = false;
  for (let f = 0; f < N; f++) {
    // 0–1.5 s 靜止；1.5–4.5 s 往右環顧；4.5–6 s 回正並抬頭看塔；4 s 起前進
    if (f >= 15 && f < 45) await drag(10, 0);
    else if (f >= 45 && f < 75) await drag(-9, f < 60 ? -1.5 : 1.2);
    else if (f >= 75 && f < 95) await drag(-6, 0.5);
    else await release();
    if (f === 40 && !walking) { await page.keyboard.down('KeyW'); walking = true; }
    if (f === 105 && walking) { await page.keyboard.up('KeyW'); walking = false; }
    await page.evaluate(() => window.__step());
    await page.waitForTimeout(30);
    await page.screenshot({ path: `${dir}/f${String(f).padStart(3, '0')}.png` });
    if (f % 20 === 0) console.log('frame', f);
  }
  await release();
} finally {
  await browser.close();
  server.close();
}
mkdirSync('out', { recursive: true });
const vf = 'fps=10,scale=720:-1:flags=lanczos';
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '10', '-i', `${dir}/f%03d.png`, '-vf', `${vf},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', out]);
console.log('done', out);
