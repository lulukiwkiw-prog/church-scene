// src/render/looks.js — 光線風格（影片與互動網頁共用，只改這裡就兩邊一起變）
// -----------------------------------------------------------------------------
// default  ：最早的版本（春分 17:00，偏亮的黃白）
// golden   ：B，暖金低調（目前互動網頁使用）：太陽與霧更橘、曝光較低，石面呈蜂蜜色
// overcast ：C，半陰天：加低空雲層，太陽較弱、天空光較強
// 每個風格 = { look: 太陽/曝光/霧, sky: 天空著色器參數 }
// -----------------------------------------------------------------------------
import * as THREE from 'three';

const C = (r, g, b) => new THREE.Color(r, g, b);

export const LOOKS = {
  default: {
    look: {
      exposure: 0.55, sunColor: C(1.0, 0.72, 0.46), sunIntensity: 7.0, envIntensity: 0.55,
      fog: { nearColor: C(0.62, 0.55, 0.46), farColor: C(0.50, 0.57, 0.68), sunColor: C(0.95, 0.70, 0.45), density: 0.0016, heightFalloff: 0.012 },
    },
    sky: {},
  },
  golden: {
    look: {
      exposure: 0.5, sunColor: C(1.0, 0.50, 0.22), sunIntensity: 5.2, envIntensity: 0.42,
      fog: { nearColor: C(0.66, 0.48, 0.34), farColor: C(0.52, 0.52, 0.62), sunColor: C(1.0, 0.52, 0.26), density: 0.0019, heightFalloff: 0.012 },
    },
    sky: { turbidity: 3.6, mieCoefficient: 0.006, skySaturation: 1.55 },
  },
  overcast: {
    look: {
      exposure: 0.62, sunColor: C(1.0, 0.86, 0.70), sunIntensity: 3.3, envIntensity: 0.95,
      fog: { nearColor: C(0.60, 0.58, 0.55), farColor: C(0.52, 0.56, 0.64), sunColor: C(0.88, 0.76, 0.62), density: 0.0022, heightFalloff: 0.012 },
    },
    sky: { cloudLow: 0.8, cloudDark: 0.95, cloudCover: 0.35, skySaturation: 1.3 },
  },
};
