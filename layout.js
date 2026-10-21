// =============================================================================
// layout.js — 巴黎聖母院（2019 年火災前）春分傍晚場景平面圖
// -----------------------------------------------------------------------------
// 這是整個專案「唯一」的座標來源。之後所有 three.js 程式（建築、雕刻、廣場、
// 燈光、攝影機）都只能 import 這份檔案讀位置與尺寸，不得在別處寫死座標。
//
// 單位：公尺（m）；角度欄位一律以 Deg 結尾標明「度」。
//
// 座標系（右手系，與 three.js 預設一致，Y 朝上）：
//   原點  = 西立面正面牆面、中央「最後審判門」門檻中心，地面高度 y = 0
//   +X   = 教堂禮儀上的「東」：沿中軸線由西立面往後殿（apse）
//   +Y   = 上
//   +Z   = 教堂禮儀上的「南」：塞納河南支流那一側
//   （所以 -X 是前廣場，-Z 是北側 / 主宮醫院 Hôtel-Dieu 那側）
//
// 真實羅盤：聖母院中軸並非正東西，教堂的「東」(+X) 指向真方位角
// AXIS_AZIMUTH_DEG（約東南東）。太陽等真實方位都經由 compassToLocal() 換算。
//
// 尺寸以公開的實測數據為準（全長 128、西立面寬約 41、鐘樓 69、
// 尖塔 96、拱頂 33、西玫瑰窗直徑 9.6、袖廊玫瑰窗 12.9 …），
// 其餘細部為依比例的合理推估，已在註解標「示意」。
// =============================================================================

const DEG = Math.PI / 180;
const round = (v) => Math.round(v * 1000) / 1000;
const range = (n) => Array.from({ length: n }, (_, i) => i);

// -----------------------------------------------------------------------------
// 方位
// -----------------------------------------------------------------------------
/** 教堂中軸 +X 方向的真方位角（由正北順時針）。實際約 110°–115°。 */
export const AXIS_AZIMUTH_DEG = 113;

/**
 * 真實羅盤方位（方位角、仰角）→ 本地座標的單位向量 [x, y, z]
 * （指「朝向」該方位，例如傳入太陽方位就得到「指向太陽」的向量）。
 */
export function compassToLocal(azimuthDeg, elevationDeg = 0) {
  const a = (azimuthDeg - AXIS_AZIMUTH_DEG) * DEG;
  const e = elevationDeg * DEG;
  return [round(Math.cos(e) * Math.cos(a)), round(Math.sin(e)), round(Math.cos(e) * Math.sin(a))];
}

// -----------------------------------------------------------------------------
// 尖拱與門洞的共用幾何（立面與雕刻兩個模組都必須用這裡算，才會對齊）
// -----------------------------------------------------------------------------
/** 等邊尖拱：跨度 span、拱頂高 apex → 起拱高、兩圓心、半徑 */
export function pointedArch(span, apex) {
  const radius = span;                         // 等邊尖拱：半徑 = 跨度
  const rise = round(span * Math.sqrt(3) / 2); // 起拱線到拱頂
  return { span, apex, radius, rise, springing: round(apex - rise), centers: [span / 2, -span / 2] /* 相對中線的水平位置 */ };
}

/**
 * 門的第 k 圈拱圈（0 = 最內圈）：沿門洞斜面由內往外線性內插。
 * x 為該圈的深度（從立面往內），span/apex 為該圈中心線的尖拱。
 */
export function archivoltRing(portal, k) {
  const f = (k + 0.5) / portal.archivolts;
  const span = portal.openingWidth + (portal.outerWidth - portal.openingWidth) * f;
  const apex = portal.openingApex + (portal.outerApex - portal.openingApex) * f;
  return { k, x: round(portal.splayDepth * (1 - f)), width: round((portal.outerWidth - portal.openingWidth) / 2 / portal.archivolts), ...pointedArch(round(span), round(apex)) };
}

/** 門楣（tympanum）分層：下兩條橫帶 + 上方尖拱半月面；位於 x = splayDepth 的平面 */
export function tympanumRegisters(portal) {
  const y0 = portal.doorHeight;
  const bands = portal.tympanumBands || [1.0];
  const regs = [];
  let y = y0;
  for (const hgt of bands) { regs.push({ y0: round(y), y1: round(y + hgt), shape: 'band' }); y += hgt; }
  regs.push({ y0: round(y), y1: portal.openingApex, shape: 'lunette', arch: pointedArch(portal.openingWidth, portal.openingApex) });
  return { x: portal.splayDepth, width: portal.openingWidth, registers: regs };
}

// -----------------------------------------------------------------------------
// 共用斷面尺寸（中殿與詩班席相同）
// z 皆為「半寬」，南北對稱，北側取負值。
// -----------------------------------------------------------------------------
const SECTION = {
  vesselWallZ: 6.5,       // 主殿高牆（clerestory wall）中心線
  wallThickness: 1.2,
  innerAisleOuterZ: 12.5, // 內側廊外緣 = 飛扶壁中間柱（palée）中心線
  outerAisleOuterZ: 18.0, // 外側廊外緣
  chapelOuterZ: 21.5,     // 側禮拜堂外牆（扶壁之間）
  culeeInnerZ: 21.0,      // 扶壁墩（culée）內緣
  culeeOuterZ: 23.5,      // 扶壁墩外緣
};

