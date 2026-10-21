// src/sculpture/reliefs.js — 門的座標框架、門楣浮雕、拱圈小坐像
// 門的局部座標（portal frame）：X = 觀者右手的側向、Y = 上、Z = 朝外（朝觀者）；原點 = 門中線地面、立面牆面。
// 深度 d（從立面往內）→ Z = -d。
import * as THREE from 'three';
import { archivoltRing, tympanumRegisters } from '../../layout.js';
import { Mesher, transM, smooth } from './geo.js';
import { figure, spec, SEAT_HEIGHT } from './figure.js';
import { beastHead } from './beasts.js';

/** 西立面門：外法線 -X */
export function westPortalFrame(p) {
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(0, 0, p.z);
}
/** 袖廊門：外法線 ±Z */
export function transeptPortalFrame(f) {
  const s = Math.sign(f.z);
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(s, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, s)).setPosition(f.portal.x, 0, f.z);
}

/** 在門局部座標放一尊人像：lateral s、底 y、深度 d（人像背面貼 d 平面）、高度 h、扁平化 flat */
export function placeFigure(M, S, s, y, d, h, flat = 1, opt = {}) {
  const seat = S.pose === 'seat';
  const k = seat ? h / SEAT_HEIGHT : h;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(s, y, -d + 0.1 * k * flat + (opt.dz || 0)),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(opt.rx || 0, opt.ry || 0, opt.rz || 0, 'YXZ')),
    new THREE.Vector3(k, k, k * flat),
  );
  M.push(m);
  figure(M, S);
  M.pop();
}

// 門楣上層尖拱半月面：側向 s 處的可用高度
function lunetteTop(reg, s) {
  const a = reg.arch;
  const x = Math.abs(s) + a.span / 2;
  return a.springing + Math.sqrt(Math.max(0, a.radius * a.radius - x * x));
}
function fitH(reg, s, w, want, margin = 0.07) {
  let h = want;
  for (const t of [-0.5, 0, 0.5]) h = Math.min(h, lunetteTop(reg, s + t * w) - reg.y0 - margin);
  return Math.max(0.2, h);
}

