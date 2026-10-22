// 由 layout.js 產生平面圖與西立面圖 plan.svg（純檢查用，不是成品畫面）。執行：npm run plan
import { writeFileSync } from 'node:fs';
import { LAYOUT } from '../layout.js';

const { cathedral: C, parvis: P, surroundings: S, sun } = LAYOUT;
const W = C.westFront;
const out = [];
const f = (n) => Math.round(n * 100) / 100;

// ---------- 平面圖：X 往右、北（-Z）在上 ----------
const PS = 4, PX0 = -145, PZ0 = -70, PW = 335, PH = 135;
const px = (x) => f((x - PX0) * PS), pz = (z) => f((z - PZ0) * PS);
const rect = (x0, x1, z0, z1, style) =>
  out.push(`<rect x="${px(Math.min(x0, x1))}" y="${pz(Math.min(z0, z1))}" width="${f(Math.abs(x1 - x0) * PS)}" height="${f(Math.abs(z1 - z0) * PS)}" ${style}/>`);
const poly = (pts, style) => out.push(`<polygon points="${pts.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" ${style}/>`);
const line = (a, b, style) => out.push(`<line x1="${px(a[0])}" y1="${pz(a[1])}" x2="${px(b[0])}" y2="${pz(b[1])}" ${style}/>`);
const circ = (x, z, r, style) => out.push(`<circle cx="${px(x)}" cy="${pz(z)}" r="${f(r * PS)}" ${style}/>`);
const text = (x, z, s, size = 11, anchor = 'middle') => out.push(`<text x="${px(x)}" y="${pz(z)}" font-size="${size}" text-anchor="${anchor}">${s}</text>`);

out.push(`<g id="plan">`);
rect(PX0, PX0 + PW, PZ0, PZ0 + PH, 'fill="#e9e4d8"');
const sw = S.seine.south; rect(sw.x0, sw.x1, sw.z0, sw.z1, 'fill="#9fb8c8"');
for (const st of S.streets) rect(st.x0, st.x1, st.z0, st.z1, 'fill="#cfc9bd"');
for (const b of S.buildings) rect(b.x0, b.x1, b.z0, b.z1, 'fill="#b9b2a5" stroke="#8a8478"');
for (const g of S.gardens) { rect(g.x0, g.x1, g.z0, g.z1, 'fill="#c9d3b4"'); }
rect(P.bounds.x0, P.bounds.x1, P.bounds.z0, P.bounds.z1, 'fill="#f3efe4" stroke="#a69f90"');
for (const t of P.paving.medievalTraces) {
  if (t.type === 'band') rect(t.x0, t.x1, t.z0, t.z1, 'fill="#fbf8ef" stroke="#d6cfbf"');
  else poly(t.points, 'fill="none" stroke="#c9bfa8" stroke-dasharray="4 3"');
}
const ce = P.cryptEntrance; rect(ce.x0, ce.x1, ce.z0, ce.z1, 'fill="#8d867a"');
circ(P.pointZero.x, P.pointZero.z, 1.2, 'fill="#b0812f"');
const ch = P.charlemagne; rect(ch.x - ch.pedestal.length / 2, ch.x + ch.pedestal.length / 2, ch.z - ch.pedestal.width / 2, ch.z + ch.pedestal.width / 2, 'fill="#5f7d6b"');
for (const l of P.lamps) circ(l.x, l.z, 0.6, 'fill="#333"');
for (const b of P.bollards) circ(b.x, b.z, 0.3, 'fill="#555"');
const trees = [...P.trees, ...S.gardens.flatMap((g) => g.trees)];
for (const t of trees) circ(t.x, t.z, t.canopyRadius, 'fill="none" stroke="#6d8a55" stroke-width="1.5"');