const HEIGHTS = {
  vault: 33.0,             // 主殿拱頂（室內）
  wallTop: 33.9,           // 高牆簷口 = 主屋頂簷口
  roofPitchDeg: 55,        // 鉛皮屋頂坡度
  tribuneRoofLow: 20.0,    // 樓廊（tribune）斜屋頂低端，位於 innerAisleOuterZ
  tribuneRoofHigh: 24.0,   // 樓廊斜屋頂高端，靠在高牆上
  aisleRoofLow: 12.0,      // 外側廊 + 禮拜堂斜屋頂低端（外牆頂）
  aisleRoofHigh: 15.5,     // 外側廊斜屋頂高端，靠在樓廊牆上
  culeeTop: 30.0,          // 扶壁墩頂
  culeePinnacleTip: 35.0,  // 扶壁墩小尖塔頂
  paleeTop: 29.5,          // 中間柱頂
  paleePinnacleTip: 33.0,
};
const roofEaveZ = SECTION.vesselWallZ + SECTION.wallThickness / 2;
HEIGHTS.ridge = round(HEIGHTS.wallTop + roofEaveZ * Math.tan(HEIGHTS.roofPitchDeg * DEG)); // ≈ 44.0

// -----------------------------------------------------------------------------
// 平面分段（沿 X）
// -----------------------------------------------------------------------------
const WEST_FRONT_DEPTH = 13.0;     // 西立面 / 雙塔量體深度 x: 0 → 13
const NAVE_X0 = WEST_FRONT_DEPTH;  // 13
const NAVE_BAYS = 8;
const NAVE_BAY = 5.75;
const CROSSING_X0 = NAVE_X0 + NAVE_BAYS * NAVE_BAY; // 59
const CROSSING_W = 14.0;
const CROSSING_X1 = CROSSING_X0 + CROSSING_W;       // 73
const CROSSING_CX = (CROSSING_X0 + CROSSING_X1) / 2; // 66
const CHOIR_BAYS = 5;
const CHOIR_BAY = 6.7;
const APSE_CX = CROSSING_X1 + CHOIR_BAYS * CHOIR_BAY; // 106.5（後殿半圓圓心）
const APSE_OUTER_R = SECTION.chapelOuterZ;            // 21.5 → 後殿最東端 x = 128
const TOTAL_LENGTH = APSE_CX + APSE_OUTER_R;          // 128
const TRANSEPT_FACADE_Z = 24.0;                       // 袖廊立面，全寬 48

// 主殿後殿為半個正十邊形：頂點角度（由 +X 量起，負值偏北）
const APSE_VERTEX_ANGLES_DEG = [-90, -54, -18, 18, 54, 90];

// 開間分隔線（柱位）
const navePierXs = range(NAVE_BAYS + 1).map((i) => round(NAVE_X0 + i * NAVE_BAY));
const choirPierXs = range(CHOIR_BAYS + 1).map((i) => round(CROSSING_X1 + i * CHOIR_BAY));
const naveBayCenters = range(NAVE_BAYS).map((i) => round(NAVE_X0 + (i + 0.5) * NAVE_BAY));
const choirBayCenters = range(CHOIR_BAYS).map((i) => round(CROSSING_X1 + (i + 0.5) * CHOIR_BAY));

// 後殿某角度、某半徑的平面點 [x, z]
const apsePoint = (angleDeg, r) => [round(APSE_CX + r * Math.cos(angleDeg * DEG)), round(r * Math.sin(angleDeg * DEG))];

// -----------------------------------------------------------------------------
// 西立面
// -----------------------------------------------------------------------------
const FACADE_HALF_W = 20.5; // 西立面寬 41
const TOWER_CENTER_Z = 13.25;

// 四道立面扶壁把立面分成三段（北塔 / 中段 / 南塔）
const facadeButtresses = [-19.2, -7.3, 7.3, 19.2].map((z) => ({
  z,
  width: 2.6,
  projection: 1.6, // 往廣場凸出：x 從 -1.6 到 0
  top: 44.0,       // 到大迴廊底
  setbacks: [{ y: 17.0, projection: 1.2 }, { y: 22.5, projection: 0.8 }, { y: 38.0, projection: 0.5 }],
  // 照片：玫瑰窗層的扶壁正面各有一座帶三角頂的小龕（gâble）
  gablet: { y: 27.5, height: 3.0, width: 1.8 },
}));

/** 依門洞參數產生門側像（jamb statues）沿斜面（splay）的位置 */
function jambStatues(p, perSide, baseY, height) {
  const out = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide; i++) {
      const t = (i + 0.5) / perSide; // 0 = 外緣（x=0），1 = 門洞內緣（x=splayDepth）
      const halfW = p.outerWidth / 2 + (p.openingWidth / 2 - p.outerWidth / 2) * t;
      out.push({
        x: round(t * p.splayDepth - 0.3),
        y: baseY,
        z: round(p.z + side * (halfW + 0.35)),
        height,
        facingDeg: side < 0 ? 45 : -45, // 相對 -X（面向廣場）往門洞中心轉
      });
    }
  }
  return out;
}

function portal(def) {
  const p = { ...def };
  p.jambStatues = jambStatues(p, def.jambStatuesPerSide, 1.9, 2.6);
  // 門側像下方的基座：兩排四葉形浮雕圓章（美德與惡習、月令）
  p.socle = { height: 1.9, medallionRows: 2, medallionShape: 'quatrefoil' };
  // 照片：每座門的拱圈外層都有一圈連續捲葉飾
  p.outerCrockets = true;
  p.trumeauStatue = { x: round(p.splayDepth - 0.5), y: 1.6, z: p.z, height: 3.0, subject: def.trumeauSubject };
  return p;
}

