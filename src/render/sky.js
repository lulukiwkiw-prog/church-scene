// src/render/sky.js — 程式生成天空（第 6 號：光影鏡頭輸出）
// -----------------------------------------------------------------------------
// Preetham 大氣散射（改寫自 three/addons Sky.js，輸出線性 HDR 而非已壓縮的顏色）
// + 程式生成的高空卷雲（fbm 雜訊，確定性；隨「影格時間」緩慢飄移）
// + 地平線薄霧（與 fog.js 的遠景霧色一致，建築輪廓才會自然融進天空）
// 同一個著色器有兩種用法：
//   mode 0：畫面背景（含太陽圓盤）
//   mode 1：產生環境貼圖用（不含太陽圓盤，避免 PMREM 出現亮點；地平線以下為地面反射色）
// -----------------------------------------------------------------------------
import * as THREE from 'three';

const vertexShader = /* glsl */`
uniform vec3 sunDirection;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;

varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

const float e = 2.71828182845904523536028747135266249775724709369995957;
const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity( float zenithAngleCos ) {
  zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
}
vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w; // 永遠在遠平面
  vSunDirection = normalize( sunDirection );
  vSunE = sunIntensity( vSunDirection.y );
  vSunfade = 1.0 - clamp( 1.0 - exp( vSunDirection.y ), 0.0, 1.0 );
  float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie( turbidity ) * mieCoefficient;
}`;

const fragmentShader = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform float mieDirectionalG;
uniform float skyScale;      // Preetham 輸出 → 場景線性亮度
uniform float sunDiskScale;  // 太陽圓盤亮度（mode 0）
uniform float mode;          // 0 背景、1 環境貼圖
uniform float time;          // 秒（影格號 / fps）
uniform vec3 hazeColor;      // 地平線霧色（與 fog 的遠景色一致）
uniform vec3 groundColor;    // 地平線以下（環境貼圖用）
uniform float cloudCover;    // 0..1
uniform vec2 cloudWind;      // 雲層飄移（雲平面單位 / 秒）
uniform float skySaturation; // 天空飽和度（傍晚晴天的深藍）

const float pi = 3.141592653589793;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99996;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase( float cosTheta ) { return THREE_OVER_SIXTEENPI * ( 1.0 + cosTheta * cosTheta ); }
float hgPhase( float cosTheta, float g ) {
  float g2 = g * g;
  return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 ) );
}

