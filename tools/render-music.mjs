// 影片配樂：離線混出音樂＋鐘聲 → WAV
//   node tools/render-music.mjs [--sec 60] [--out out/showreel-music.wav]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launch } from './browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const SEC = +arg('sec', 60), OUT = resolve(ROOT, arg('out', 'out/showreel-music.wav'));
const { server, port } = await startServer();
const browser = await launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/music.html`);
  await page.waitForFunction(() => window.__ok === true);
  const { sr, b64 } = await page.evaluate((s) => window.__mix(s), SEC);
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.concat([h, pcm]));
  console.log(`${SEC} 秒 ${sr} Hz → ${OUT}`);
} finally { await browser.close(); server.close(); }