const westPortals = [
  portal({
    // 比例依照片量測（以門側像與行人為尺）
    id: 'portalVirgin', name: '聖母門 Portail de la Vierge', z: -TOWER_CENTER_Z,
    openingWidth: 4.4, doorHeight: 5.0, openingApex: 8.9,
    outerWidth: 9.0, outerApex: 12.0, splayDepth: 2.8,
    archivolts: 4, jambStatuesPerSide: 4, trumeauSubject: '聖母子',
    tympanumRegisters: 3, tympanumBands: [0.9, 1.1], gable: { apex: 14.4, width: 9.4 }, // 只有聖母門上方有三角楣
    doors: { leaves: 2, ironwork: 'scrolls' }, // 兩側門：滿版鍛鐵捲花鉸鏈
  }),
  portal({
    id: 'portalJudgment', name: '最後審判門 Portail du Jugement dernier', z: 0,
    openingWidth: 4.6, doorHeight: 5.4, openingApex: 10.6,
    outerWidth: 11.6, outerApex: 15.2, splayDepth: 3.2,
    archivolts: 6, jambStatuesPerSide: 6, trumeauSubject: '基督（Beau Dieu）', // 十二使徒
    tympanumRegisters: 3, tympanumBands: [1.0, 1.3], gable: null, // 下：死者復活；中：秤靈魂；上：審判的基督
    doors: { leaves: 2, ironwork: 'plain' }, // 中門：素面木門
  }),
  portal({
    id: 'portalStAnne', name: '聖安娜門 Portail Sainte-Anne', z: TOWER_CENTER_Z,
    openingWidth: 4.4, doorHeight: 5.0, openingApex: 8.9,
    outerWidth: 9.0, outerApex: 12.0, splayDepth: 2.8,
    archivolts: 4, jambStatuesPerSide: 4, trumeauSubject: '聖瑪塞爾 Saint Marcel',
    tympanumRegisters: 3, tympanumBands: [0.9, 1.1], gable: null,
    doors: { leaves: 2, ironwork: 'scrolls' },
  }),
];

// 國王廊：28 尊猶大與以色列諸王，橫跨整個立面
const KINGS = 28;
const galleryOfKings = {
  yBottom: 17.0, yTop: 21.5,
  statueBaseY: 17.6, statueHeight: 3.5,
  recessX: 0.6, // 壁龕內縮
  statues: range(KINGS).map((i) => ({
    x: 0.3,
    y: 17.6,
    z: round(-FACADE_HALF_W + (i + 0.5) * ((2 * FACADE_HALF_W) / KINGS)),
    height: 3.5,
  })),
  arcadeArches: KINGS,
};

const roseTier = {
  yBottom: 22.5, yTop: 38.0,
  terrace: { y: 22.5, depth: 1.6, balustradeHeight: 1.0 }, // 聖母露臺
  // 照片：中心小圓 → 12 根內圈放射細柱 → 24 根外圈細柱，外緣一圈尖瓣拱
  westRose: {
    x: 0.4, y: 30.5, z: 0, diameter: 9.6,
    centerOculusDiameter: 1.8, innerSpokes: 12, outerSpokes: 24, petals: 24,
    enclosingArch: { width: 12.0, apex: 37.0, mouldings: 3 }, // 包住玫瑰窗的大圓拱
  },
  // 照片：塔段為一個大尖拱包住兩扇尖窗，上方一個玫瑰圓窗
  towerWindows: [-TOWER_CENTER_Z, TOWER_CENTER_Z].map((z) => ({
    z, sill: 24.0, height: 12.0, width: 7.0, lancets: 2,
    lancetWidth: 2.2, lancetHeight: 7.2, oculusDiameter: 2.8, oculusY: 33.2,
  })),
  // 照片：拱肩牆面上的三葉形盲飾圓章
  wallRosettes: [-19.0, -8.5, -5.0, 5.0, 8.5, 19.0].map((z) => ({ x: -0.05, y: 36.2, z, diameter: 1.8, lobes: 3 })),
  statues: [
    { id: 'virgin', subject: '聖母子', x: -0.8, y: 23.5, z: 0, height: 4.0 },
    { id: 'angelN', subject: '天使', x: -0.8, y: 23.5, z: -2.6, height: 3.2 },
    { id: 'angelS', subject: '天使', x: -0.8, y: 23.5, z: 2.6, height: 3.2 },
    // 照片：亞當、夏娃站在兩側塔窗中間的窗柱前
    { id: 'adam', subject: '亞當', x: -0.8, y: 23.5, z: -TOWER_CENTER_Z, height: 3.2 },
    { id: 'eve', subject: '夏娃', x: -0.8, y: 23.5, z: TOWER_CENTER_Z, height: 3.2 },
  ],
};

// 大迴廊（細柱尖拱長廊）+ 其上的怪獸迴廊（Galerie des chimères）欄杆
const grandGallery = {
  yBottom: 38.0, arcadeTop: 44.0, balustradeTop: 46.0,
  colonnetteRadius: 0.18,
  // 照片：細長雙柱、三葉形拱頂；每個開間兩道尖拱
  baysPerSection: { northTower: 4, center: 3, southTower: 4 },
  lancetsPerBay: 2,
  tracery: 'trefoil',
  sections: [
    { id: 'northTower', z0: -FACADE_HALF_W, z1: -6.0 },
    { id: 'center', z0: -6.0, z1: 6.0 },
    { id: 'southTower', z0: 6.0, z1: FACADE_HALF_W },
  ],
};

// 怪獸雕像（chimères）：站在 46 m 欄杆的塔角與中段
const chimeras = [];
for (const [z0, z1] of [[-FACADE_HALF_W, -6.0], [6.0, FACADE_HALF_W]]) {
  for (const x of [0.0, WEST_FRONT_DEPTH]) {
    for (const z of [z0, z1]) chimeras.push({ x, y: 46.0, z, height: 1.6 });
  }
  chimeras.push({ x: 0.0, y: 46.0, z: round((z0 + z1) / 2), height: 1.4 });
}
// 北塔西北角那隻就是托腮望向巴黎的「沉思者」Le Stryge
const chimerasWithId = chimeras.map((c, i) => {
  const stryge = c.x === 0 && c.z === -FACADE_HALF_W;
  return { id: stryge ? 'stryge' : `chimera${i}`, ...c, ...(stryge ? { height: 1.9, pose: 'chinOnHands' } : {}), facingOutward: true };
});