// 教堂
const sec = C.section;
const dark = 'fill="#cbbf9f" stroke="#4a4234" stroke-width="1"';
rect(C.nave.x0, C.choir.x1, -sec.chapelOuterZ, sec.chapelOuterZ, dark);
const tr = C.transept.crossing; rect(tr.x0, tr.x1, -C.transept.armZ, C.transept.armZ, dark);
const apsePts = (r) => { const pts = []; for (let a = -90; a <= 90; a += 6) pts.push([C.apse.cx + r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)]); return pts; };
poly(apsePts(C.apse.chapelRadius), dark);
for (const r of [sec.outerAisleOuterZ, sec.innerAisleOuterZ]) {
  for (const s of [-1, 1]) line([C.nave.x0, s * r], [C.choir.x1, s * r], 'stroke="#8c7f62" stroke-dasharray="2 2"');
  poly(apsePts(r), 'fill="none" stroke="#8c7f62" stroke-dasharray="2 2"');
}
const vessel = C.apse.vertexAnglesDeg.map((a) => [C.apse.cx + sec.vesselWallZ * Math.cos(a * Math.PI / 180), sec.vesselWallZ * Math.sin(a * Math.PI / 180)]);
poly([[C.nave.x0, -sec.vesselWallZ], ...vessel, [C.nave.x0, sec.vesselWallZ]], 'fill="#e6dcc0" stroke="#4a4234"');
for (const t of W.towers) rect(t.x0, t.x1, t.z0, t.z1, 'fill="#b5a782" stroke="#4a4234" stroke-width="1.5"');
rect(W.x0, W.x1, -6, 6, 'fill="#c2b48e" stroke="#4a4234"');
for (const b of W.buttresses) rect(-b.projection, 0, b.z - b.width / 2, b.z + b.width / 2, 'fill="#4a4234"');
for (const p of W.portals) poly([[0, p.z - p.outerWidth / 2], [p.splayDepth, p.z - p.openingWidth / 2], [p.splayDepth, p.z + p.openingWidth / 2], [0, p.z + p.outerWidth / 2]], 'fill="#f3efe4" stroke="#4a4234"');
for (const t of W.stairTurrets) circ(t.x, t.z, t.radius, 'fill="#9c8e6a" stroke="#4a4234"');
// 鏡頭路線
const ks = LAYOUT.camera.keyframes;
for (let i = 0; i < ks.length - 1; i++) line([ks[i].position[0], ks[i].position[2]], [ks[i + 1].position[0], ks[i + 1].position[2]], 'stroke="#c0392b" stroke-width="1.5" stroke-dasharray="5 3"');
for (const k of ks) { circ(k.position[0], k.position[2], 1.0, 'fill="#c0392b"'); text(k.position[0] + 2, k.position[2] - 1.5, `${k.t}s`, 9, 'start'); }
for (const b of C.buttressPiers) {
  const rot = b.rotationDeg ?? (b.z < 0 ? -90 : 90);
  out.push(`<rect x="${f(-b.depth * PS / 2)}" y="${f(-b.width * PS / 2)}" width="${f(b.depth * PS)}" height="${f(b.width * PS)}" fill="#4a4234" transform="translate(${px(b.x)} ${pz(b.z)}) rotate(${rot})"/>`);
}
for (const p of C.paleePiers) circ(p.x, p.z, 0.7, 'fill="#4a4234"');
for (const fb of C.flyingButtresses) for (const fl of fb.flights) line([fl.foot[0], fl.foot[2]], [fl.head[0], fl.head[2]], 'stroke="#7a5d2c" stroke-width="2"');
const sp = C.spire; poly([...Array(8)].map((_, i) => [sp.x + sp.octagonRadius * Math.cos((i + 0.5) * Math.PI / 4), sp.z + sp.octagonRadius * Math.sin((i + 0.5) * Math.PI / 4)]), 'fill="#5d6a74"');
for (const g of C.apostleGroups) for (const s of g.statues) circ(s.x, s.z, 0.6, `fill="${s.kind === 'apostle' ? '#3d8b74' : '#b0812f'}"`);
const pr = C.porteRouge; rect(pr.x - pr.width / 2, pr.x + pr.width / 2, pr.z - 0.8, pr.z, 'fill="#b0302a"');
const sc = C.sacristy; rect(sc.x0, sc.x1, sc.z0, sc.z1, 'fill="#cbbf9f" stroke="#4a4234"'); rect(sc.passage.x0, sc.passage.x1, sc.passage.z0, sc.passage.z1, 'fill="#cbbf9f" stroke="#4a4234"');