/** 依主題組合門楣浮雕 */
export function tympanum(M, p, theme, r) {
  const T = tympanumRegisters(p);
  const d = T.x;
  const W = T.width;
  const regs = T.registers;
  const flat = 0.72;
  const rr = (n) => r.fork(n);
  // 背板（萬一立面模組沒做門楣面也不會透空；放在平面後 1 cm，不會與立面的面打架）
  for (const g of regs) {
    if (g.shape === 'band') M.box(0, (g.y0 + g.y1) / 2, -d - 0.06, W, g.y1 - g.y0, 0.1, 0.55);
  }
  const L = regs[regs.length - 1];
  {
    const A = L.arch;
    const sE = Math.min(W / 2, Math.sqrt(Math.max(0, A.radius * A.radius - (L.y0 - A.springing) ** 2)) - A.span / 2);
    const pts = [[-sE, L.y0]];
    const n = 24;
    for (let k = 1; k < n; k++) { const sv = -sE + (2 * sE * k) / n; pts.push([sv, lunetteTop(L, sv)]); }
    pts.push([sE, L.y0]);
    M.push(transM(0, 0, -d - 0.06));
    M.extrude(pts, 0.1, 0.55);
    M.pop();
  }

  const row = (g, kinds, s0, s1, opts = {}) => {
    const n = kinds.length;
    const h = (g.y1 - g.y0) * (opts.hf || 0.9);
    kinds.forEach((kind, i) => {
      if (!kind) return;
      const s = n === 1 ? (s0 + s1) / 2 : s0 + ((s1 - s0) * i) / (n - 1);
      const S = spec(kind, rr(`row${g.y0}/${i}`), { lod: opts.lod ?? 1, ...(opts.over || {}) });
      const hh = S.pose === 'seat' ? h : h;
      placeFigure(M, S, s, g.y0 + 0.02, d - (opts.dd || 0), hh, flat, { ry: (opts.turn || 0) * Math.sign(s) });
    });
  };

  const b0 = regs[0], b1 = regs.length > 2 ? regs[1] : null;
  const hw = W / 2 - 0.22;

  if (theme === 'judgment') {
    // 下層：死者從墳墓起身，兩端天使吹號
    const n = 8;
    for (let i = 0; i < n; i++) {
      const s = -hw + 0.35 + ((2 * hw - 0.7) * (i + 0.5)) / n;
      const S = spec('soul', rr(`dead/${i}`), { lod: 1, arms: { R: r.pick(['pray', 'raised', 'chest']), L: r.pick(['pray', 'out', 'chest']) } });
      placeFigure(M, S, s, b0.y0 + 0.02, d, 0.82, flat, { rz: (r.next() - 0.5) * 0.25 });
    }
    for (let i = 0; i < 4; i++) {
      const s = -hw + 0.35 + ((2 * hw - 0.7) * (i + 0.5)) / 4;
      // 石棺（蓋子掀開斜放）
      M.box(s, b0.y0 + 0.17, -d + 0.3, (2 * hw - 0.7) / 4 - 0.06, 0.32, 0.36, 0.8);
      M.pushTRS(s + 0.15, b0.y0 + 0.4, -d + 0.22, 0.25, 0, 0.35 * (i % 2 ? 1 : -1));
      M.box(0, 0, 0, 0.45, 0.05, 0.3, 0.85);
      M.pop();
    }
    for (const s of [-1, 1]) {
      const S = spec('angel', rr(`trumpet/${s}`), { lod: 1, arms: { R: 'trumpet', L: 'trumpet' }, hold: { R: 'trumpet' } });
      placeFigure(M, S, s * (hw + 0.05), b0.y0 + 0.02, d, 0.92, flat, { ry: -s * 0.5 });
    }
    // 中層：天使秤靈魂、魔鬼；左得救者、右受罰者（以鎖鏈相連）
    const g = b1;
    const hB = (g.y1 - g.y0) * 0.9;
    row(g, ['king', 'monk', 'woman', 'bishop', 'king', 'monk'], -hw, -0.75, { over: { hold: {}, arms: { R: 'pray', L: 'pray' } } });
    placeFigure(M, spec('angel', rr('michael'), { lod: 2, arms: { R: 'out', L: 'chest' }, hold: { R: 'scales' } }), -0.32, g.y0 + 0.02, d, hB, flat);
    placeFigure(M, spec('devil', rr('devil0'), { lod: 2 }), 0.25, g.y0 + 0.02, d, hB * 0.95, flat, { ry: -0.3 });
    row(g, ['soul', 'king', 'bishop', 'soul', 'soul', 'devil'], 0.72, hw, { over: { arms: { R: 'down', L: 'down' }, head: { tilt: 0.3 } } });
    M.rod([0.6, g.y0 + hB * 0.62, -d + 0.2], [hw, g.y0 + hB * 0.62, -d + 0.2], 0.018, 0.018, 6, 0.8); // 鎖鏈
    // 上層：審判的基督（坐）、兩天使持刑具、聖母與聖約翰跪
    const top = L;
    const hC = fitH(top, 0, 0.7, 2.3, 0.15);
    placeFigure(M, spec('christJudge', rr('christ'), { lod: 2 }), 0, top.y0 + 0.02, d, hC, 0.8);
    for (const s of [-1, 1]) {
      const hA = fitH(top, s * 0.78, 0.35, 1.9);
      placeFigure(M, spec('angel', rr(`instr/${s}`), { lod: 2, arms: { R: 'hold', L: 'hold' }, hold: s < 0 ? { L: 'lance' } : { R: 'cross' } }), s * 0.78, top.y0 + 0.02, d, hA, flat, { ry: -s * 0.25 });
      const hK = fitH(top, s * 1.5, 0.4, 1.3);
      placeFigure(M, spec(s < 0 ? 'virginPlain' : 'john', rr(`kneel/${s}`), { lod: 1, pose: 'seat', arms: { R: 'pray', L: 'pray' }, hold: {}, head: { crown: s < 0, halo: 'plain' } }), s * 1.5, top.y0 + 0.02, d, hK, flat, { ry: -s * 0.6 });
    }
  } else if (theme === 'virgin') {
    // 下層：坐著的先知與君王，中央約櫃
    row(b0, ['prophet', 'prophet', 'prophet'], -hw + 0.1, -0.75, { over: { pose: 'seat', arms: { R: 'lap', L: 'forward' }, hold: { L: 'scroll' } } });
    row(b0, ['king', 'king', 'king'], 0.75, hw - 0.1, { over: { pose: 'seat', arms: { R: 'lap', L: 'forward' }, hold: { L: 'scroll' } } });
    M.box(0, b0.y0 + 0.25, -d + 0.2, 0.75, 0.42, 0.36, 0.85);
    for (const s of [-1, 1]) M.rod([s * 0.38, b0.y0 + 0.05, -d + 0.35], [s * 0.38, b0.y1 - 0.12, -d + 0.35], 0.03, 0.03, 6, 0.9);
    M.box(0, b0.y1 - 0.1, -d + 0.25, 0.9, 0.12, 0.3, 0.85);
    // 中層：聖母安眠，基督與十二使徒
    const g = b1;
    row(g, ['apostle', 'apostle', 'apostle', 'apostle', 'apostle', 'apostle', 'christ', 'apostle', 'apostle', 'apostle', 'apostle', 'apostle', 'apostle'], -hw, hw, { hf: 0.92, lod: 0 });
    M.box(0, g.y0 + 0.17, -d + 0.36, 1.9, 0.3, 0.3, 0.85);
    const Sv = spec('virginPlain', rr('dormition'), { lod: 1, arms: { R: 'chest', L: 'chest' }, hold: {}, feet: false });
    const hv = 1.55;
    M.push(new THREE.Matrix4().compose(new THREE.Vector3(-hv / 2, g.y0 + 0.42, -d + 0.38), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), new THREE.Vector3(hv, hv, hv * 0.6)));
    figure(M, Sv);
    M.pop();
    // 上層：聖母加冕
    const top = L;
    const hS = fitH(top, 0.45, 0.6, 1.9, 0.25);
    placeFigure(M, spec('christ', rr('coronChrist'), { lod: 2, pose: 'seat', arms: { R: 'raised', L: 'lap' }, hold: { L: 'book' } }), 0.45, top.y0 + 0.02, d, hS, 0.8, { ry: -0.2 });
    placeFigure(M, spec('virginPlain', rr('coronVirgin'), { lod: 2, pose: 'seat', arms: { R: 'pray', L: 'pray' }, hold: {} }), -0.45, top.y0 + 0.02, d, hS, 0.8, { ry: 0.2 });
    // 戴冠的天使（在聖母頭上方）
    const hA = fitH(top, -0.25, 0.3, 0.8, 0.05);
    placeFigure(M, spec('angel', rr('crowner'), { lod: 1, arms: { R: 'out', L: 'out' }, hold: {} }), -0.25, top.y0 + hS + 0.0, d, hA * 0.9, flat, { rz: -0.9 });
    for (const s of [-1, 1]) {
      const hK = fitH(top, s * 1.35, 0.45, 1.3);
      placeFigure(M, spec('angel', rr(`candle/${s}`), { lod: 1, pose: 'seat', arms: { R: 'hold', L: 'hold' }, hold: { R: 'candle' } }), s * 1.4, top.y0 + 0.02, d, hK, flat, { ry: -s * 0.5 });
    }
  } else if (theme === 'anne') {
    row(b0, ['prophet', 'woman', 'king', 'monk', 'woman', 'prophet', 'king', 'woman', 'monk'], -hw, hw, { lod: 0 });
    row(b1, ['woman', 'king', 'prophet', 'angel', 'woman', 'monk', 'king', 'woman', 'prophet', 'bishop'], -hw, hw, { lod: 0 });
    const top = L;
    // 華蓋：兩柱 + 尖拱 + 小塔
    const hV = fitH(top, 0, 0.8, 1.9, 0.5);
    for (const s of [-1, 1]) {
      M.rod([s * 0.45, top.y0, -d + 0.25], [s * 0.45, top.y0 + hV + 0.1, -d + 0.25], 0.035, 0.035, 8, 0.9);
      M.box(s * 0.45, top.y0 + hV + 0.13, -d + 0.25, 0.11, 0.08, 0.11, 0.9);
    }
    M.box(0, top.y0 + hV + 0.22, -d + 0.2, 1.05, 0.12, 0.3, 0.85);
    for (const s of [-1, 0, 1]) {
      M.box(s * 0.35, top.y0 + hV + 0.38, -d + 0.15, 0.18, 0.22, 0.18, 0.85);
      M.push(transM(s * 0.35, top.y0 + hV + 0.49, -d + 0.15));
      M.lathe([[0, 0], [0.12, 0], [0, 0.22]], 6, 0.9);
      M.pop();
    }
    placeFigure(M, spec('virgin', rr('throne'), { lod: 2, pose: 'seat', arms: { R: 'lap', L: 'hold' }, hold: { R: 'scepter' } }), 0, top.y0 + 0.02, d, hV - 0.05, 0.8);
    for (const s of [-1, 1]) {
      const hA = fitH(top, s * 0.85, 0.35, 1.6);
      placeFigure(M, spec('angel', rr(`censer/${s}`), { lod: 2, arms: { R: 'out', L: 'hold' }, hold: { R: 'censer' } }), s * 0.85, top.y0 + 0.02, d, hA, flat, { ry: -s * 0.3 });
    }
    const hB = fitH(top, -1.4, 0.4, 1.4);
    placeFigure(M, spec('bishop', rr('sully'), { lod: 1 }), -1.4, top.y0 + 0.02, d, hB, flat, { ry: 0.4 });
    const hK = fitH(top, 1.45, 0.4, 1.2);
    placeFigure(M, spec('king', rr('louis'), { lod: 1, pose: 'seat', arms: { R: 'pray', L: 'pray' }, hold: {} }), 1.45, top.y0 + 0.02, d, hK, flat, { ry: -0.6 });
    const hS = fitH(top, -1.9, 0.3, 0.8);
    placeFigure(M, spec('monk', rr('scribe'), { lod: 0, pose: 'seat' }), -1.9, top.y0 + 0.02, d, hS, flat, { ry: 0.5 });
  } else {
    // 袖廊門（簡化）：一條橫帶 + 半月面
    const north = theme === 'cloitre';
    row(b0, north ? ['woman', 'king', 'prophet', 'virginPlain', 'angel', 'king', 'woman', 'monk'] : ['deacon', 'soul', 'soul', 'stephen', 'soul', 'bishop', 'monk', 'deacon'], -hw, hw, { lod: 0 });
    const top = L;
    const hC = fitH(top, 0, 0.7, 2.1, 0.2);
    placeFigure(M, spec(north ? 'virgin' : 'christ', rr('center'), { lod: 1, pose: 'seat' }), 0, top.y0 + 0.02, d, hC, 0.8);
    for (const s of [-1, 1]) {
      const hA = fitH(top, s * 0.85, 0.35, 1.8);
      placeFigure(M, spec('angel', rr(`a/${s}`), { lod: 1, hold: { R: 'censer' } }), s * 0.85, top.y0 + 0.02, d, hA, flat, { ry: -s * 0.3 });
      const hK = fitH(top, s * 1.6, 0.4, 1.3);
      placeFigure(M, spec(s < 0 ? 'bishop' : 'king', rr(`k/${s}`), { lod: 0, pose: 'seat', arms: { R: 'pray', L: 'pray' }, hold: {} }), s * 1.6, top.y0 + 0.02, d, hK, flat, { ry: -s * 0.5 });
    }
  }
}