const towers = [
  { id: 'northTower', z0: -FACADE_HALF_W, z1: -6.0 },
  { id: 'southTower', z0: 6.0, z1: FACADE_HALF_W },
].map((t) => ({
  ...t,
  x0: 0, x1: WEST_FRONT_DEPTH,
  belfry: {
    yBottom: 46.0, yTop: 68.0,
    // 每一面兩扇高窄百葉尖窗（abat-son），中心在塔面中心 ± 2.6
    openings: { perFace: 2, width: 2.4, sill: 48.0, height: 16.0, offset: 2.6, archivolts: 3, louvres: true },
  },
  // 照片：塔角扶壁滿佈細長盲拱與捲葉，頂端小尖塔
  cornerButtresses: { size: 1.6, top: 64.0, pinnacleTip: 66.0 },
  topCornice: { y: 66.5, corbelTable: true },
  terrace: { y: 68.0, balustradeTop: 69.0, roof: { type: 'lowHip', rise: 2.0 } }, // 塔高 69 m；平台中央低坡鉛頂
}));
// 照片：每座塔外側西角各有一座樓梯小塔，圓錐頂略高出欄杆
const stairTurrets = [
  { tower: 'northTower', x: 1.2, z: -19.3 },
  { tower: 'southTower', x: 1.2, z: 19.3 },
].map((t) => ({ ...t, radius: 1.3, top: 70.0, coneTip: 73.0 }));

// 立面扶壁正面壁龕雕像
const buttressNicheStatues = [
  { subject: '聖德尼 Saint Denis', z: -19.2 },
  { subject: '教會 Ecclesia', z: -7.3 },
  { subject: '會堂 Synagoga', z: 7.3 },
  { subject: '聖艾蒂安 Saint Étienne', z: 19.2 },
].map((s) => ({ ...s, x: -1.75, y: 5.6, height: 2.8, canopy: { height: 1.4 } }));

// -----------------------------------------------------------------------------
// 扶壁墩、飛扶壁、小尖塔、滴水獸（全部由開間自動產生）
// -----------------------------------------------------------------------------
const culeeMidZ = (SECTION.culeeInnerZ + SECTION.culeeOuterZ) / 2; // 22.25
const wallOuterZ = SECTION.vesselWallZ + SECTION.wallThickness / 2; // 7.1

const buttressPiers = [];  // culées
const flyingButtresses = [];
const paleePiers = [];     // 中殿兩段式飛扶壁的中間柱

// 中殿：兩段式（跨內外側廊，中間落在 palée 上），柱位 1..7（0 貼塔、8 為交叉部）
for (const x of navePierXs.slice(1, -1)) {
  for (const s of [-1, 1]) {
    buttressPiers.push({ x, z: s * culeeMidZ, width: 2.0, depth: SECTION.culeeOuterZ - SECTION.culeeInnerZ, top: HEIGHTS.culeeTop, pinnacleTip: HEIGHTS.culeePinnacleTip, zone: 'nave' });
    paleePiers.push({ x, z: s * SECTION.innerAisleOuterZ, width: 1.2, depth: 1.4, top: HEIGHTS.paleeTop, pinnacleTip: HEIGHTS.paleePinnacleTip });
    flyingButtresses.push({
      zone: 'nave', x, side: s,
      flights: [
        { foot: [x, 27.0, s * SECTION.culeeInnerZ], head: [x, 29.5, s * (SECTION.innerAisleOuterZ + 0.7)] },
        { foot: [x, 29.5, s * (SECTION.innerAisleOuterZ - 0.7)], head: [x, 31.5, s * wallOuterZ] },
      ],
      thickness: 0.9, archDepth: 1.0,
    });
  }
}
// 詩班席：單跨約 15 m（聖母院著名的單跨飛扶壁），柱位 1..5
for (const x of choirPierXs.slice(1)) {
  for (const s of [-1, 1]) {
    buttressPiers.push({ x, z: s * culeeMidZ, width: 2.0, depth: SECTION.culeeOuterZ - SECTION.culeeInnerZ, top: HEIGHTS.culeeTop, pinnacleTip: HEIGHTS.culeePinnacleTip, zone: 'choir' });
    flyingButtresses.push({
      zone: 'choir', x, side: s,
      flights: [{ foot: [x, 26.0, s * SECTION.culeeInnerZ], head: [x, 31.5, s * wallOuterZ] }],
      thickness: 0.8, archDepth: 1.1,
    });
  }
}
// 後殿放射狀（±90° 已由詩班席最後一根柱涵蓋）
for (const a of APSE_VERTEX_ANGLES_DEG.slice(1, -1)) {
  const [fx, fz] = apsePoint(a, SECTION.culeeInnerZ);
  const [hx, hz] = apsePoint(a, wallOuterZ);
  const [cx, cz] = apsePoint(a, culeeMidZ);
  buttressPiers.push({ x: cx, z: cz, width: 2.0, depth: SECTION.culeeOuterZ - SECTION.culeeInnerZ, rotationDeg: a, top: HEIGHTS.culeeTop, pinnacleTip: HEIGHTS.culeePinnacleTip, zone: 'apse' });
  flyingButtresses.push({
    zone: 'apse', angleDeg: a,
    flights: [{ foot: [fx, 26.0, fz], head: [hx, 31.5, hz] }],
    thickness: 0.8, archDepth: 1.1,
  });
}