// --- 確定性雜訊（純算術雜湊，無貼圖） ---
float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash12( i ), b = hash12( i + vec2( 1.0, 0.0 ) );
  float c = hash12( i + vec2( 0.0, 1.0 ) ), d = hash12( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
float fbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2( 0.8, -0.6, 0.6, 0.8 );
  for ( int i = 0; i < 6; i ++ ) { s += a * vnoise( p ); p = r * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

vec3 preetham( vec3 direction, out vec3 Fex, out float cosTheta ) {
  float zenithAngle = acos( max( 0.0, direction.y ) );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
  cosTheta = dot( direction, vSunDirection );
  float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase( cosTheta, mieDirectionalG );
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - vSunDirection.y, 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  vec3 c = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  // 原版在此做 pow(1/2.4) 的壓縮；保留曲線形狀，再乘 skyScale 成為線性 HDR
  return pow( c, vec3( 1.0 / ( 1.2 + 1.2 * vSunfade ) ) ) * skyScale;
}

void main() {
  vec3 dir = normalize( vWorldPosition - cameraPosition );
  float elev = dir.y;
  vec3 dSky = normalize( vec3( dir.x, max( elev, 0.0 ), dir.z ) );
  vec3 Fex; float cosTheta;
  vec3 col = preetham( dSky, Fex, cosTheta );
  float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = max( mix( vec3( lum ), col, skySaturation ), 0.0 );

  // 太陽附近偏暖（Mie 光暈之外再加一層寬的暖色光暈）
  float glow = pow( max( cosTheta, 0.0 ), 6.0 );
  col += vec3( 1.0, 0.62, 0.30 ) * glow * 0.10 * skyScale;

  // --- 高空卷雲 ---
  if ( cloudCover > 0.0 && elev > 0.0 ) {
    vec2 p = dSky.xz / ( dSky.y + 0.12 );        // 投影到雲平面
    p = p * 1.6 + cloudWind * time;
    // 拉長的卷雲紋：沿一個方向拉伸，再用低頻雜訊扭曲
    mat2 rot = mat2( 0.86, 0.5, -0.5, 0.86 );
    vec2 q = rot * p;
    q.x *= 0.22;
    float warp = fbm( q * 0.7 + 3.0 );
    float n = fbm( q * vec2( 1.0, 2.6 ) + vec2( warp * 1.6, 0.0 ) );
    float big = fbm( p * 0.18 + 11.0 );           // 大尺度分佈：只有部分天空有雲
    float m = smoothstep( 0.52, 0.80, n ) * smoothstep( 0.42, 0.62, big ) * cloudCover;
    m *= smoothstep( 0.0, 0.18, elev );           // 地平線附近淡出（交給霧）
    // 雲的亮度：天空色 + 太陽照明（逆光方向前向散射更亮、更暖）
    float fwd = pow( max( cosTheta, 0.0 ), 3.0 );
    vec3 cloudCol = col * 0.55 + vec3( 1.0, 0.86, 0.70 ) * skyScale * ( 0.55 + 1.1 * fwd );
    col = mix( col, cloudCol, m * 0.85 );
  }

  // --- 地平線薄霧 ---
  float hz = 1.0 - smoothstep( -0.02, 0.10, elev );
  col = mix( col, hazeColor, hz * hz * 0.8 );

  if ( mode < 0.5 ) {
    float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
    col += sunDiskScale * vec3( 1.0, 0.82, 0.62 ) * sundisk;
    if ( elev < 0.0 ) col = mix( col, hazeColor, smoothstep( 0.0, -0.05, elev ) );
  } else if ( elev < 0.0 ) {
    // 環境貼圖的下半球：地面（廣場石板、受光）漸層到地平線霧色
    col = mix( hazeColor, groundColor, smoothstep( 0.0, -0.25, elev ) );
  }
  gl_FragColor = vec4( col, 1.0 );
}`;

/**
 * @param {object} o
 * @param {THREE.Vector3} o.sunDirection 指向太陽的單位向量
 */
export function createSky(o) {
  const uniforms = {
    sunDirection: { value: o.sunDirection.clone() },
    turbidity: { value: o.turbidity ?? 2.0 },
    rayleigh: { value: o.rayleigh ?? 2.2 },
    mieCoefficient: { value: o.mieCoefficient ?? 0.003 },
    mieDirectionalG: { value: o.mieDirectionalG ?? 0.82 },
    skyScale: { value: o.skyScale ?? 1.0 },
    sunDiskScale: { value: o.sunDiskScale ?? 60.0 },
    mode: { value: 0 },
    time: { value: 0 },
    hazeColor: { value: o.hazeColor.clone() },
    groundColor: { value: o.groundColor.clone() },
    cloudCover: { value: o.cloudCover ?? 0.7 },
    cloudWind: { value: new THREE.Vector2(0.004, 0.0015) },
    skySaturation: { value: o.skySaturation ?? 1.7 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'ProceduralSky',
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.name = 'sky';
  mesh.scale.setScalar(1000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, material, uniforms };
}

/**
 * 用 PMREM 由同一個天空著色器（mode 1）產生 scene.environment。
 * 天空為靜態（雲只飄動極少），環境貼圖只做一次。
 */
export function bakeEnvironment(renderer, sky) {
  const envScene = new THREE.Scene();
  const envMat = sky.material.clone();
  envMat.uniforms = THREE.UniformsUtils.clone(sky.material.uniforms);
  envMat.uniforms.mode.value = 1;
  const m = new THREE.Mesh(sky.mesh.geometry, envMat);
  m.scale.setScalar(100);
  m.frustumCulled = false;
  envScene.add(m);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 1000);
  pmrem.dispose();
  envMat.dispose();
  return rt.texture;
}
