// 逐格算圖 → PNG → MP4（第 6 號：光影鏡頭輸出）
//
//   node tools/render-video.mjs                                   # 完整 70 秒 1920×1080 30fps → out/notre-dame.mp4
//   node tools/render-video.mjs --w 640 --h 360 --every 30 --out out/preview.mp4
//   node tools/render-video.mjs --from 810 --to 900               # 只算第 810–899 格（可分批、可多台機器分段）
//   node tools/render-video.mjs --stills 0,10,27 --w 960 --h 540  # 只拍指定秒數的單張 → out/render-kf-<t>.png
//
// 參數：
//   --w --h --fps          解析度與影格率（預設 layout.camera）
//   --from --to            影格範圍 [from, to)（預設全部）
//   --every N              只算每第 N 格（預覽用；影片仍保持原長度）
//   --out                  輸出 MP4（預設 out/notre-dame.mp4）
//   --frames DIR           影格資料夾（預設 out/frames/<w>x<h>@<fps>）
//   --crf 16 --preset slow H.264 參數
//   --stills 0,10,27       拍指定秒數的單張（加 --stills kf 代表所有關鍵點）
//   --no-video             只算影格不合成
//   --debug                加入測試量體（index.html?debug=1）
//   --m a,b                只載入部分模組
//   其他參數（--tone --exposure --bloom --msaa --shadow）原樣傳給 index.html
// 已存在的影格會跳過（斷點續算）。每格印出耗時與預估剩餘時間。
import { mkdirSync, existsSync, statSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launch } from './browser.mjs';
import { LAYOUT } from '../layout.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  args[k] = v;
}

const [RW, RH] = LAYOUT.camera.resolution;
const W = +(args.w || RW), H = +(args.h || RH);
const FPS = +(args.fps || LAYOUT.camera.fps);
const TOTAL = Math.round(LAYOUT.camera.durationSec * FPS);
const FROM = Math.max(0, +(args.from || 0));
const TO = Math.min(TOTAL, +(args.to || TOTAL));
const EVERY = Math.max(1, +(args.every || 1));
const OUT = resolve(ROOT, args.out || 'out/notre-dame.mp4');
const FRAMES_DIR = resolve(ROOT, args.frames || `out/frames/${W}x${H}@${FPS}${args.debug ? '-debug' : ''}`);
const pad = (n) => String(n).padStart(5, '0');
const framePath = (f) => join(FRAMES_DIR, `frame-${pad(f)}.png`);
const fmt = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${s.toFixed(1)}s`);

const qs = new URLSearchParams({ render: '1', w: String(W), h: String(H), fps: String(FPS) });
if (args.debug) qs.set('debug', '1');
for (const k of ['m', 'tone', 'exposure', 'bloom', 'msaa', 'shadow', 'stress']) if (args[k] !== undefined && args[k] !== true) qs.set(k, args[k]);

// 要算的影格
let jobs = [];
let stills = null;
if (args.stills) {
  const ts = args.stills === 'kf' ? LAYOUT.camera.keyframes.map((k) => k.t) : String(args.stills).split(',').map(Number);
  stills = ts.map((t) => ({ t, frame: Math.min(TOTAL - 1, Math.round(t * FPS)), path: resolve(ROOT, `${args['stills-prefix'] || 'out/render-kf-'}${t}.png`) }));
  jobs = stills.map((s) => s.frame);
} else {
  for (let f = FROM; f < TO; f += EVERY) jobs.push(f);
}
const todo = stills ? jobs : jobs.filter((f) => !(existsSync(framePath(f)) && statSync(framePath(f)).size > 0));
mkdirSync(FRAMES_DIR, { recursive: true });
console.log(`${W}×${H} @ ${FPS} fps · 影格 ${FROM}–${TO - 1} 每 ${EVERY} 格 · 共 ${jobs.length} 格，已完成 ${jobs.length - todo.length}，待算 ${todo.length}`);
console.log(`影格：${FRAMES_DIR}`);

const { server, port } = await startServer();
let browser = null, page = null;

async function openPage() {
  if (browser) await browser.close().catch(() => {});
  browser = await launch();
  page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [browser] ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html?${qs}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 0, polling: 500 });
  const st = await page.evaluate(() => window.__stats);
  console.log(`場景就緒 ${fmt((Date.now() - t0) / 1000)} · 三角形 ${st.triangles?.toLocaleString()} · draw calls ${st.calls} · 陰影 texel(cm) ${JSON.stringify(st.shadowTexelCm)}`);
  console.log(`  模組 ${JSON.stringify(st.modules)}`);
  if (st.errors?.length) console.log(`  錯誤：\n    ${st.errors.join('\n    ')}`);
}

try {
  if (todo.length) await openPage();
  const times = [];
  for (let i = 0; i < todo.length; i++) {
    const f = todo[i];
    const dest = stills ? stills.find((s) => s.frame === f && !s.done).path : framePath(f);
    if (stills) stills.find((s) => s.frame === f && !s.done).done = true;
    let attempt = 0;
    for (;;) {
      try {
        const t0 = Date.now();
        const info = await page.evaluate((fr) => window.__renderFrame(fr), f);
        const t1 = Date.now();
        mkdirSync(dirname(dest), { recursive: true });
        const tmp = `${dest}.tmp`;
        await page.screenshot({ path: tmp, type: 'png', clip: { x: 0, y: 0, width: W, height: H }, timeout: 0 });
        renameSync(tmp, dest);
        const t2 = Date.now();
        const sec = (t2 - t0) / 1000;
        times.push(sec);
        const recent = times.slice(-20);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const left = (todo.length - i - 1) * avg;
        console.log(`影格 ${pad(f)} (t=${(f / FPS).toFixed(2)}s) 算圖 ${((t1 - t0) / 1000).toFixed(2)}s + 擷取 ${((t2 - t1) / 1000).toFixed(2)}s = ${sec.toFixed(2)}s · ${i + 1}/${todo.length} · 剩餘約 ${fmt(left)}${info.shot ? ` · ${info.shot}` : ''}${stills ? ` → ${dest}` : ''}`);
        break;
      } catch (e) {
        attempt++;
        console.log(`影格 ${f} 失敗（第 ${attempt} 次）：${e.message}`);
        if (attempt >= 3) throw e;
        await openPage();
      }
    }
  }
  if (times.length) console.log(`平均每格 ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)}s`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}

// 合成 MP4
if (!stills && !args['no-video']) {
  const have = jobs.filter((f) => existsSync(framePath(f)));
  if (have.length !== jobs.length) {
    console.log(`還缺 ${jobs.length - have.length} 格，先不合成影片`);
  } else {
    // concat 清單：every > 1 時每張持續 every 格，影片長度不變
    const list = join(FRAMES_DIR, `list-${FROM}-${TO}-${EVERY}.txt`);
    const dur = EVERY / FPS;
    writeFileSync(list, have.map((f) => `file '${framePath(f)}'\nduration ${dur}`).join('\n') + `\nfile '${framePath(have[have.length - 1])}'\n`);
    mkdirSync(dirname(OUT), { recursive: true });
    const ff = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-r', String(FPS), '-c:v', 'libx264', '-preset', String(args.preset || 'slow'), '-crf', String(args.crf || 16),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT];
    console.log(`ffmpeg ${ff.join(' ')}`);
    const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
    if (r.status !== 0) { console.log('ffmpeg 失敗'); process.exitCode = 1; } else console.log(`完成：${OUT}`);
  }
}
