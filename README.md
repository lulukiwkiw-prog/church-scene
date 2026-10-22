# church-scene

春分傍晚的巴黎聖母院（2019 年火災前），three.js，全部程式生成（不使用 3D 模型、貼圖或照片），最終輸出 70 秒影片。

## 場景平面圖

- `layout.js`：**唯一的座標來源**。建築、雕刻、建築細節、前廣場、周邊環境、太陽，單位公尺。其他程式一律 `import { LAYOUT } from './layout.js'` 讀取，不得自行寫死座標。
  - 座標：原點在西立面中央門門檻；+X 往後殿（禮儀東）、+Y 上、+Z 往塞納河（禮儀南）。
  - 真實方位以 `AXIS_AZIMUTH_DEG` 與 `compassToLocal()` 換算；太陽方位角 247°、仰角 19°（春分前後約 17:00），從左前方斜照西立面，讓雕刻有立體感；樹木為 3 月新芽。
- `npm run check`：檢查 layout 的一致性（尺寸、數量、物件不互相穿插）。
- `npm run plan`：由 layout 產生 `plan.svg`（平面圖 + 西立面）供核對。

## 獨立網頁（不用 Claude 的連結）

互動版是純靜態網頁，不需要伺服器程式。`npm run site` 會產生：

- `index.html`：完整網頁（由 `explore.html` 加上 `<head>` 與本機 importmap 產生）
- `vendor/three/`：three.js 與用到的 addons（不依賴外部 CDN）
- `dist/`、`out/notre-dame-site.zip`：只含執行時需要的檔案，可整包上傳到任何靜態主機

部署方式（擇一）：

1. **GitHub Pages**（repo 公開即免費）：Settings → Pages → *Deploy from a branch* → 選分支與 `/ (root)` → Save。網址是 `https://<帳號>.github.io/church-scene/`。
2. **Netlify Drop**（app.netlify.com/drop）或 **Cloudflare Pages**：把 `dist` 資料夾（或 zip 解壓後的資料夾）拖進去。
3. 本機測試：`cd dist && python3 -m http.server`，開 http://localhost:8000（不能直接雙擊 index.html，瀏覽器不允許 `file://` 載入 ES module）。

影片渲染頁已改名為 `render.html`（`tools/render-video.mjs` 使用）。
