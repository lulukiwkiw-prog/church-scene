// 檢查 layout.js 的一致性：數量、範圍、不互相穿插。執行：npm run check
import assert from 'node:assert/strict';
import { LAYOUT } from '../layout.js';

const { cathedral: C, parvis: P, sun } = LAYOUT;
const W = C.westFront;
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

assert(Object.isFrozen(LAYOUT.cathedral.westFront.portals[0]), 'layout 必須是唯讀');
assert(near(C.totalLength, 128), '全長 128');
assert(near(W.width, 41), '西立面寬 41');
assert(near(W.towers[0].terrace.balustradeTop, 69), '鐘樓 69');
assert(near(C.spire.top, 96), '尖塔 96');
assert(near(W.roseTier.westRose.diameter, 9.6));
for (const f of C.transept.facades) assert(near(f.rose.diameter, 12.9));
assert.equal(W.galleryOfKings.statues.length, 28, '國王廊 28 尊');
assert.equal(C.apostleGroups.flatMap((g) => g.statues).length, 16, '屋頂銅像 16 尊');

// 屋脊要藏在西立面中段（46 m）後面
assert(C.heights.ridge < W.centerSectionTop, '屋脊不可露出西立面中段頂');
assert(C.heights.ridge + 1 < C.spire.stages[0].y1);

// 門洞要落在相鄰扶壁之間
const bz = W.buttresses.map((b) => b.z).sort((a, b) => a - b);
W.portals.forEach((p, i) => {
  const left = bz[i] + W.buttresses[i].width / 2;
  const right = bz[i + 1] - W.buttresses[i + 1].width / 2;
  assert(p.z - p.outerWidth / 2 >= left - 1e-6 && p.z + p.outerWidth / 2 <= right + 1e-6, `${p.id} 超出扶壁間距`);
  assert(p.outerApex < W.galleryOfKings.yBottom, `${p.id} 頂部撞到國王廊`);
  if (p.gable) assert(p.gable.apex <= W.galleryOfKings.yBottom, `${p.id} 三角楣撞到國王廊`);
});

// 玫瑰窗在玫瑰窗層內、窗 / 迴廊垂直順序
const r = W.roseTier.westRose;
assert(r.y - r.diameter / 2 > W.roseTier.yBottom && r.y + r.diameter / 2 < W.roseTier.yTop);
assert(W.galleryOfKings.yTop <= W.roseTier.yBottom && W.roseTier.yTop <= W.grandGallery.yBottom);

// 袖廊玫瑰窗在迴廊之上、山牆之下
for (const f of C.transept.facades) {
  assert(f.rose.y - f.rose.diameter / 2 >= f.claireVoie.yTop - 1e-6);
  assert(f.portal.gable.apex <= f.claireVoie.yBottom);
}

// 所有扶壁墩在 48 m 寬度內，不跑進廣場
for (const p of C.buttressPiers) {
  assert(Math.abs(p.z) <= C.totalWidth / 2 && p.x > W.x1 && p.x <= C.totalLength);
}
// 飛扶壁：頭比腳高
for (const fb of C.flyingButtresses) for (const f of fb.flights) assert(f.head[1] > f.foot[1]);

// 廣場物件在廣場範圍內
const inParvis = (x, z) => x >= P.bounds.x0 && x <= P.bounds.x1 && z >= P.bounds.z0 && z <= P.bounds.z1;
for (const t of P.trees) assert(inParvis(t.x, t.z), `樹 ${t.x},${t.z}`);
for (const l of P.lamps) assert(inParvis(l.x, l.z));
assert(inParvis(P.pointZero.x, P.pointZero.z) && inParvis(P.charlemagne.x, P.charlemagne.z));

// 太陽：東南、仰角 7°、單位向量；應在教堂後方（+X）偏南（+Z）
const d = sun.direction;
assert(near(Math.hypot(...d), 1, 0.01));
assert(near(Math.asin(d[1]) * 180 / Math.PI, 7, 0.1));
assert(d[0] > 0 && d[2] > 0);

console.log('layout.js OK —',
  `${C.flyingButtresses.length} 組飛扶壁、${C.gargoyles.length} 隻滴水獸、`,
  `${C.windows.clerestory.length + C.windows.chapel.length} 扇窗、ridge ${C.heights.ridge} m`);