// 滴水獸（gargouilles）：扶壁墩頂朝外、主屋簷每個柱位、雙塔大迴廊轉角
const gargoyles = [];
for (const p of buttressPiers) {
  const dir = p.zone === 'apse'
    ? [round(Math.cos(p.rotationDeg * DEG)), 0, round(Math.sin(p.rotationDeg * DEG))]
    : [0, 0, Math.sign(p.z)];
  gargoyles.push({ x: p.x, y: 27.0, z: p.z, dir, length: 2.0, source: 'culee' });
}
for (const x of [...navePierXs.slice(1, -1), ...choirPierXs.slice(1)]) {
  for (const s of [-1, 1]) gargoyles.push({ x, y: HEIGHTS.wallTop - 0.4, z: s * wallOuterZ, dir: [0, 0, s], length: 1.6, source: 'clerestory' });
}
for (const t of towers) {
  for (const x of [0, WEST_FRONT_DEPTH]) {
    for (const z of [t.z0, t.z1]) {
      const dx = x === 0 ? -1 : 1;
      const dz = Math.abs(z) === FACADE_HALF_W ? Math.sign(z) : 0; // 外側轉角斜向朝外
      gargoyles.push({ x, y: 44.3, z, dir: [dx, 0, dz], length: 1.8, source: 'tower' });
    }
  }
}

// 窗
const windows = { clerestory: [], chapel: [], tribuneOculi: [] };
const chapelGablets = []; // 照片：側禮拜堂每個開間的窗上有一座三角山花
for (const x of [...naveBayCenters, ...choirBayCenters]) {
  for (const s of [-1, 1]) {
    windows.clerestory.push({ x, z: s * wallOuterZ, sill: 24.5, height: 8.5, width: 3.2, lancets: 2, oculus: true });
    windows.chapel.push({ x, z: s * SECTION.chapelOuterZ, sill: 3.0, height: 7.0, width: 3.2, lancets: 2, oculus: true });
    chapelGablets.push({ x, z: s * SECTION.chapelOuterZ, base: HEIGHTS.aisleRoofLow, apex: 15.5, width: 4.0 });
  }
}
// 照片：緊鄰交叉部的開間，高窗下方有維奧萊-勒-杜克復原的 12 世紀圓窗，
// 那幾個開間的樓廊屋頂改成較低的平台（terraceY）
for (const x of [naveBayCenters[NAVE_BAYS - 1], choirBayCenters[0]]) {
  for (const s of [-1, 1]) windows.tribuneOculi.push({ x, z: s * wallOuterZ, y: 22.0, diameter: 3.0, terraceY: 19.5 });
}
// 後殿高窗與放射禮拜堂窗：放在相鄰頂點角度的中間
for (let i = 0; i < APSE_VERTEX_ANGLES_DEG.length - 1; i++) {
  const a = (APSE_VERTEX_ANGLES_DEG[i] + APSE_VERTEX_ANGLES_DEG[i + 1]) / 2;
  const [hx, hz] = apsePoint(a, wallOuterZ);
  const [cx, cz] = apsePoint(a, SECTION.chapelOuterZ);
  windows.clerestory.push({ x: hx, z: hz, angleDeg: a, sill: 24.5, height: 8.5, width: 3.0, lancets: 2, oculus: true });
  windows.chapel.push({ x: cx, z: cz, angleDeg: a, sill: 3.0, height: 7.0, width: 3.0, lancets: 2, oculus: true });
}

// -----------------------------------------------------------------------------
// 袖廊立面（北：修院門 Portail du Cloître；南：聖艾蒂安門 Portail Saint-Étienne）
// -----------------------------------------------------------------------------
const transeptFacade = (side) => ({
  id: side < 0 ? 'northTransept' : 'southTransept',
  z: side * TRANSEPT_FACADE_Z,
  x0: CROSSING_X0, x1: CROSSING_X1,
  gableApex: 47.0,
  // 照片：轉角小塔的尖頂高過山牆
  cornerTurrets: [CROSSING_X0, CROSSING_X1].map((x) => ({ x, z: side * TRANSEPT_FACADE_Z, size: 2.2, top: 40.0, pinnacleTip: 52.0 })),
  portal: {
    name: side < 0 ? '修院門 Portail du Cloître' : '聖艾蒂安門 Portail Saint-Étienne',
    x: CROSSING_CX, openingWidth: 5.0, doorHeight: 6.2, openingApex: 11.0,
    outerWidth: 9.0, outerApex: 14.0, splayDepth: 2.2, archivolts: 4,
    gable: { apex: 17.5, width: 9.6 },
    trumeauStatue: { height: 2.8, subject: side < 0 ? '聖母' : '聖艾蒂安' },
  },
  claireVoie: { yBottom: 17.5, yTop: 19.5, lancets: 9 }, // 玫瑰窗下一排透光尖窗
  rose: { x: CROSSING_CX, y: 26.0, diameter: 12.9, petals: side < 0 ? 16 : 12 /* 示意 */ },
  gableOculus: { x: CROSSING_CX, y: 40.5, diameter: 4.5 }, // 照片：山牆上的小玫瑰窗
  gableStatue: { x: CROSSING_CX, y: 47.0, height: 2.2, subject: side < 0 ? '十字架' : '聖艾蒂安' }, // 示意
});

