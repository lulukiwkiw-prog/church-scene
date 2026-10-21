// src/render/atmosphere.js — 空氣透視（第 6 號：光影鏡頭輸出）
// -----------------------------------------------------------------------------
// 取代 three 內建的 fog 著色器片段（只有第 6 號可以這麼做，見 CONTRACT.md）：
// - 高度衰減的指數霧：貼地較濃、往上變淡（看高處的塔頂不會一片灰）
// - 顏色隨距離：近處淡淡暖色，遠處（對岸建築）偏藍灰
// - 朝太陽方向的霧帶暖色（逆光的金色空氣）
// 霧在線性 HDR 下計算（後製管線在 OutputPass 才做色調映射）。
// 所有材質（共用材質不需修改）都經由 ShaderChunk 自動套用；
// 需要在第一次編譯著色器之前呼叫 installAtmosphere()。
// -----------------------------------------------------------------------------
import * as THREE from 'three';

const v3 = (c) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

/**
 * @param {object} o
 * @param {THREE.Vector3} o.sunDirection
 * @param {THREE.Color} o.nearColor  近處霧色（暖）
 * @param {THREE.Color} o.farColor   遠處霧色（藍灰）
 * @param {THREE.Color} o.sunColor   朝太陽方向的霧色
 * @param {number} o.density         地面處的消光係數（1/m）
 * @param {number} o.heightFalloff   高度衰減（1/m）
 * @returns {THREE.FogExp2}
 */
export function installAtmosphere(o) {
  const s = o.sunDirection.clone().normalize();
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogViewPos = mvPosition.xyz;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  {
    // 視空間 → 世界空間的「相機到片元」向量（viewMatrix 為正交旋轉 + 平移）
    vec3 fogV = ( vec4( vFogViewPos, 0.0 ) * viewMatrix ).xyz;
    float fogDist = length( fogV );
    vec3 fogDir = fogV / max( fogDist, 1e-4 );
    #ifdef FOG_EXP2
      float fogDens = fogDensity;
    #else
      float fogDens = 1.0 / max( fogFar, 1.0 );
    #endif
    const float hA = ${o.heightFalloff.toFixed(6)};
    float y0 = max( cameraPosition.y, 0.0 );
    float dy = fogV.y;
    float hTerm = abs( dy * hA ) > 1e-3 ? ( 1.0 - exp( - hA * dy ) ) / ( hA * dy ) : 1.0;
    float od = fogDens * fogDist * exp( - hA * y0 ) * hTerm;
    float fogFactor = 1.0 - exp( - od );
    vec3 fogC = mix( ${v3(o.nearColor)}, ${v3(o.farColor)}, smoothstep( 30.0, 420.0, fogDist ) );
    float sunAmt = pow( max( dot( fogDir, vec3( ${s.x.toFixed(5)}, ${s.y.toFixed(5)}, ${s.z.toFixed(5)} ) ), 0.0 ), 5.0 );
    fogC = mix( fogC, ${v3(o.sunColor)}, sunAmt * 0.7 );
    fogC *= fogColor; // fogColor 作為整體倍率（預設白），方便即時微調
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
  }
#endif`;
  return new THREE.FogExp2(0xffffff, o.density);
}
