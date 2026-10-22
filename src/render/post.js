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

export function createPost(renderer, scene, camera, w, h, { samples = 4, bloom = true } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
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
    setSize(nw, nh) { composer.setSize(nw, nh); vignette.uniforms.aspect.value = nw / nh; },
    render() { composer.render(); },
  };
}