// 標註
text(-70, -26, '前廣場 Parvis', 14); text(-70, 0.8, '新聖母街舊址', 9);
text(-103, 7, '考古地下室入口', 9); text(P.pointZero.x, P.pointZero.z - 2, '零起點', 9);
text(ch.x, ch.z + 5, '查理曼像', 9);
text(-70, -63, '主宮醫院 Hôtel-Dieu', 11); text(40, -60, '修院區', 11); text(155, 0, '若望二十三世廣場', 10);
text(40, 85 - 20, '塞納河', 14); text(30, 0.8, '中殿', 12); text(90, 0.8, '詩班席', 12);
text(66, -26, '北袖廊', 9); text(66, 28.5, '南袖廊', 9); text(92, 35, '聖器室', 9); text(pr.x, pr.z - 2, '紅門', 9);
text(-2, -24, '北塔', 9); text(-2, 26, '南塔', 9);

// 方位：真北與太陽
const arrow = (x, z, d, len, color, label) => {
  const e = [x + d[0] * len, z + d[2] * len];
  line([x, z], e, `stroke="${color}" stroke-width="2.5" marker-end="url(#ah)"`);
  text(e[0] + d[0] * 4, e[1] + d[2] * 4 + 1, label, 11);
};
const n = LAYOUT.meta.trueNorth;
arrow(-130, -55, n, 12, '#222', 'N');
const sd = Math.hypot(sun.direction[0], sun.direction[2]);
arrow(-40, 44, [sun.direction[0] / sd, 0, sun.direction[2] / sd], 18, '#d98c1f', `太陽 ${sun.azimuthDeg}° / ${sun.elevationDeg}°`);
// 比例尺 50 m
line([-140, 62], [-90, 62], 'stroke="#222" stroke-width="2"'); text(-115, 60, '50 m', 10);
out.push(`</g>`);

