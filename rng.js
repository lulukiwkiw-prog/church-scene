// =============================================================================
// rng.js — 固定種子的隨機數（全專案唯一允許的隨機來源，禁止 Math.random）
// -----------------------------------------------------------------------------
// 用「名稱」取得獨立的隨機序列：
//   const r = rng('sculpture/kings/12');
//   r.next()          // [0, 1)
//   r.range(a, b)     // [a, b)
//   r.int(a, b)       // a..b（含兩端）
//   r.pick(array)
//   r.gauss(mean, sd)
//   r.fork('beard')   // 從目前序列再分出一條獨立子序列：'sculpture/kings/12/beard'
// 同一個名稱永遠得到同一條序列，所以改了某個模組不會影響別人的結果。
// 名稱請用「模組/部件/編號」的格式，避免撞名。
// =============================================================================

export const GLOBAL_SEED = 'notre-dame-1163';

/** 字串 → 32-bit 整數雜湊（xmur3） */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32：回傳 [0,1) 的產生器 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rng(name) {
  const next = mulberry32(hashString(`${GLOBAL_SEED}/${name}`));
  let spare = null;
  const r = {
    name,
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor((b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(arr.length * next())],
    chance: (p) => next() < p,
    gauss(mean = 0, sd = 1) {
      if (spare !== null) { const v = spare; spare = null; return mean + sd * v; }
      let u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return mean + sd * m * Math.cos(2 * Math.PI * v);
    },
    fork: (sub) => rng(`${name}/${sub}`),
  };
  return r;
}

export default rng;
