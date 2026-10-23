// 展示影片（layout.showreel）：逐鏡頭算圖 → 交叉淡化合成 MP4
//
//   node tools/render-reel.mjs                         # 4K 30fps，2 條平行算圖線 → out/notre-dame-showreel-4k.mp4（另出 1080p 版）
//   node tools/render-reel.mjs --w 960 --h 540 --out out/reel-preview.mp4
//   node tools/render-reel.mjs --compose-only          # 影格都齊了，只重新合成
//   配樂：先跑 node tools/render-music.mjs（out/showreel-music.wav）；--music 指定別的檔、--no-music 不加
//
// 參數：--w --h（預設 showreel.resolution）、--lanes 平行數（預設 2）、--look（預設 golden）、--msaa（預設 0，4K 不需要）
// 每個鏡頭的影格存在 out/frames/reel-<id>-<w>x<h>@<fps>/，已存在的影格會跳過（斷點續算）。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT } from '../layout.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  args[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
}
const R = LAYOUT.showreel;
const [RW, RH] = R.resolution;
const W = +(args.w || RW), H = +(args.h || RH), FPS = R.fps, X = R.crossfade;
const LANES = +(args.lanes || 2), LOOK = args.look || 'golden', MSAA = args.msaa ?? '0';
const MUSIC = resolve(ROOT, args.music || 'out/showreel-music.wav'); // node tools/render-music.mjs 產生；不存在就輸出無聲影片
const OUT = resolve(ROOT, args.out || (W >= 3840 ? 'out/notre-dame-showreel-4k.mp4' : `out/notre-dame-showreel-${H}p.mp4`));
const dirOf = (s) => resolve(ROOT, `out/frames/reel-${s.id}-${W}x${H}@${FPS}`);
const need = (s) => Math.round(s.dur * FPS);
const have = (s) => (existsSync(dirOf(s)) ? readdirSync(dirOf(s)).filter((f) => /^frame-\d+\.png$/.test(f)).length : 0);

function renderShot(i) {
  return new Promise((ok, fail) => {
    const p = spawn('node', ['tools/render-video.mjs', '--reel', String(i), '--w', String(W), '--h', String(H), '--look', LOOK, '--msaa', String(MSAA), '--no-video'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => process.stdout.write(`[${R.shots[i].id}] ${d}`));
    p.stderr.on('data', (d) => process.stdout.write(`[${R.shots[i].id}] ${d}`));
    p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`shot ${i} exit ${c}`))));
  });
}

if (!args['compose-only']) {
  // 依待算格數分配到各條算圖線（大的先排）
  const queue = R.shots.map((s, i) => ({ i, left: need(s) - have(s) })).filter((j) => j.left > 0).sort((a, b) => b.left - a.left);
  console.log(`${W}×${H} @ ${FPS} · ${R.shots.length} 個鏡頭 · 待算 ${queue.reduce((a, j) => a + j.left, 0)} 格 · ${LANES} 條算圖線`);
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (queue.length) { const j = queue.shift(); await renderShot(j.i); }
  }));
}

const missing = R.shots.filter((s) => have(s) < need(s));
if (missing.length) { console.log(`還缺影格：${missing.map((s) => `${s.id} ${have(s)}/${need(s)}`).join('、')}，先不合成`); process.exit(1); }

// 合成：每個鏡頭一個影像序列輸入，依序 xfade（offset = 目前成片長度 − 交叉淡化長度）
const inputs = R.shots.flatMap((s) => ['-framerate', String(FPS), '-i', `${dirOf(s)}/frame-%05d.png`]);
let chain = '', prev = '[0:v]', len = R.shots[0].dur;
for (let k = 1; k < R.shots.length; k++) {
  const out = k === R.shots.length - 1 ? '[v]' : `[x${k}]`;
  chain += `${prev}[${k}:v]xfade=transition=fade:duration=${X}:offset=${(len - X).toFixed(3)}${out};`;
  len += R.shots[k].dur - X;
  prev = out;
}
chain += '[v]fade=t=out:st=' + (len - 1.2).toFixed(3) + ':d=1.2,format=yuv420p[o]'; // 片尾淡出
mkdirSync(dirname(OUT), { recursive: true });
console.log(`合成 ${len.toFixed(2)} 秒 → ${OUT}`);
const music = existsSync(MUSIC) && !args['no-music'];
const audio = music ? ['-i', MUSIC, '-map', `${R.shots.length}:a`, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'] : [];
console.log(music ? `配樂：${MUSIC}（響度標準化到 -16 LUFS）` : '無配樂');
let r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, ...(music ? ['-i', MUSIC] : []), '-filter_complex', chain, '-map', '[o]', ...audio.slice(2), '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', W >= 3840 ? '17' : '18', '-profile:v', 'high', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);
if (W >= 3840) { // 另出 1080p 版，方便分享
  const small = OUT.replace(/-4k\.mp4$/, '-1080p.mp4');
  r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', OUT, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-c:a', 'copy', '-movflags', '+faststart', small], { stdio: 'inherit' });
  console.log(`1080p → ${small}`);
}
console.log('完成');
