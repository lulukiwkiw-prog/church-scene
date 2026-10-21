// src/environment/parvis.js — 廣場物件：零起點銅星、考古地下室入口、路燈、長椅、矮柱、門前鐵欄杆、查理曼像台座
import { box, fbox, groundPoly, lathe, yFrame, frame } from './geom.js';
import { railing } from './railing.js';
import { LAYER } from './ground.js';

const DEG = Math.PI / 180;

export function buildParvis(B, L) {
  const pv = L.parvis;
  const iron = B.get('parvis', 'ironPainted');

  // ---------------- 零起點：石八角板＋八角銅環＋八角星 ----------------
  {
    const { x, z, diameter } = pv.pointZero;
    const R = diameter / 2;
    const oct = (r, ph = Math.PI / 8) => Array.from({ length: 8 }, (_, i) => [x + r * Math.cos(ph + (i * Math.PI) / 4), z + r * Math.sin(ph + (i * Math.PI) / 4)]);
    const y0 = pv.y + LAYER.plate;
    groundPoly(B.get('parvis', 'stoneTrace'), oct(R * 1.9), [], y0);
    const br = B.get('parvis', 'bronzePolished');
    // 銅環（八角）
    groundPoly(br, oct(R), [oct(R * 0.9).reverse()], y0 + 0.006);
    // 八角星（16 點）
    const star = Array.from({ length: 16 }, (_, i) => {
      const r = i % 2 === 0 ? R * 0.82 : R * 0.36, a = (i * Math.PI) / 8 + Math.PI / 2;
      return [x + r * Math.cos(a), z + r * Math.sin(a)];
    });
    groundPoly(br, star, [], y0 + 0.008);
    // 中央圓章
    groundPoly(br, Array.from({ length: 12 }, (_, i) => [x + R * 0.18 * Math.cos((i * Math.PI) / 6), z + R * 0.18 * Math.sin((i * Math.PI) / 6)]), [], y0 + 0.01);
  }

  // ---------------- 考古地下室入口：往下的階梯坑＋欄杆 ----------------
  {
    const c = pv.cryptEntrance;
    const y0 = pv.y, yb = y0 - c.depth;
    const sq = B.get('parvis', 'stoneAshlar');
    const pave = B.get('parvis', 'stonePaving');
    // 坑壁（朝內）
    sq.quad([c.x0, yb, c.z0], [c.x1, yb, c.z0], [c.x1, y0, c.z0], [c.x0, y0, c.z0], [c.x0, yb], [c.x1, yb], [c.x1, y0], [c.x0, y0], [0, 0, 1]);
    sq.quad([c.x0, yb, c.z1], [c.x1, yb, c.z1], [c.x1, y0, c.z1], [c.x0, y0, c.z1], [c.x0, yb], [c.x1, yb], [c.x1, y0], [c.x0, y0], [0, 0, -1]);
    sq.quad([c.x1, yb, c.z0], [c.x1, yb, c.z1], [c.x1, y0, c.z1], [c.x1, y0, c.z0], [c.z0, yb], [c.z1, yb], [c.z1, y0], [c.z0, y0], [-1, 0, 0]);
    sq.quad([c.x0, yb, c.z0], [c.x0, yb, c.z1], [c.x0, y0, c.z1], [c.x0, y0, c.z0], [c.z0, yb], [c.z1, yb], [c.z1, y0], [c.z0, y0], [1, 0, 0]);
    // 階梯：從 x0（頂）往 x1 下降，底端留平台與入口門
    const landing = Math.min(2.0, (c.x1 - c.x0) * 0.2);
    const run = c.x1 - c.x0 - landing, tread = run / c.steps;
    for (let i = 0; i < c.steps; i++) {
      const top = y0 - ((i + 1) * c.depth) / c.steps;
      box(pave, c.x0 + i * tread, c.x0 + (i + 1) * tread, yb, top, c.z0, c.z1, { b0: true, c0: true, c1: true });
    }
    // 底部平台地面
    groundPoly(pave, [[c.x1 - landing, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x1 - landing, c.z1]], [], yb);
    // 入口門（深色）＋石門框
    const zm = (c.z0 + c.z1) / 2, dw = Math.min(2.4, (c.z1 - c.z0) * 0.5), dh = Math.min(2.6, c.depth * 0.8);
    const dark = B.get('parvis', 'windowDark');
    dark.quad([c.x1 - 0.02, yb, zm - dw / 2], [c.x1 - 0.02, yb, zm + dw / 2], [c.x1 - 0.02, yb + dh, zm + dw / 2], [c.x1 - 0.02, yb + dh, zm - dw / 2], [0, 0], [1, 0], [1, 1], [0, 1], [-1, 0, 0]);
    box(sq, c.x1 - 0.12, c.x1, yb, yb + dh + 0.25, zm - dw / 2 - 0.25, zm - dw / 2, { a1: true, b0: true });
    box(sq, c.x1 - 0.12, c.x1, yb, yb + dh + 0.25, zm + dw / 2, zm + dw / 2 + 0.25, { a1: true, b0: true });
    box(sq, c.x1 - 0.12, c.x1, yb + dh, yb + dh + 0.25, zm - dw / 2, zm + dw / 2, { a1: true });
    // 坑緣壓頂石
    const cap = B.get('parvis', 'stoneTrace');
    box(cap, c.x0 - 0.3, c.x1 + 0.3, y0, y0 + 0.08, c.z0 - 0.3, c.z0);
    box(cap, c.x0 - 0.3, c.x1 + 0.3, y0, y0 + 0.08, c.z1, c.z1 + 0.3);
    box(cap, c.x1, c.x1 + 0.3, y0, y0 + 0.08, c.z0, c.z1);
    // 欄杆：三面，頂端（x0）為入口
    const o = 0.15, H = c.railingHeight;
    railing(iron, [[c.x0, c.z0 - o], [c.x1 + o, c.z0 - o], [c.x1 + o, c.z1 + o], [c.x0, c.z1 + o]], { y: y0 + 0.08, height: H, spacing: 0.12, bar: 0.018, spear: false, post: 2.0, rails: [0.1, H - 0.05] });
  }

  // ---------------- 巴黎式燈柱（不點亮） ----------------
  {
    const glass = B.get('parvis', 'glassLamp');
    for (const l of pv.lamps) {
      const H = l.height, y = pv.y;
      // 鑄鐵燈柱：底座、凹槽柱身、頸部
      lathe(iron, l.x, y, l.z, [
        [0.24, 0], [0.24, 0.12], [0.2, 0.18], [0.2, 0.32], [0.14, 0.42], [0.11, 0.62], [0.13, 0.7], [0.09, 0.8],
        [0.075, 1.2], [0.06, H - 1.1], [0.085, H - 1.05], [0.085, H - 0.98], [0.05, H - 0.95], [0.05, H - 0.86], [0.1, H - 0.8], [0.1, H - 0.76], [0, H - 0.76],
      ], 8);
      // 燈籠：上寬下窄的四面玻璃＋鐵框與頂蓋
      const yb = H - 0.76, yt = H - 0.2;
      lathe(glass, l.x, y, l.z, [[0, yb], [0.11, yb], [0.25, yt], [0, yt]], 4, Math.PI / 4);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const f = frame([l.x, y, l.z], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]);
        // 斜置的鐵框條（以細長方塊近似）
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps;
          const r0 = 0.11 + (0.25 - 0.11) * t0, r1 = 0.11 + (0.25 - 0.11) * t1;
          fbox(iron, f, (r0 + r1) / 2 - 0.012, (r0 + r1) / 2 + 0.012, yb + (yt - yb) * t0, yb + (yt - yb) * t1, -0.012, 0.012);
        }
      }
      lathe(iron, l.x, y, l.z, [[0.27, yt], [0.27, yt + 0.04], [0.16, yt + 0.16], [0.04, H - 0.04], [0.04, H - 0.02], [0.06, H - 0.02], [0, H]], 4, Math.PI / 4);
    }
  }

  // ---------------- 長椅（鐵腳＋木條） ----------------
  {
    const wood = B.get('parvis', 'doorWood');
    for (const b of pv.benches) {
      const ang = b.facingDeg * DEG;
      // c 軸 = 面向方向（座位前緣），a 軸沿長度
      const fc = Math.cos(ang), fs = Math.sin(ang);
      const f = frame([b.x, pv.y, b.z], [-fs, 0, fc], [0, 1, 0], [fc, 0, fs]);
      const half = b.length / 2;
      for (const a of [-half + 0.12, half - 0.12]) {
        fbox(iron, f, a - 0.03, a + 0.03, 0, 0.42, 0.19, 0.25);   // 前腳
        fbox(iron, f, a - 0.03, a + 0.03, 0, 0.42, -0.25, -0.19); // 後腳
        fbox(iron, f, a - 0.03, a + 0.03, 0.36, 0.42, -0.26, 0.26);
        fbox(iron, f, a - 0.025, a + 0.025, 0.42, 0.9, -0.31, -0.26); // 椅背支架
      }
      for (let k = 0; k < 4; k++) {
        const c0 = -0.25 + k * 0.128;
        fbox(wood, f, -half, half, 0.42, 0.46, c0, c0 + 0.1);
      }
      for (let k = 0; k < 3; k++) {
        const y0 = 0.52 + k * 0.12, c0 = -0.31 - k * 0.015;
        fbox(wood, f, -half, half, y0, y0 + 0.09, c0 - 0.035, c0);
      }
    }
  }

  // ---------------- 矮柱 ----------------
  for (const b of pv.bollards) {
    const H = b.height;
    lathe(iron, b.x, pv.y, b.z, [[0.1, 0], [0.1, 0.06], [0.075, 0.1], [0.06, H - 0.16], [0.075, H - 0.13], [0.075, H - 0.1], [0.04, H - 0.08], [0.06, H - 0.05], [0.04, H - 0.01], [0, H]], 8);
  }

  // ---------------- 門前黑色鐵欄杆（矛頭），門口留空 ----------------
  {
    const bf = pv.barrierAtFacade;
    const s0 = Math.min(bf.z0, bf.z1);
    railing(iron, [[bf.x, bf.z0], [bf.x, bf.z1]], {
      y: pv.y, height: bf.height, spacing: 0.12, bar: 0.02, spear: bf.spearTops, post: 2.5,
      gaps: bf.openings.map((o) => [o.z0 - s0, o.z1 - s0]),
    });
  }

  // ---------------- 查理曼像台座 ----------------
  {
    const ch = pv.charlemagne, p = ch.pedestal;
    const ang = ch.facingDeg * DEG;
    const f = yFrame(ch.x, pv.y, ch.z, ang); // a = 面向方向（長邊）
    const g = B.get('parvis', 'stoneCarved');
    const hl = p.length / 2, hw = p.width / 2, H = p.height;
    fbox(g, f, -hl - 0.35, hl + 0.35, 0, 0.25, -hw - 0.35, hw + 0.35, { b0: true }); // 底階
    fbox(g, f, -hl - 0.2, hl + 0.2, 0.25, 0.45, -hw - 0.2, hw + 0.2, { b0: true });  // 基座線腳
    fbox(g, f, -hl - 0.1, hl + 0.1, 0.45, 0.6, -hw - 0.1, hw + 0.1, { b0: true });
    fbox(g, f, -hl + 0.1, hl - 0.1, 0.6, H - 0.4, -hw + 0.1, hw - 0.1, { b0: true, b1: true }); // 主體
    // 主體四面的凹框（淺浮框）
    for (const s of [-1, 1]) {
      fbox(g, f, -hl + 0.35, hl - 0.35, 0.85, H - 0.65, s > 0 ? hw - 0.1 : -hw + 0.06, s > 0 ? hw - 0.06 : -hw + 0.1, { b0: true });
      fbox(g, f, s > 0 ? hl - 0.1 : -hl + 0.06, s > 0 ? hl - 0.06 : -hl + 0.1, 0.85, H - 0.65, -hw + 0.35, hw - 0.35, { b0: true });
    }
    fbox(g, f, -hl, hl, H - 0.4, H - 0.25, -hw, hw, { b0: true });          // 頂部線腳
    fbox(g, f, -hl - 0.12, hl + 0.12, H - 0.25, H - 0.1, -hw - 0.12, hw + 0.12); // 簷
    fbox(g, f, -hl, hl, H - 0.1, H, -hw, hw, { b0: true });                  // 頂板（雕像站立面 = H）
  }
}
