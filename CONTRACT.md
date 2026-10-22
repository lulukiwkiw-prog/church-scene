# 施工契約（6 個分身共同遵守）

## 鐵則

1. **只能改自己的檔案**（見下表）。共用檔（`layout.js`、`materials.js`、`rng.js`、`tools/*`、`CONTRACT.md`、`package.json`）全部唯讀；需要改就回報，由總包統一改。
2. **座標只從 `layout.js` 讀**。不得寫死任何位置或尺寸；模組內部的造型細節（例如線腳斷面、衣褶）可以有自己的比例常數，但「東西放在哪、多大」一律由 layout 決定。
3. **材質只從 `materials.js` 拿**：`materials.xxx` 或 `variant('xxx', { vertexColors, side, alphaTest, flatShading })`。不得 `new THREE.*Material`、不得 clone 或修改共用材質。（例外：第 6 號的天空、霧、後製著色器。）
4. **隨機只用 `rng.js`**：`rng('模組/部件/編號')`。禁止 `Math.random`、`Date.now`、`performance.now`、`new Date`。
5. **不准用任何外部 3D 模型、貼圖或照片**，全部程式生成。
6. 建築模組不得加燈光、天空、霧、相機。
7. 不要執行任何會改動 git 的指令（commit、checkout、stash、reset…）。總包統一提交。
8. 交件前必須通過 `node tools/check-modules.mjs <你的模組>`（固定種子、無禁用 API、無自建材質、三角形預算）。

## 分工與檔案

| # | 分身 | 只能改 | 三角形預算 |
|---|---|---|---|
| 1 | 結構 | `src/structure.js`（可另建 `src/structure/*.js`） | 400k |
| 2 | 立面與窗 | `src/facades.js`（可另建 `src/facades/*.js`） | 1.5M |
| 3 | 屋頂與尖頂 | `src/roofs.js`（可另建 `src/roofs/*.js`） | 600k |
| 4 | 雕刻 | `src/sculpture.js`（可另建 `src/sculpture/*.js`） | 2.5M |
| 5 | 廣場與環境 | `src/environment.js`（可另建 `src/environment/*.js`） | 1.0M |
| 7 | 活動物件（人物、鴿子、貓、狗） | `src/actors.js` | 200k |
| 6 | 光影鏡頭輸出 | `render.html`、`src/main.js`、`src/render/*`、`tools/render-video.mjs` | — |

大量重複的東西（雕像、細柱、窗花、樹芽、欄杆柱）用 `InstancedMesh` 或合併幾何（`BufferGeometryUtils.mergeGeometries`），控制 draw call。

## 模組介面

```js
// src/<模組>.js
import * as THREE from 'three';
export function build({ layout, materials, variant, rng }) {
  const group = new THREE.Group();
  group.name = '<模組>';
  // ...
  return group; // 世界座標，單位公尺
}
```

- `build()` 必須是同步、純函式：同樣輸入 → 位元相同的幾何。不可碰 DOM（Node 也要能跑）。
- 可以 import `three/addons/...`（例如 `BufferGeometryUtils`）。
- UV 一律 **1 單位 = 1 公尺**：牆面 U 水平、V 往上；屋頂 U 沿簷口、V 往屋脊；地面 U = x、V = z。
- 座標：+X 往後殿（東）、+Y 上、+Z 往塞納河（南）；原點 = 西立面中央門門檻。

## 邊界：誰做什麼（避免重複或漏做）

| 東西 | 負責 |
|---|---|
| 所有牆體量體、雙塔外殼（鐘樓層為中空殼）、立面扶壁（含退縮）、扶壁墩、中間柱、飛扶壁、聖器室與廊道、樓梯小塔塔身、塔角扶壁 | 1 結構 |
| 牆上的**洞口**：西立面三座門（外拱輪廓 × 斜面深度）、西玫瑰窗、塔窗、鐘樓尖窗、所有高窗與禮拜堂窗、袖廊門與玫瑰窗、紅門。洞口做成有側壁（reveal）的貫穿孔 | 1 結構 |
| 大迴廊層（y 38–46）的牆面退到 x = 1.5，前面留給立面模組做柱廊 | 1 結構 |
| 洞口**裡面**的一切：門洞斜面、拱圈線腳、門楣框與橫帶石、門中柱、木門與鍛鐵、所有窗花與玻璃、玫瑰窗、鐘樓百葉與拱圈、大迴廊細柱與三葉拱、國王廊拱廊、所有欄杆（聖母露臺、怪獸迴廊、塔頂、高牆簷口）、水平線腳與簷下托檐、壁面盲飾圓章、扶壁小龕（gablet）與壁龕華蓋、禮拜堂山花、袖廊立面細部（門框、三角楣、透光尖窗帶、山牆圓窗）、紅門 | 2 立面 |
| 所有屋頂（主屋頂、交叉部、袖廊、詩班席、後殿半錐、樓廊與側廊斜屋頂、交叉部旁的低平台、塔頂低坡頂、聖器室屋頂）、屋脊鉛飾、老虎窗、尖塔全段（含頂端十字與公雞）、所有小尖塔與捲葉（扶壁墩頂、中間柱頂、袖廊轉角小塔頂、塔角扶壁頂）、樓梯小塔圓錐頂、16 尊銅像的階梯台座 | 3 屋頂 |
| 所有人像與獸像（含各自的小台座：玫瑰窗前雕像的台座、袖廊山牆頂像 `gableStatue`）：門側像、門中柱像、扶壁壁龕像、28 國王、玫瑰窗前 5 尊、門楣浮雕（每一層）、拱圈上的小坐像、16 尊銅像（`copperVerdigris`）、怪獸與沉思者、60 隻滴水獸、查理曼騎馬像（`bronzeDark`） | 4 雕刻 |
| 地面（整個島 y = 0）、廣場鋪面與考古標線、零起點銅星、地下室入口、路燈、長椅、矮柱、門前鐵欄杆、樹（3 月新芽）、街道、河堤、塞納河水面、橋、周邊建築、花園與噴泉、查理曼像台座 | 5 環境 |
| 天空（程式生成）、太陽與天空光、陰影、霧與空氣透視、環境反射、色調與後製、相機路線、水面法線隨影格時間流動、逐格算圖與 MP4 輸出 | 6 輸出 |

**門的拱圈與門楣**：立面與雕刻兩邊都必須用 `layout.js` 匯出的 `pointedArch()`、`archivoltRing(portal, k)`、`tympanumRegisters(portal)` 計算，小坐像才會剛好落在拱圈上、浮雕剛好填滿門楣。

## 工具

```bash
npm run check                                     # layout + 全部模組檢查
node tools/check-modules.mjs sculpture            # 只檢查自己的模組
node tools/shoot.mjs --m structure,facades --view west --out out/facades-west.png
node tools/shoot.mjs --m structure --pos -40,10,20 --target 0,20,0 --fov 40 --out out/x.png
node tools/plan.mjs                               # 重新產生平面圖 plan.svg
```

`--view` 可用：`west southwest south southeast east north aerial portal rose kings stryge spire parvis kf`（`kf` 配 `--t 27` 取鏡頭關鍵點）。截圖輸出到 `out/`（不進 git），檔名請加上自己的模組名稱避免互相覆蓋。

預覽器用軟體 WebGL（SwiftShader），一張 1280×720 約數秒。