// -----------------------------------------------------------------------------
// 屋頂 + 尖塔 + 尖塔腳下 16 尊銅像（12 使徒 + 4 福音書作者象徵）
// -----------------------------------------------------------------------------
const roof = {
  eave: HEIGHTS.wallTop,
  eaveZ: round(wallOuterZ),
  ridge: HEIGHTS.ridge,
  pitchDeg: HEIGHTS.roofPitchDeg,
  material: 'lead',
  crest: { height: 0.6 }, // 屋脊鏤空鉛飾（crête）
  eaveBalustrade: { height: 1.0 }, // 照片：高牆簷口有一圈石欄杆走道
  // 照片：屋面上零星的小老虎窗（通風口）
  dormers: [24, 38, 50, 84, 96].flatMap((x) => [-1, 1].map((s) => ({ x, side: s, y: 38.5, width: 1.0, height: 1.4 }))),
  segments: [
    { id: 'nave', axis: 'x', x0: NAVE_X0, x1: CROSSING_X0, westEnd: 'hiddenGable' }, // 山牆藏在 46 m 大迴廊後
    { id: 'crossing', axis: 'x', x0: CROSSING_X0, x1: CROSSING_X1 },
    { id: 'northTransept', axis: 'z', z0: -TRANSEPT_FACADE_Z, z1: -wallOuterZ, x0: CROSSING_X0, x1: CROSSING_X1 },
    { id: 'southTransept', axis: 'z', z0: wallOuterZ, z1: TRANSEPT_FACADE_Z, x0: CROSSING_X0, x1: CROSSING_X1 },
    { id: 'choir', axis: 'x', x0: CROSSING_X1, x1: APSE_CX },
    { id: 'apse', type: 'halfPolygonHip', cx: APSE_CX, radius: round(wallOuterZ), vertexAnglesDeg: APSE_VERTEX_ANGLES_DEG },
  ],
  lowRoofs: {
    tribune: { zLow: SECTION.innerAisleOuterZ, yLow: HEIGHTS.tribuneRoofLow, zHigh: wallOuterZ, yHigh: HEIGHTS.tribuneRoofHigh },
    aisle: { zLow: SECTION.chapelOuterZ, yLow: HEIGHTS.aisleRoofLow, zHigh: SECTION.innerAisleOuterZ, yHigh: HEIGHTS.aisleRoofHigh },
  },
};

const spire = {
  x: CROSSING_CX, z: 0,
  base: HEIGHTS.ridge,
  octagonRadius: 3.8,       // 底部八角外接圓半徑
  stages: [
    { id: 'base', y0: HEIGHTS.ridge, y1: 55.0, radius: 3.8, openings: 8, gables: 8, cornerPinnacles: 4 },
    { id: 'lantern', y0: 55.0, y1: 68.0, radius: 3.0, openings: 8 },
    { id: 'needle', y0: 68.0, y1: 93.0, radiusBottom: 2.4, radiusTop: 0.15, crockets: true },
    { id: 'cross', y0: 93.0, y1: 95.4, width: 1.4 },
    { id: 'rooster', y0: 95.4, y1: 96.0 }, // 銅公雞，總高 96 m
  ],
  top: 96.0,
  material: 'leadOverOak',
};

// 四組銅像沿四條屋脊往下排（每組 3 使徒 + 1 福音書象徵在最低處）
// 銅像使徒與象徵的實際對應方位待考，此處只定位置。
const apostleGroups = [
  { id: 'west', dir: [-1, 0] },
  { id: 'east', dir: [1, 0] },
  { id: 'north', dir: [0, -1] },
  { id: 'south', dir: [0, 1] },
].map((g, gi) => ({
  id: g.id,
  statues: range(4).map((k) => {
    const d = 8.5 + k * 2.0;
    return {
      kind: k < 3 ? 'apostle' : 'evangelistSymbol',
      x: round(CROSSING_CX + g.dir[0] * d),
      y: round(HEIGHTS.ridge + 1.6 - k * 0.8), // 階梯狀台座頂
      z: round(g.dir[1] * d),
      height: k < 3 ? 3.4 : 2.2,
      facingSpire: gi === 3 && k === 0, // 示意：南組最上方一尊回頭望尖塔（聖多馬）
    };
  }),
}));
// 實際上是 12 使徒 + 4 象徵 = 16；上面每組 3 使徒 + 1 象徵 = 16 ✓

// -----------------------------------------------------------------------------
// 主體量（其他程式據此擠出牆體）
// -----------------------------------------------------------------------------
const cathedral = {
  totalLength: TOTAL_LENGTH,
  totalWidth: TRANSEPT_FACADE_Z * 2,
  floorY: 0,
  section: SECTION,
  heights: HEIGHTS,

  westFront: {
    x0: 0, x1: WEST_FRONT_DEPTH,
    z0: -FACADE_HALF_W, z1: FACADE_HALF_W,
    width: FACADE_HALF_W * 2,
    plinth: { height: 1.2 },
    buttresses: facadeButtresses,
    portals: westPortals,
    portalZone: { yTop: 16.5 },
    buttressNicheStatues,
    galleryOfKings,
    roseTier,
    grandGallery,
    chimeras: chimerasWithId,
    towers,
    stairTurrets,
    centerSectionTop: 46.0,
  },

  nave: {
    x0: NAVE_X0, x1: CROSSING_X0,
    bays: NAVE_BAYS, bayLength: NAVE_BAY,
    pierXs: navePierXs, bayCenters: naveBayCenters,
  },

  transept: {
    crossing: { x0: CROSSING_X0, x1: CROSSING_X1, cx: CROSSING_CX },
    armZ: TRANSEPT_FACADE_Z,
    facades: [transeptFacade(-1), transeptFacade(1)],
  },

  choir: {
    x0: CROSSING_X1, x1: APSE_CX,
    bays: CHOIR_BAYS, bayLength: CHOIR_BAY,
    pierXs: choirPierXs, bayCenters: choirBayCenters,
  },

  apse: {
    cx: APSE_CX, z: 0,
    vertexAnglesDeg: APSE_VERTEX_ANGLES_DEG,
    vesselRadius: SECTION.vesselWallZ,
    innerAmbulatoryRadius: SECTION.innerAisleOuterZ,
    outerAmbulatoryRadius: SECTION.outerAisleOuterZ,
    chapelRadius: SECTION.chapelOuterZ,
    radiatingChapels: 5,
    eastTipX: TOTAL_LENGTH,
  },

  roof,
  spire,
  apostleGroups,
  buttressPiers,
  paleePiers,
  flyingButtresses,
  windows,
  chapelGablets,
  gargoyles,

  // 詩班席北側的紅門
  porteRouge: { x: 81.0, z: -SECTION.chapelOuterZ, width: 2.4, height: 6.0, apex: 7.4, color: 'red' },

  // 維奧萊-勒-杜克所建的聖器室（南側，以廊道接詩班席）
  sacristy: {
    x0: 82.0, x1: 102.0, z0: 27.0, z1: 41.0, eave: 12.0, ridge: 17.0,
    passage: { x0: 88.0, x1: 92.0, z0: SECTION.culeeOuterZ, z1: 27.0, height: 6.0 },
  },
};

