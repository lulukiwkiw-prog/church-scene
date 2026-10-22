// src/audio.js — 互動版的聲音（全部即時合成，沒有任何錄音檔）
// -----------------------------------------------------------------------------
// - 鐘聲：清脆柔和的小鐘（加法合成），D 大調八口鐘由高到低
//   輪敲（rounds），最後一口較低的鐘敲三下。聲源放在兩座鐘樓（PannerNode），
//   走遠會變小、轉頭會換邊。
// - 配樂：原創的慢板巴薩諾瓦（D 大調，每分鐘 92 拍）：尼龍弦吉他
//   （Karplus-Strong 撥弦合成）彈切分和弦、低音提琴、輕刷鼓與邊擊，旋律是無歌詞的
//   輕柔哼唱聲（共振峰合成的「嗚」母音）。鐘聲在音樂第 5 小節輕輕疊入當背景。
// - 環境音：遠處城市的輕微底噪、鴿群的咕咕聲（放在鴿群位置）。
// 瀏覽器規定聲音只能在使用者點擊後開始：start() 必須在 click 事件裡呼叫。
// 音樂與鐘聲在開聲音時預先合成成音檔，由音訊執行緒循環播放（畫面忙碌也不卡頓）。
// -----------------------------------------------------------------------------

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const n = (name) => {
  const m = /^([A-G])(#|b?)(\d)$/.exec(name);
  return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};

// ---------------- 樂譜（原創）----------------
// 吉他和弦（含根音，由低到高）；低音提琴另外彈根音與五度
const CH = {
  Dmaj7: ['D3', 'A3', 'C#4', 'F#4'], Em7: ['E3', 'B3', 'D4', 'G4'], A7: ['A2', 'G3', 'C#4', 'E4'],
  'F#m7': ['F#2', 'E3', 'A3', 'C#4'], B7: ['B2', 'A3', 'D#4', 'F#4'], Gmaj7: ['G2', 'F#3', 'B3', 'D4'],
  Fdim7: ['F2', 'D3', 'G#3', 'B3'], A7sus: ['A2', 'G3', 'D4', 'E4'],
};
const BASS = { Dmaj7: ['D2', 'A2'], Em7: ['E2', 'B2'], A7: ['A2', 'E2'], 'F#m7': ['F#2', 'C#3'], B7: ['B2', 'F#2'], Gmaj7: ['G2', 'D3'], Fdim7: ['F2', 'B2'], A7sus: ['A2', 'E2'] };
// 每小節：[和弦, 旋律 [[拍, 長度（拍）, 音]]]（4/4 拍）
const SCORE = [
  ['Dmaj7', [[0, 1.5, 'A4'], [1.5, 0.5, 'C#5'], [2, 2, 'F#5']]],
  ['Dmaj7', [[0.5, 1, 'E5'], [1.5, 0.5, 'D5'], [2, 2, 'C#5']]],
  ['Em7', [[0, 1.5, 'B4'], [1.5, 0.5, 'D5'], [2, 1.5, 'G5'], [3.5, 0.5, 'F#5']]],
  ['A7', [[0, 3, 'E5'], [3, 0.5, 'G5'], [3.5, 0.5, 'E5']]],
  ['F#m7', [[0, 1.5, 'C#5'], [1.5, 0.5, 'E5'], [2, 2, 'A5']]],
  ['B7', [[0.5, 1, 'G5'], [1.5, 0.5, 'F#5'], [2, 2, 'D#5']]],
  ['Em7', [[0, 1.5, 'G5'], [1.5, 0.5, 'F#5'], [2, 1, 'E5'], [3, 1, 'D5']]],
  ['A7', [[0, 3.5, 'C#5']]],
  ['Dmaj7', [[0, 1.5, 'A4'], [1.5, 0.5, 'C#5'], [2, 2, 'F#5']]],
  ['Gmaj7', [[0.5, 1, 'B5'], [1.5, 0.5, 'A5'], [2, 2, 'F#5']]],
  ['F#m7', [[0, 1.5, 'E5'], [1.5, 0.5, 'F#5'], [2, 1.5, 'A5'], [3.5, 0.5, 'E5']]],
  ['Fdim7', [[0, 2, 'D5'], [2, 1, 'B4'], [3, 1, 'G#4']]],
  ['Em7', [[0, 1.5, 'G4'], [1.5, 0.5, 'B4'], [2, 2, 'D5']]],
  ['A7sus', [[0, 1.5, 'E5'], [1.5, 0.5, 'D5'], [2, 1, 'C#5'], [3, 1, 'B4']]],
  ['Dmaj7', [[0, 3, 'D5']]],
  ['A7', [[3, 0.5, 'A4'], [3.5, 0.5, 'B4']]],
].map(([c, mel]) => ({ chord: CH[c].map(n), bass: BASS[c].map(n), mel: mel.map(([at, d, p]) => [at, d, n(p)]) }));
const BPM = 92, BEAT = 60 / BPM, BAR = 4 * BEAT, SIX = BEAT / 4;
const PEAL_BAR = 4; // 鐘聲在第 5 小節加入（約第 10.4 秒）
// 鐘聲音量（版本 2：原本較大聲的音量；版本 1 為 0.065 / 0.11）
const BELL_GAIN = 0.16, TOLL_GAIN = 0.28;
const MUSIC_LEVEL = 0.7; // 背景音樂音量 70%
// 巴薩諾瓦吉他節奏（以十六分音符為格，兩小節一組）：和弦撥奏與拇指低音
const GUITAR_HITS = [[0, 3, 6, 10, 13], [2, 6, 10, 12]];
const THUMB = [0, 6, 8, 14];

// 清脆的鐘：D 大調八口鐘（由高到低輪敲），最後一口低鐘敲三下
// 鐘的原本音高（定案：版本 2，主旋律音量不變）；高八度版本為 D7…D6、A5
const PEAL = ['D6', 'C#6', 'B5', 'A5', 'G5', 'F#5', 'E5', 'D5'].map((x) => mtof(n(x)));
const TOLL = mtof(n('A4'));
// 分音：[頻率倍數（相對 strike 音）, 相對音量, 衰減秒數]；高分音較強 → 清亮
const PARTIALS = [[0.5, 0.2, 3.4], [1, 0.6, 2.8], [1.2, 0.2, 2.1], [1.5, 0.12, 1.8], [2, 0.3, 1.6], [2.51, 0.12, 1.1], [2.66, 0.09, 1.0], [3.01, 0.1, 0.8], [4.16, 0.05, 0.55], [5.43, 0.03, 0.4]];

export function createAudio({ layout }) {
  const W = layout.cathedral.westFront;
  const north = W.towers.find((t) => t.id === 'northTower'), south = W.towers.find((t) => t.id === 'southTower');
  const towerPos = (t) => [(t.x0 + t.x1) / 2, (t.belfry.yBottom + t.belfry.yTop) / 2, (t.z0 + t.z1) / 2];
  const flock = layout.actors.pigeons[0].center;

  let ctx = null, master, musicBus, bellBus, ambBus, timer = null;
  let musicOn = true;
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; // 只用於演奏的細微人性化

  function panner(pos, ref = 25, roll = 0.7) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 2000;
    p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
    return p;
  }

  // ---------------- 鐘 ----------------
  function bell(f, when, gain, dest) {
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(dest);
    for (const [ratio, amp, decay] of PARTIALS) {
      for (const det of ratio === 1 ? [1, 1.0012] : [1]) { // 主音兩個略分離的頻率 → 輕微的閃爍感
        const o = ctx.createOscillator();
        o.frequency.value = f * ratio * det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(amp, when + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
        o.connect(g).connect(out);
        o.start(when);
        o.stop(when + decay + 0.05);
      }
    }
    // 金屬敲擊聲（短而亮）
    const len = Math.floor(ctx.sampleRate * 0.03), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = Math.min(9000, f * 4);
    const g = ctx.createGain(); g.gain.value = 0.12;
    src.connect(hp).connect(g).connect(out);
    src.start(when);
  }
  function peal(start, np, sp) {
    let t = start;
    for (let round = 0; round < 4; round++) {
      PEAL.forEach((f, i) => {
        bell(f, t + (rand() - 0.5) * 0.02, BELL_GAIN, i % 2 ? sp : np); // 兩座塔交替，聽起來左右呼應
        t += BEAT / 2; // 對齊配樂的八分音符
      });
      t += BEAT / 2; // 每輪之間的空拍
    }
    t += BEAT;
    for (let k = 0; k < 3; k++) { bell(TOLL, t, TOLL_GAIN, sp); t += 3 * BEAT; }
    return t;
  }

  // ---------------- 尼龍弦吉他（Karplus-Strong，預先算好每個音）----------------
  const plucks = new Map();
  function pluckBuffer(midi, bright) {
    const key = `${midi}|${bright}`;
    if (plucks.has(key)) return plucks.get(key);
    const sr = ctx.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 2.6), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    // 初始：雜訊經過平滑（尼龍弦比鋼弦柔）
    let prev = 0;
    for (let i = 0; i < N; i++) { const w = rand() * 2 - 1; prev = prev + (w - prev) * bright; d[i] = prev; }
    let mean = 0; for (let i = 0; i < N; i++) mean += d[i] / N;
    for (let i = 0; i < N; i++) d[i] -= mean; // 去掉直流成分，低音弦才不會「砰」一聲
    const loss = 0.4985 - 0.0006 * Math.max(0, (midi - 60) / 12);
    for (let i = N; i < len; i++) d[i] = loss * (d[i - N] + d[i - N + 1]);
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= peak || 1;
    plucks.set(key, buf);
    return buf;
  }
  function guitar(midi, when, vel, dest, bright = 0.45, dur = 2.4) {
    const src = ctx.createBufferSource(); src.buffer = pluckBuffer(midi, bright);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, when);
    g.gain.setTargetAtTime(0, when + dur, 0.08);
    src.connect(hp).connect(lp).connect(g).connect(dest);
    src.start(when); src.stop(when + dur + 0.5);
  }
  // 低音提琴：柔和的正弦＋三角波撥奏
  function upright(midi, when, vel, dest) {
    const f = mtof(midi);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.012);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, when + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 1.4);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2).connect(g); g.connect(dest);
    o.start(when); o2.start(when); o.stop(when + 1.5); o2.stop(when + 1.5);
  }
  // 輕刷鼓：濾過的雜訊；邊擊：短促的木頭聲
  let noiseBuf = null;
  function brush(when, vel, dest, len = 0.12) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
    }
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + len * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0005, when + len);
    src.connect(bp).connect(g).connect(dest);
    src.start(when, rand() * 0.8); src.stop(when + len + 0.02);
  }
  function rim(when, vel, dest) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.05);
    o.connect(g).connect(dest); o.start(when); o.stop(when + 0.06);
  }
  // 輕柔哼唱：鋸齒波 → 兩個共振峰（「嗚」母音）→ 慢起音、延遲顫音
  function hum(midi, when, dur, vel, dest) {
    const f = mtof(midi);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, when);
    vg.gain.linearRampToValueAtTime(f * 0.006, when + Math.min(0.6, dur * 0.6));
    vib.connect(vg).connect(o.frequency);
    // 輕微滑音進入（歌手的習慣）
    o.frequency.setValueAtTime(f * 0.985, when);
    o.frequency.exponentialRampToValueAtTime(f, when + 0.09);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 340; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 820; f2.Q.value = 6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const mix = ctx.createGain(); mix.gain.value = 1;
    const a = ctx.createGain(); a.gain.value = 1.0;
    const b = ctx.createGain(); b.gain.value = 0.3;
    o.connect(lp); lp.connect(f1).connect(a).connect(mix); lp.connect(f2).connect(b).connect(mix);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.14);
    env.gain.setValueAtTime(vel * 0.9, when + Math.max(0.1, dur - 0.12));
    env.gain.linearRampToValueAtTime(0, when + dur + 0.18);
    mix.connect(env).connect(dest);
    o.start(when); vib.start(when); o.stop(when + dur + 0.3); vib.stop(when + dur + 0.3);
  }
  function scheduleBar(b, t0, musicBus, pass) {
    const B = SCORE[b], second = pass % 2 === 1;
    const sw = (i) => t0 + i * SIX + (rand() - 0.5) * 0.012; // 十六分音符格＋一點人性化
    // 吉他：切分和弦（高三個音）＋拇指低音
    for (const i of GUITAR_HITS[b % 2]) {
      B.chord.slice(1).forEach((m, k) => guitar(m, sw(i) + k * 0.018, 0.085, musicBus, 0.22, SIX * 2.8));
    }
    for (const i of THUMB) guitar(i < 8 ? B.chord[0] : B.bass[1] + 12, sw(i), 0.13, musicBus, 0.18, SIX * (i === 6 ? 1.6 : 2.8)); // 根音 → 五度
    // 低音提琴：第 1、3 拍（第二遍才進來）
    if (second || b >= 8) { upright(B.bass[0], sw(0), 0.07, musicBus); upright(B.bass[1], sw(8), 0.06, musicBus); }
    // 刷鼓：每個十六分音符很輕地刷，二、四拍稍重；邊擊敲巴薩諾瓦的節奏
    for (let i = 0; i < 16; i++) brush(sw(i), i % 4 === 0 ? 0.012 : i % 4 === 2 ? 0.02 : 0.007, musicBus, i % 8 === 4 ? 0.25 : 0.1);
    for (const i of b % 2 ? [2, 6, 12] : [0, 6, 12]) rim(sw(i), 0.03, musicBus);
    // 旋律：哼唱（第二遍稍輕）
    for (const [at, d, p] of B.mel) hum(p, t0 + at * BEAT + (rand() - 0.2) * 0.02, d * BEAT * 0.95, second ? 0.11 : 0.13, musicBus);
  }

  // ---------------- 環境 ----------------
  function startAmbience() {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { // 粉紅雜訊（近似）
        const w = rand() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
        d[i] = (b0 + b1 + b2) * 0.5;
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const g = ctx.createGain(); g.gain.value = 0.07; // 遠處城市的輕微底噪，不要蓋過音樂
    src.connect(hp).connect(lp).connect(g).connect(ambBus);
    src.start();
  }
  function coo(when, p) {
    for (const [dt, f, len] of [[0, 330, 0.28], [0.36, 300, 0.22], [0.62, 280, 0.5]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, when + dt);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, when + dt + len);
      const fm = ctx.createOscillator(); fm.frequency.value = 28;
      const fg = ctx.createGain(); fg.gain.value = f * 0.06;
      fm.connect(fg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when + dt);
      g.gain.linearRampToValueAtTime(0.25, when + dt + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, when + dt + len);
      o.connect(g).connect(p);
      o.start(when + dt); fm.start(when + dt); o.stop(when + dt + len + 0.05); fm.stop(when + dt + len + 0.05);
    }
  }

  // ---------------- 預先合成（離線）----------------
  // 轉視角時畫面運算會佔住主執行緒；若邊播邊排音符就會卡頓。
  // 所以一開聲音就把整段音樂（兩遍，約 83 秒）、一輪鐘聲、鴿子叫聲先算成音檔，
  // 交給瀏覽器的音訊執行緒循環播放，畫面再忙也不影響。
  async function bake(seconds, channels, fill) {
    const sr = 44100, live = ctx;
    const off = new OfflineAudioContext(channels, Math.ceil(seconds * sr), sr);
    ctx = off; // 合成函式都用 ctx 建節點：暫時指向離線環境
    try { fill(off); } finally { ctx = live; }
    return off.startRendering();
  }
  // 音樂切成每 4 小節（約 10 秒）一段：第一段算好就開始播，其餘在背景陸續算好
  const CHUNK_BARS = 4, LEAD = 0.1, TAIL = 3;
  const CHUNKS = (2 * SCORE.length) / CHUNK_BARS;
  const bakeChunk = (k) => bake(LEAD + CHUNK_BARS * BAR + TAIL, 2, (off) => {
    const bus = off.createGain(); bus.connect(off.destination);
    for (let i = 0; i < CHUNK_BARS; i++) {
      const g = k * CHUNK_BARS + i; // 兩遍中的第幾小節
      scheduleBar(g % SCORE.length, LEAD + i * BAR, bus, Math.floor(g / SCORE.length));
    }
  });

  let assets = null, preparing = null, chunks = [], t0 = 0, nextChunk = 0, nextBells = 0, nextCoo = 0;
  async function prepare() {
    chunks[0] = await bakeChunk(0);
    const cooBuf = await bake(1.3, 1, (off) => { const g = off.createGain(); g.connect(off.destination); coo(0.02, g); });
    assets = { cooBuf, bells: null };
    begin();
    // 鐘（左聲道 = 北塔、右聲道 = 南塔）要在第 5 小節前備好，先算
    chunks[1] = await bakeChunk(1);
    assets.bells = await bake(24, 2, (off) => {
      const m = off.createChannelMerger(2); m.connect(off.destination);
      const nb = off.createGain(), sb = off.createGain();
      nb.connect(m, 0, 0); sb.connect(m, 0, 1);
      peal(0.05, nb, sb);
    });
    for (let k = 2; k < CHUNKS; k++) { chunks[k] = await bakeChunk(k); tick(); }
  }
  function begin() {
    t0 = ctx.currentTime + 0.2;
    nextChunk = 0;
    nextBells = t0 + PEAL_BAR * BAR; // 第 5 小節鐘聲加入，之後每兩遍一次
    nextCoo = t0 + 3;
    tick();
  }

  function playBells(when) {
    const src = ctx.createBufferSource(); src.buffer = assets.bells;
    const split = ctx.createChannelSplitter(2);
    // 鐘聲傳得遠：衰減比一般聲源緩和
    const np = panner(towerPos(north), 30, 0.35), sp = panner(towerPos(south), 30, 0.35);
    src.connect(split); split.connect(np, 0); split.connect(sp, 1);
    np.connect(bellBus); sp.connect(bellBus);
    src.start(when);
  }
  function playCoo(when) {
    const src = ctx.createBufferSource(); src.buffer = assets.cooBuf;
    src.playbackRate.value = 0.92 + rand() * 0.16;
    const p = panner([flock[0] + (rand() - 0.5) * 6, 0.3, flock[1] + (rand() - 0.5) * 6], 4, 1.4);
    src.connect(p).connect(ambBus);
    src.start(when);
  }
  // 提前 20 秒排好要播的音檔段落：主執行緒卡住幾秒也不會掉音
  function tick() {
    if (!assets) return;
    const ahead = ctx.currentTime + 20;
    for (;;) {
      const when = t0 + nextChunk * CHUNK_BARS * BAR;
      const buf = chunks[nextChunk % CHUNKS];
      if (when >= ahead || !buf) break;
      const src = ctx.createBufferSource(); src.buffer = buf;
      src.connect(musicBus);
      src.start(Math.max(ctx.currentTime, when - LEAD));
      nextChunk++;
    }
    while (assets.bells && nextBells < ahead) { playBells(nextBells); nextBells += 2 * SCORE.length * BAR; }
    while (nextCoo < ahead) { playCoo(nextCoo); nextCoo += 5 + rand() * 7; }
  }

  return {
    get running() { return !!ctx && ctx.state === 'running' && !!timer; },
    get musicOn() { return musicOn; },
    get ready() { return !!assets; },
    /** 必須在使用者點擊事件內呼叫；回傳 Promise（音樂預先合成完成時） */
    start() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.8;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp).connect(ctx.destination);
        // 教堂廣場的空間感：簡單的回聲殘響
        const verb = ctx.createConvolver();
        const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
        verb.buffer = ir;
        const wet = ctx.createGain(); wet.gain.value = 0.3;
        verb.connect(wet).connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_LEVEL : 0; musicBus.connect(master);
        const mv = ctx.createGain(); mv.gain.value = 0.22; musicBus.connect(mv).connect(verb);
        bellBus = ctx.createGain(); bellBus.gain.value = 1; bellBus.connect(master);
        const bv = ctx.createGain(); bv.gain.value = 0.5; bellBus.connect(bv).connect(verb);
        ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
        startAmbience();
        // 第一段音樂算好（約一秒內）就開始播
        preparing = new Promise((resolve) => {
          prepare().catch((e) => console.error('[audio]', e));
          const wait = () => (assets ? resolve() : setTimeout(wait, 100));
          wait();
        });
      }
      ctx.resume();
      master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.2);
      if (!timer) timer = setInterval(tick, 1000);
      return preparing;
    },
    stop() {
      if (!ctx) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      clearInterval(timer); timer = null;
      setTimeout(() => { if (!timer) ctx.suspend(); }, 600); // 暫停整個音訊時鐘：音樂與鐘聲維持同步
    },
    setMusic(on) {
      musicOn = on;
      if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, 0.3);
    },
    /** 每格：把聽者放在相機位置與方向 */
    update(camera) {
      if (!ctx || !timer) return;
      const L = ctx.listener, p = camera.position, t = ctx.currentTime;
      const f = [0, 0, -1], u = [0, 1, 0];
      const e = camera.matrixWorld.elements;
      f[0] = -e[8]; f[1] = -e[9]; f[2] = -e[10]; u[0] = e[4]; u[1] = e[5]; u[2] = e[6];
      if (L.positionX) {
        L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05);
        L.forwardX.setTargetAtTime(f[0], t, 0.05); L.forwardY.setTargetAtTime(f[1], t, 0.05); L.forwardZ.setTargetAtTime(f[2], t, 0.05);
        L.upX.setTargetAtTime(u[0], t, 0.05); L.upY.setTargetAtTime(u[1], t, 0.05); L.upZ.setTargetAtTime(u[2], t, 0.05);
      } else {
        L.setPosition(p.x, p.y, p.z);
        L.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
      }
    },
  };
}
