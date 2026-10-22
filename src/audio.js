// src/audio.js — 互動版的聲音（全部即時合成，沒有任何錄音檔）
// -----------------------------------------------------------------------------
// - 鐘聲：加法合成的教堂鐘（hum / prime / tierce / quint / nominal… 分音），
//   音高取自聖母院的鐘：南塔大鐘 Emmanuel（F#2），北塔四口鐘。
//   聲源放在鐘樓位置（PannerNode），走遠會變小、轉頭會換邊。
// - 配樂：原創的法式手風琴圓舞曲（G 大調，3/4 拍），手風琴雙簧片微失諧＋顫音，
//   低音與和弦「蹦恰恰」，第二遍換成撥弦伴奏與八度旋律。鐘響時配樂自動壓低。
// - 環境音：低沉的城市背景聲、鴿群的咕咕聲（放在鴿群位置）。
// 瀏覽器規定聲音只能在使用者點擊後開始：startAudio() 必須在 click 事件裡呼叫。
// -----------------------------------------------------------------------------

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------- 樂譜（原創）----------------
// 每小節：[和弦, 低音（MIDI）, 旋律 [[拍, 長度（拍）, MIDI], …]]
const G = 'G', Em = 'Em', Am = 'Am', D7 = 'D7', B7 = 'B7', E7 = 'E7';
const CHORDS = {
  G: [55, 59, 62], Em: [52, 55, 59], Am: [57, 60, 64], D7: [54, 57, 60], B7: [51, 54, 57], E7: [56, 59, 62],
};
const n = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
};
const BARS = [
  [G, 'G2', [[0, 1, 'B4'], [1, 0.5, 'D5'], [1.5, 0.5, 'C5'], [2, 1, 'B4']]],
  [G, 'D3', [[0, 1.5, 'G4'], [1.5, 0.5, 'A4'], [2, 1, 'B4']]],
  [Em, 'E2', [[0, 1, 'E5'], [1, 0.5, 'G5'], [1.5, 0.5, 'F#5'], [2, 1, 'E5']]],
  [Em, 'B2', [[0, 2, 'B4'], [2, 1, 'G4']]],
  [Am, 'A2', [[0, 1, 'C5'], [1, 0.5, 'E5'], [1.5, 0.5, 'D5'], [2, 1, 'C5']]],
  [D7, 'D3', [[0, 1, 'A4'], [1, 1, 'F#4'], [2, 0.5, 'A4'], [2.5, 0.5, 'C5']]],
  [G, 'G2', [[0, 1, 'B4'], [1, 0.5, 'A4'], [1.5, 0.5, 'G4'], [2, 1, 'D5']]],
  [D7, 'A2', [[0, 1.5, 'C5'], [1.5, 0.5, 'B4'], [2, 1, 'A4']]],
  [G, 'G2', [[0, 1, 'B4'], [1, 0.5, 'D5'], [1.5, 0.5, 'G5'], [2, 1, 'B5']]],
  [B7, 'B2', [[0, 1, 'A5'], [1, 0.5, 'F#5'], [1.5, 0.5, 'D#5'], [2, 1, 'B4']]],
  [Em, 'E2', [[0, 1, 'E5'], [1, 0.5, 'G5'], [1.5, 0.5, 'B5'], [2, 1, 'G5']]],
  [E7, 'E2', [[0, 1.5, 'G#5'], [1.5, 0.5, 'F#5'], [2, 1, 'E5']]],
  [Am, 'A2', [[0, 1, 'A5'], [1, 0.5, 'C6'], [1.5, 0.5, 'B5'], [2, 1, 'A5']]],
  [D7, 'D3', [[0, 1, 'F#5'], [1, 0.5, 'A5'], [1.5, 0.5, 'F#5'], [2, 0.5, 'D5'], [2.5, 0.5, 'C5']]],
  [G, 'G2', [[0, 1, 'B4'], [1, 0.5, 'G4'], [1.5, 0.5, 'A4'], [2, 1, 'B4']]],
  [G, 'D3', [[0, 2, 'G4']]],
].map(([c, b, mel]) => ({ chord: CHORDS[c], bass: n(b), mel: mel.map(([at, d, p]) => [at, d, n(p)]) }));
const BPM = 160, BEAT = 60 / BPM, BAR = 3 * BEAT;