// -----------------------------------------------------------------------------
// 前廣場（Parvis Notre-Dame – Place Jean-Paul-II）
// -----------------------------------------------------------------------------
const PARVIS = { x0: -128.0, x1: 0.0, z0: -52.0, z1: 46.0 };

const parvis = {
  bounds: PARVIS,
  y: 0,
  paving: {
    material: 'limestoneSlab',
    slab: { alongX: 1.6, alongZ: 0.8, joint: 0.01 },
    // 淺色石材標示的中世紀街道與建築輪廓（考古標線）
    // 新聖母街（rue Neuve-Notre-Dame）原本沿中軸直通教堂
    medievalTraces: [
      { id: 'rueNeuveNotreDame', type: 'band', x0: -128.0, x1: -12.0, z0: -3.5, z1: 3.5, color: 'light' },
      // 以下為示意輪廓
      { id: 'oldBuildingA', type: 'outline', points: [[-96, -40], [-70, -40], [-70, -18], [-96, -18]] },
      { id: 'oldBuildingB', type: 'outline', points: [[-60, -44], [-34, -44], [-34, -22], [-60, -22]] },
      { id: 'oldBuildingC', type: 'outline', points: [[-100, 10], [-76, 10], [-76, 30], [-100, 30]] },
      { id: 'oldChurchApse', type: 'outline', points: [[-54, 12], [-36, 12], [-32, 20], [-36, 28], [-54, 28]] },
    ],
  },
  // 法國公路零起點：嵌在鋪面的八角銅星
  pointZero: { x: -21.0, z: 3.0, diameter: 0.6, material: 'bronze' },
  // 考古地下室入口（往下的階梯）
  cryptEntrance: { x0: -108.0, x1: -98.0, z0: -3.0, z1: 3.0, depth: 3.5, steps: 18, railingHeight: 1.0 },
  // 查理曼與騎士銅像（南側、靠塞納河）
  charlemagne: {
    x: -14.0, z: 34.0, facingDeg: 180, // 相對 +X，面向廣場（西）
    pedestal: { width: 2.6, length: 4.4, height: 2.6, material: 'stone' },
    group: { height: 5.2, material: 'bronze', figures: ['查理曼（騎馬）', '羅蘭', '奧利維耶'] },
  },
  trees: [
    // 南緣一排行道樹（法國梧桐），3 月剛冒新芽：枝幹清楚、樹冠稀疏淡綠
    ...range(10).map((i) => ({ x: -118 + i * 9, z: 41.0, species: 'plane', height: 15, canopyRadius: 4.5, foliage: 'budding' })),
    // 查理曼像四周
    { x: -24, z: 30, species: 'plane', height: 13, canopyRadius: 4, foliage: 'budding' },
    { x: -6, z: 30, species: 'plane', height: 13, canopyRadius: 4, foliage: 'budding' },
  ],
  lamps: [
    ...range(8).map((i) => ({ x: -120 + i * 16, z: -48.5 })),
    ...range(6).map((i) => ({ x: -120 + i * 16, z: 37.0 })),
  ].map((l) => ({ ...l, height: 4.2, style: 'parisCandelabra', lit: false })),
  benches: range(5).map((i) => ({ x: -110 + i * 18, z: 38.5, length: 2.0, facingDeg: -90 })),
  bollards: range(20).map((i) => ({ x: -126.5, z: -48 + i * 4.7, height: 0.8 })),
  // 照片：門前一道黑色鐵欄杆，門口留開口
  barrierAtFacade: {
    x: -4.5, z0: -20.0, z1: 20.0, height: 1.3, type: 'ironRailing', spearTops: true,
    openings: westPortals.map((p) => ({ z0: round(p.z - p.openingWidth / 2 - 0.5), z1: round(p.z + p.openingWidth / 2 + 0.5) })),
  },
};