// ---------- 西立面（由廣場看：北在左） ----------
const ES = 6, EOX = PW * PS + 40, EH = 100;
const ex = (z) => f(EOX + (z + 25) * ES), ey = (y) => f((EH - y) * ES + 20);
const erect = (z0, z1, y0, y1, style) => out.push(`<rect x="${ex(Math.min(z0, z1))}" y="${ey(Math.max(y0, y1))}" width="${f(Math.abs(z1 - z0) * ES)}" height="${f(Math.abs(y1 - y0) * ES)}" ${style}/>`);
const ecirc = (z, y, r, style) => out.push(`<circle cx="${ex(z)}" cy="${ey(y)}" r="${f(r * ES)}" ${style}/>`);
const arch = (zc, w, ySpring, yApex, style, yBase = 0) => {
  out.push(`<path d="M ${ex(zc - w / 2)} ${ey(yBase)} L ${ex(zc - w / 2)} ${ey(ySpring)} Q ${ex(zc - w / 2)} ${ey(yApex)} ${ex(zc)} ${ey(yApex)} Q ${ex(zc + w / 2)} ${ey(yApex)} ${ex(zc + w / 2)} ${ey(ySpring)} L ${ex(zc + w / 2)} ${ey(yBase)} Z" ${style}/>`);
};
out.push(`<g id="west-elevation">`);
erect(-30, 30, 0, 100, 'fill="#dfe6ee"');
const sp2 = C.spire;
out.push(`<path d="M ${ex(-3.8)} ${ey(sp2.base)} L ${ex(-2.4)} ${ey(68)} L ${ex(0)} ${ey(93)} L ${ex(2.4)} ${ey(68)} L ${ex(3.8)} ${ey(sp2.base)} Z" fill="#9aa4ab"/>`);
erect(-0.1, 0.1, 93, 96, 'fill="#555"');
const stone = 'fill="#d8cfb6" stroke="#4a4234"';
erect(-W.width / 2, W.width / 2, 0, W.centerSectionTop, stone);
for (const t of W.towers) erect(t.z0, t.z1, 0, t.terrace.balustradeTop, stone);
for (const b of W.buttresses) erect(b.z - b.width / 2, b.z + b.width / 2, 0, b.top, 'fill="#c8bea3" stroke="#4a4234"');
for (const p of W.portals) {
  arch(p.z, p.outerWidth, p.outerApex - p.outerWidth * 0.45, p.outerApex, 'fill="#bfb497" stroke="#4a4234"');
  arch(p.z, p.openingWidth, p.doorHeight, p.openingApex, 'fill="#6e6553" stroke="#4a4234"');
  erect(p.z - p.openingWidth / 2, p.z + p.openingWidth / 2, p.doorHeight, p.doorHeight + 0.6, 'fill="#bfb497"');
  if (p.gable) out.push(`<path d="M ${ex(p.z - p.gable.width / 2)} ${ey(p.outerApex - 1.5)} L ${ex(p.z)} ${ey(p.gable.apex)} L ${ex(p.z + p.gable.width / 2)} ${ey(p.outerApex - 1.5)}" fill="none" stroke="#4a4234"/>`);
}
const gk = W.galleryOfKings; erect(-W.width / 2, W.width / 2, gk.yBottom, gk.yTop, 'fill="#c8bea3" stroke="#4a4234"');
for (const k of gk.statues) erect(k.z - 0.35, k.z + 0.35, k.y, k.y + k.height, 'fill="#8c8270"');
const rt = W.roseTier; erect(-W.width / 2, W.width / 2, rt.terrace.y, rt.terrace.y + rt.terrace.balustradeHeight, 'fill="#c8bea3" stroke="#4a4234"');
ecirc(rt.westRose.z, rt.westRose.y, rt.westRose.diameter / 2, 'fill="#4d5a6e" stroke="#4a4234"');
ecirc(rt.westRose.z, rt.westRose.y, rt.westRose.diameter / 4, 'fill="none" stroke="#c8bea3"');
for (const w of rt.towerWindows) arch(w.z, w.width, w.sill + w.height * 0.6, w.sill + w.height, 'fill="#6e6553" stroke="#4a4234"', w.sill);
for (const w of rt.wallRosettes) ecirc(w.z, w.y, w.diameter / 2, 'fill="none" stroke="#4a4234"');
for (const s of rt.statues) erect(s.z - 0.5, s.z + 0.5, s.y, s.y + s.height, 'fill="#8c8270"');
const gg = W.grandGallery;
for (const sct of gg.sections) {
  const n2 = gg.baysPerSection[sct.id] * gg.lancetsPerBay, w = (sct.z1 - sct.z0) / n2;
  for (let i = 0; i < n2; i++) erect(sct.z0 + i * w + 0.25, sct.z0 + (i + 1) * w - 0.25, gg.yBottom + 0.5, gg.arcadeTop - 0.5, 'fill="#5f6b78"');
}
erect(-W.width / 2, W.width / 2, gg.arcadeTop, gg.balustradeTop, 'fill="#c8bea3" stroke="#4a4234"');
for (const t of W.towers) {
  const o = t.belfry.openings, zc = (t.z0 + t.z1) / 2;
  for (const s of [-1, 1]) erect(zc + s * o.offset - o.width / 2, zc + s * o.offset + o.width / 2, o.sill, o.sill + o.height, 'fill="#4b4438"');
  erect(t.z0, t.z1, t.terrace.y, t.terrace.balustradeTop, 'fill="#c8bea3" stroke="#4a4234"');
}
for (const c of W.chimeras.filter((c) => c.x === 0)) ecirc(c.z, c.y + 0.8, 0.7, 'fill="#6b6253"');
for (const s of W.buttressNicheStatues) erect(s.z - 0.5, s.z + 0.5, s.y, s.y + s.height, 'fill="#8c8270"');
for (const y of [0, 20, 40, 60, 80, 96]) out.push(`<text x="${ex(-29)}" y="${ey(y) + 4}" font-size="10">${y} m</text>`);
out.push(`<text x="${ex(0)}" y="${ey(100) + 12}" font-size="14" text-anchor="middle">西立面（北在左）</text>`);
out.push(`</g>`);

const totalW = EOX + 60 * ES + 20, totalH = Math.max(PH * PS, (EH + 6) * ES + 20);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="sans-serif" fill="#222">
<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>
<rect width="100%" height="100%" fill="#fff"/>
${out.join('\n')}
</svg>\n`;
writeFileSync(new URL('../plan.svg', import.meta.url), svg);
console.log(`plan.svg 已輸出（${totalW}×${totalH}）`);