// ---------------------------------------------------------------------------
// 拱圈小坐像：沿第 k 圈拱圈中心線排列，頭朝拱頂
// ---------------------------------------------------------------------------
/** 回傳該圈的放置點：[{ lat, y, tl, ty, h }]（門局部座標） */
export function archivoltSlots(p, k, yStart) {
  const ring = archivoltRing(p, k);
  const R = ring.radius, half = ring.span / 2;
  const vert = Math.max(0, ring.springing - yStart);
  const arc = R * Math.PI / 6 * 0.97; // 留一點給拱頂
  const Ls = vert + arc;
  const n = Math.max(4, Math.min(8, Math.round(Ls / 0.66)));
  const step = Ls / n;
  const out = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * step;
      let lat, y, tl, ty;
      if (s < vert) { lat = side * half; y = yStart + s; tl = 0; ty = 1; }
      else {
        const th = (s - vert) / R;
        lat = side * (half - R * (1 - Math.cos(th)));
        y = ring.springing + R * Math.sin(th);
        tl = -side * Math.sin(th); ty = Math.cos(th);
      }
      out.push({ lat, y, tl, ty, h: step * 0.86, depth: ring.x, width: ring.width, side, i });
    }
  }
  return out;
}

/** 拱圈人像的局部矩陣（門局部座標）：腳在 slot 中心往下 h/2 */
export function archivoltMatrix(slot, scale, protrude = 0.08) {
  const { lat, y, tl, ty, h } = slot;
  const Y = new THREE.Vector3(tl, ty, 0), Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3().crossVectors(Y, Z);
  const m = new THREE.Matrix4().makeBasis(X.multiplyScalar(scale), Y.clone().multiplyScalar(scale), Z.multiplyScalar(scale * 0.85));
  m.setPosition(lat - tl * h / 2, y - ty * h / 2, -slot.depth + protrude);
  return m;
}