// -----------------------------------------------------------------------------
// 周邊環境（只是量體，不做細節）
// -----------------------------------------------------------------------------
const surroundings = {
  island: { x0: -200, x1: 240, z0: -160, z1: 58, y: 0 },
  seine: {
    // 南支流：水面在地面下約 8 m
    south: { x0: -260, x1: 300, z0: 58, z1: 110, waterY: -8.0 },
    // 照片：島這側是石砌高牆直接入水；對岸有低處河岸步道
    quayWall: { z: 58, top: 0, bottom: -8.0, parapetHeight: 1.0 },
    leftBankQuayWall: { z: 110, top: 0, bottom: -8.0, parapetHeight: 1.0 },
    lowerQuay: { z0: 102, z1: 110, y: -6.5 },
    quayStairs: [{ x0: -24, x1: -18, z0: 58, z1: 61, from: 0, to: -6.5 }],
  },
  streets: [
    { id: 'rueDeLaCite', x0: -140, x1: -128, z0: -160, z1: 58 },
    { id: 'parvisNorthStreet', x0: -128, x1: 0, z0: -58, z1: -52 },
    { id: 'parvisSouthStreet', x0: -128, x1: 0, z0: 46, z1: 52 },
    { id: 'rueDuCloitre', x0: 0, x1: 140, z0: -40, z1: -30 },
  ],
  // 照片：聖母院正前方那座單拱石橋是雙倍橋（Pont au Double）
  bridges: [
    { id: 'pontAuDouble', x0: -10, x1: 10, z0: 58, z1: 110, deckY: 0.5, arches: 1, archRise: 6.0, parapetHeight: 1.0 },
    { id: 'petitPont', x0: -142, x1: -126, z0: 58, z1: 110, deckY: 0.5, arches: 1, archRise: 5.0, parapetHeight: 1.0 },
  ],
  buildings: [
    { id: 'hotelDieu', x0: -126, x1: -16, z0: -120, z1: -58, eave: 20, ridge: 26, arcadedGround: true },
    { id: 'prefecture', x0: -230, x1: -142, z0: -120, z1: 40, eave: 22, ridge: 28 },
    { id: 'cloitreBlock1', x0: 10, x1: 70, z0: -80, z1: -42, eave: 18, ridge: 22 },
    { id: 'cloitreBlock2', x0: 74, x1: 140, z0: -80, z1: -42, eave: 17, ridge: 21 },
    // 塞納河對岸（左岸，蒙特貝羅堤岸）的一排建築
    { id: 'leftBankRow', x0: -200, x1: 220, z0: 120, z1: 140, eave: 21, ridge: 26, varied: true },
  ],
  gardens: [
    // 教堂南側沿河的花園
    { id: 'southGarden', x0: 12, x1: 128, z0: 44, z1: 56, trees: range(12).map((i) => ({ x: 18 + i * 9.5, z: 50, height: 14, canopyRadius: 4.5, foliage: 'budding' })) },
    // 後殿東側的若望二十三世廣場
    {
      id: 'squareJeanXXIII', x0: 130, x1: 180, z0: -40, z1: 52,
      fence: { height: 2.2 },
      fountain: { x: 152, z: 4, diameter: 6, height: 4.5, style: 'gothicRevival' },
      trees: [[138, -30], [150, -32], [164, -28], [174, -14], [176, 10], [172, 32], [158, 42], [142, 40], [136, 20], [136, -10]]
        .map(([x, z]) => ({ x, z, height: 16, canopyRadius: 5, foliage: 'budding' })),
    },
  ],
};

// -----------------------------------------------------------------------------
// 太陽與時間
// -----------------------------------------------------------------------------
// 西南、仰角 19°：巴黎春分前後約 17:00（CET）的太陽位置。
// 西立面法線方位約 293°，太陽從左前方（南側）約 46° 斜照，
// 門洞斜面、國王廊、玫瑰窗前雕像都有明暗立體感；南側牆面也受光。
const SUN_AZIMUTH_DEG = 247;
const SUN_ELEVATION_DEG = 19;
const sun = {
  azimuthDeg: SUN_AZIMUTH_DEG,
  elevationDeg: SUN_ELEVATION_DEG,
  direction: compassToLocal(SUN_AZIMUTH_DEG, SUN_ELEVATION_DEG), // 指向太陽的單位向量
  // 平行光放置位置：以交叉部為目標，沿 direction 退 400 m
  target: [CROSSING_CX, 0, 0],
  distance: 400,
  season: '春分前後，約 17:00 CET，樹木剛冒新芽',
};

// -----------------------------------------------------------------------------
// 鏡頭（70 秒）：關鍵點，依時間以平滑曲線（centripetal Catmull-Rom）內插
// position = 相機位置，target = 注視點，fovDeg = 垂直視角
// 路線：廣場遠景 → 走近中門 → 聖母門 → 升到國王廊 → 玫瑰窗 → 沉思者 →
//       退到塞納河上空看南側受光的飛扶壁、南袖廊玫瑰窗與尖塔
// -----------------------------------------------------------------------------
const camera = {
  durationSec: 70,
  fps: 30,
  resolution: [1920, 1080],
  interpolation: 'centripetalCatmullRom',
  keyframes: [
    { t: 0, position: [-125, 1.7, 14], target: [0, 34, 0], fovDeg: 50, shot: '廣場西端遠景，整面西立面' },
    { t: 10, position: [-80, 1.7, 8], target: [0, 26, 0], fovDeg: 46 },
    { t: 20, position: [-30, 1.7, 2], target: [0, 10, 0], fovDeg: 44, shot: '走近最後審判門' },
    { t: 27, position: [-12, 1.7, 0], target: [1.5, 9.5, 0], fovDeg: 40, shot: '門楣浮雕與門側使徒像' },
    { t: 34, position: [-11, 2.5, -9], target: [1.0, 7.5, -TOWER_CENTER_Z], fovDeg: 40, shot: '橫移到聖母門' },
    { t: 41, position: [-13, 18, -3], target: [0, 19.2, 0], fovDeg: 42, shot: '升到國王廊' },
    { t: 48, position: [-14, 30, 3], target: [0, 30.5, 0], fovDeg: 42, shot: '西玫瑰窗與聖母、天使像' },
    { t: 55, position: [-7, 47.5, -26], target: [0, 46.6, -FACADE_HALF_W], fovDeg: 38, shot: '沉思者 Le Stryge' },
    { t: 62, position: [-40, 40, 70], target: [40, 34, 0], fovDeg: 45 },
    { t: 70, position: [-22, 24, 112], target: [55, 38, 0], fovDeg: 45, shot: '塞納河上空：南側飛扶壁、南袖廊玫瑰窗、尖塔' },
  ],
};

// -----------------------------------------------------------------------------
// 匯出
// -----------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export const LAYOUT = deepFreeze({
  meta: {
    title: 'Notre-Dame de Paris（2019 年前）春分傍晚',
    units: 'm',
    axes: { x: '禮儀東（往後殿）', y: '上', z: '禮儀南（塞納河側）' },
    origin: '西立面中央門門檻中心，地面',
    axisAzimuthDeg: AXIS_AZIMUTH_DEG,
    trueNorth: compassToLocal(0), // 真北在本地座標的方向
    rules: '不使用任何外部 3D 模型、貼圖或照片，全部程式生成',
  },
  sun,
  camera,
  cathedral,
  parvis,
  surroundings,
});

export default LAYOUT;
