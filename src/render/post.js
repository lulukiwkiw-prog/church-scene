// src/render/post.js — 後製（第 6 號：光影鏡頭輸出）
// -----------------------------------------------------------------------------
// RenderPass（4× MSAA、半浮點 HDR）→ 輕微 bloom（只有太陽附近夠亮）
// → 暗角 → OutputPass（色調映射 ACES/AgX + sRGB）。全部確定性（無雜訊顆粒）。
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VignetteShader = {
  name: 'Vignette',
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.22 }, aspect: { value: 16 / 9 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float amount; uniform float aspect;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      vec2 d = ( vUv - 0.5 ) * vec2( aspect, 1.0 ) / ( 0.5 * length( vec2( aspect, 1.0 ) ) );
      float v = 1.0 - amount * smoothstep( 0.35, 1.05, dot( d, d ) );
      gl_FragColor = vec4( c.rgb * v, c.a );
    }`,
};

// 非有限值（NaN / Inf）清除：少數像素的光照算出 NaN 時，bloom 的降取樣會把它擴散成整塊黑色矩形。
// 在 bloom 之前把這種像素換成上下左右有效鄰居的平均（都無效就給 0）。用比較運算判斷，NaN 的比較一律為 false。
const SanitizeShader = {
  name: 'Sanitize',
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() } },
  vertexShader: VignetteShader.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 texel;
    varying vec2 vUv;
    bool ok( vec4 c ) { return all( greaterThanEqual( c, vec4( -1e4 ) ) ) && all( lessThanEqual( c, vec4( 6e4 ) ) ); }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      if ( ok( c ) ) { gl_FragColor = c; return; }
      vec4 s = vec4( 0.0 ); float n = 0.0;
      vec4 a = texture2D( tDiffuse, vUv + vec2( texel.x, 0.0 ) ); if ( ok( a ) ) { s += a; n += 1.0; }
      vec4 b = texture2D( tDiffuse, vUv - vec2( texel.x, 0.0 ) ); if ( ok( b ) ) { s += b; n += 1.0; }
      vec4 d = texture2D( tDiffuse, vUv + vec2( 0.0, texel.y ) ); if ( ok( d ) ) { s += d; n += 1.0; }
      vec4 e = texture2D( tDiffuse, vUv - vec2( 0.0, texel.y ) ); if ( ok( e ) ) { s += e; n += 1.0; }
      gl_FragColor = n > 0.0 ? s / n : vec4( 0.0, 0.0, 0.0, 1.0 );
    }`,
};

export function createPost(renderer, scene, camera, w, h, { samples = 4, bloom = true } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const sanitize = new ShaderPass(SanitizeShader);
  sanitize.uniforms.texel.value.set(1 / w, 1 / h);
  composer.addPass(sanitize);
  let bloomPass = null;
  if (bloom) {
    // 門檻高：只有太陽圓盤與其旁的雲邊會發光，石材不會糊
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.55, 2.2);
    composer.addPass(bloomPass);
  }
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.aspect.value = w / h;
  composer.addPass(vignette);
  composer.addPass(new OutputPass());
  return {
    composer, bloomPass, vignette,
    setSize(nw, nh) { composer.setSize(nw, nh); vignette.uniforms.aspect.value = nw / nh; sanitize.uniforms.texel.value.set(1 / nw, 1 / nh); },
    render() { composer.render(); },
  };
}
