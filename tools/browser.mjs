// 啟動無頭 Chromium（軟體 WebGL：SwiftShader）——共用工具
import { chromium } from 'playwright-core';

export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
}
