# church-scene

清晨的巴黎聖母院（2019 年火災前），three.js，全部程式生成（不使用 3D 模型、貼圖或照片），最終輸出 70 秒影片。

## 場景平面圖

- `layout.js`：**唯一的座標來源**。建築、雕刻、建築細節、前廣場、周邊環境、太陽，單位公尺。其他程式一律 `import { LAYOUT } from './layout.js'` 讀取，不得自行寫死座標。
  - 座標：原點在西立面中央門門檻；+X 往後殿（禮儀東）、+Y 上、+Z 往塞納河（禮儀南）。
  - 真實方位以 `AXIS_AZIMUTH_DEG` 與 `compassToLocal()` 換算；太陽方位角 135°、仰角 7°。
- `npm run check`：檢查 layout 的一致性（尺寸、數量、物件不互相穿插）。
- `npm run plan`：由 layout 產生 `plan.svg`（平面圖 + 西立面）供核對。
