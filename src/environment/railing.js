// src/environment/railing.js — 鐵欄杆（矛頭直桿＋上下橫桿＋立柱）
import { fbox, fpyramid, yFrame } from './geom.js';

/**
 * pts：折線 [[x, z]...]；gaps：沿折線弧長的空缺 [[s0, s1]...]
 * opts：y 底高、height 總高、spacing 直桿間距、bar 直桿粗、spear 是否矛頭、post 立柱間距
 */
export function railing(g, pts, { y = 0, height = 1.3, spacing = 0.13, bar = 0.02, spear = true, post = 2.6, gaps = [], rails = null } = {}) {
  const inGap = (s, pad = 0) => gaps.some(([a, b]) => s > a - pad && s < b + pad);
  const railYs = rails || [0.1, height - (spear ? 0.3 : 0.06)];
  const tip = spear ? 0.11 : 0;
  let S = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const f = yFrame(x0, y, z0, ang);
    // 橫桿：把 [S, S+L] 扣掉空缺
    let cuts = [[0, L]];
    for (const [a, b] of gaps) {
      const ga = a - S, gb = b - S;
      cuts = cuts.flatMap(([u, v]) => (gb <= u || ga >= v ? [[u, v]] : [[u, Math.max(u, ga)], [Math.min(v, gb), v]].filter(([p, q]) => q - p > 0.05)));
    }
    for (const [u, v] of cuts) {
      for (const ry of railYs) fbox(g, f, u, v, ry, ry + 0.035, -0.014, 0.014);
      // 立柱（兩端與每 post 公尺）
      const n = Math.max(1, Math.round((v - u) / post));
      for (let k = 0; k <= n; k++) {
        const a = u + ((v - u) * k) / n;
        const ac = Math.min(v - 0.03, Math.max(u + 0.03, a));
        fbox(g, f, ac - 0.03, ac + 0.03, 0, height + 0.02, -0.03, 0.03, { b0: true });
        fpyramid(g, f, ac - 0.045, ac + 0.045, -0.045, 0.045, height + 0.02, height + 0.14);
      }
    }
    // 直桿（沿整條折線連續編號，間距一致）
    const k0 = Math.ceil(S / spacing), k1 = Math.floor((S + L) / spacing);
    for (let k = k0; k <= k1; k++) {
      const s = k * spacing;
      if (inGap(s, 0.05)) continue;
      const a = s - S;
      if (a < 0.05 || a > L - 0.05) continue;
      fbox(g, f, a - bar / 2, a + bar / 2, 0.02, height - tip, -bar / 2, bar / 2, { b0: true });
      if (spear) fpyramid(g, f, a - bar * 0.9, a + bar * 0.9, -bar * 0.9, bar * 0.9, height - tip, height);
    }
    S += L;
  }
}