// 聖母院的鐘（Hz）：北塔 Gabriel、Anne-Geneviève、Denis、Marcel；南塔 Emmanuel
const NORTH_BELLS = [116.5, 123.5, 138.6, 155.6];
const BOURDON = 92.5;
// 鐘的分音：[頻率倍數, 相對音量, 衰減秒數]
const PARTIALS = [[0.5, 0.55, 9], [1, 0.45, 6.5], [1.183, 0.35, 5], [1.506, 0.2, 4], [2, 0.38, 3.6], [2.514, 0.12, 2.6], [2.662, 0.1, 2.4], [3.011, 0.12, 2], [4.166, 0.07, 1.4], [5.433, 0.05, 1]];

export function createAudio({ layout }) {
  const W = layout.cathedral.westFront;
  const north = W.towers.find((t) => t.id === 'northTower'), south = W.towers.find((t) => t.id === 'southTower');
  const towerPos = (t) => [(t.x0 + t.x1) / 2, (t.belfry.yBottom + t.belfry.yTop) / 2, (t.z0 + t.z1) / 2];
  const flock = layout.actors.pigeons[0].center;

  let ctx = null, master, musicBus, bellBus, ambBus, timer = null;
  let musicOn = true, bar = 0, nextBarTime = 0, pass = 0, nextPeal = 0, nextCoo = 0;
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
  function bell(f0, when, gain, dest) {
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(dest);
    for (const [ratio, amp, decay] of PARTIALS) {
      for (const det of ratio === 0.5 ? [1, 1.0017] : [1]) { // hum 兩個略分離的頻率 → 鐘聲特有的「哇哇」拍頻
        const o = ctx.createOscillator();
        o.frequency.value = f0 * 2 * ratio * det; // f0 是 prime 的一半（鐘的命名以 hum 為準）
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(amp, when + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, when + decay * (f0 < 100 ? 1.6 : 1));
        o.connect(g).connect(out);
        o.start(when);
        o.stop(when + decay * 1.7 + 0.1);
      }
    }
    // 敲擊的金屬噪音
    const len = Math.floor(ctx.sampleRate * 0.08), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 14; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.25;
    src.connect(bp).connect(g).connect(out);
    src.start(when);
  }
  function peal(start) {
    // 北塔四口鐘依序輪敲（rounds）六輪，接著南塔大鐘 Emmanuel 敲三下
    const np = panner(towerPos(north)); np.connect(bellBus);
    const nb = ctx.createGain(); nb.connect(np);
    const sp = panner(towerPos(south)); sp.connect(bellBus);
    let t = start;
    for (let round = 0; round < 6; round++) {
      for (let i = NORTH_BELLS.length - 1; i >= 0; i--) {
        bell(NORTH_BELLS[i], t + (rand() - 0.5) * 0.04, 0.22, nb);
        t += 0.62;
      }
      t += round === 5 ? 1.2 : 0.62; // 每輪之間的「手拍」空檔
    }
    for (let k = 0; k < 3; k++) { bell(BOURDON, t, 0.5, sp); t += 3.4; }
    // 鐘響期間配樂壓低
    const g = musicBus.gain;
    g.cancelScheduledValues(start);
    g.setTargetAtTime(musicOn ? 0.3 : 0, start, 0.6);
    g.setTargetAtTime(musicOn ? 1 : 0, t + 2, 1.5);
    return t;
  }

  // ---------------- 手風琴與伴奏 ----------------
  function accordion(midi, when, dur, vel, dest, octaveUp = false) {
    const f = mtof(midi) * (octaveUp ? 2 : 1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.025);
    env.gain.setValueAtTime(vel * 0.85, when + Math.max(0.03, dur - 0.06));
    env.gain.linearRampToValueAtTime(0, when + dur + 0.06);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.8;
    lp.connect(env).connect(dest);
    // musette：兩片簧片相差約 ±7 cent，產生手風琴特有的顫動
    for (const [type, mul, det, amp] of [['sawtooth', 1, 7, 0.32], ['sawtooth', 1, -7, 0.32], ['square', 0.5, 0, 0.12]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f * mul; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = amp;
      o.connect(g).connect(lp);
      o.start(when); o.stop(when + dur + 0.1);
    }
  }
  function pluck(midi, when, vel, dest, decay = 0.35) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi) * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, when + decay);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g); g.connect(dest);
    o.start(when); o2.start(when); o.stop(when + decay + 0.05); o2.stop(when + decay + 0.05);
  }
  function scheduleBar(b, t0) {
    const B = BARS[b], light = pass % 2 === 1;
    // 蹦：低音
    pluck(B.bass, t0, 0.5, musicBus, 0.5);
    // 恰恰：和弦（第一遍手風琴短音、第二遍撥弦）
    for (const beat of [1, 2]) {
      const w = t0 + beat * BEAT + (rand() - 0.5) * 0.01;
      for (const m of B.chord) light ? pluck(m, w, 0.12, musicBus, 0.25) : accordion(m, w, BEAT * 0.45, 0.05, musicBus);
    }
    // 旋律
    for (const [at, d, p] of B.mel) {
      const w = t0 + at * BEAT + (rand() - 0.3) * 0.012; // 一點點搖擺
      accordion(p, w, d * BEAT * 0.92, light ? 0.1 : 0.13, musicBus, light && b >= 8);
    }
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
  function coo(when) {
    const p = panner([flock[0] + (rand() - 0.5) * 6, 0.3, flock[1] + (rand() - 0.5) * 6], 4, 1.4);
    p.connect(ambBus);
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

  // ---------------- 排程 ----------------
  function tick() {
    const now = ctx.currentTime, ahead = now + 0.3;
    while (nextBarTime < ahead) {
      if (musicOn) scheduleBar(bar, nextBarTime);
      nextBarTime += BAR;
      bar = (bar + 1) % BARS.length;
      if (bar === 0) pass++;
    }
    if (now + 0.5 > nextPeal) { const end = peal(Math.max(now + 0.3, nextPeal)); nextPeal = end + 75; }
    if (now + 0.3 > nextCoo) { coo(Math.max(now + 0.1, nextCoo)); nextCoo = nextCoo + 5 + rand() * 7; }
  }

  return {
    get running() { return !!ctx && ctx.state === 'running' && !!timer; },
    get musicOn() { return musicOn; },
    /** 必須在使用者點擊事件內呼叫 */
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
        const wet = ctx.createGain(); wet.gain.value = 0.25;
        verb.connect(wet).connect(master);
        musicBus = ctx.createGain(); musicBus.connect(master);
        const mv = ctx.createGain(); mv.gain.value = 0.15; musicBus.connect(mv).connect(verb);
        bellBus = ctx.createGain(); bellBus.gain.value = 1; bellBus.connect(master);
        const bv = ctx.createGain(); bv.gain.value = 0.5; bellBus.connect(bv).connect(verb);
        ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
        startAmbience();
        nextBarTime = ctx.currentTime + 0.2;
        nextPeal = ctx.currentTime + 0.4; // 一開聲音就先響一輪鐘
        nextCoo = ctx.currentTime + 3;
      }
      ctx.resume();
      master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.2);
      if (!timer) timer = setInterval(tick, 80);
    },
    stop() {
      if (!ctx) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      clearInterval(timer); timer = null;
      setTimeout(() => { if (!timer) ctx.suspend(); }, 600);
    },
    setMusic(on) {
      musicOn = on;
      if (ctx) musicBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3);
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