/** 各圈主題（由內往外） */
export const ARCHIVOLT_THEMES = {
  judgment: ['angelSeat', 'prophetSeat', 'bishopSeat', 'martyr', 'virginStand', 'elderSeat'],
  virgin: ['angelSeat', 'prophetSeat', 'kingSeat', 'elderSeat'],
  anne: ['angelSeat', 'elderSeat', 'kingSeat', 'prophetSeat'],
  cloitre: ['angelSeat', 'virginStand', 'prophetSeat', 'bishopSeat'],
  etienne: ['angelSeat', 'martyr', 'bishopSeat', 'elderSeat'],
};

/** 建立拱圈人像樣板（正規化：高度 1） */
export function archivoltTemplate(kind, r) {
  const M = new Mesher();
  const base = {
    angelSeat: ['angel', { pose: 'seat', arms: { R: 'pray', L: 'pray' }, hold: {} }],
    prophetSeat: ['prophet', { pose: 'seat' }],
    bishopSeat: ['bishop', { pose: 'seat' }],
    elderSeat: ['elder', {}],
    kingSeat: ['king', { pose: 'seat' }],
    martyr: ['deacon', { hold: { R: 'palm', L: 'book' }, arms: { R: 'hold', L: 'chest' } }],
    virginStand: ['woman', { hold: { L: 'candle' }, arms: { L: 'hold', R: 'chest' } }],
  }[kind];
  const S = spec(base[0], r, { lod: 0, ...base[1] });
  const k = S.pose === 'seat' ? 1 / SEAT_HEIGHT : 1;
  M.push(new THREE.Matrix4().makeScale(k, k, k));
  figure(M, S);
  M.pop();
  // 每尊下方小托座（拱圈上的石台）
  M.box(0, -0.03, 0.02, 0.36, 0.06, 0.3, 0.7);
  return M;
}

export { smooth, beastHead };
