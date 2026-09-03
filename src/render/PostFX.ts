import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Renderer } from './Renderer';
import type { FxState } from '../game/Game';

/**
 * VCR / CRT artefact pass: chromatic aberration, scanlines, tracking jitter,
 * block glitches, rolling band, grain, vignette and flicker.
 */
const VCRShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uBeat: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGlitch;
    uniform float uBeat;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;

      // Tracking jitter: a few scanlines slip sideways now and then.
      float row = floor(uv.y * uResolution.y / 3.0);
      float slip = rand(vec2(row, floor(uTime * 14.0)));
      float slipAmt = step(0.992 - uGlitch * 0.25, slip) * (0.003 + uGlitch * 0.04);
      uv.x += (rand(vec2(uTime, row)) - 0.5) * slipAmt;

      // Block displacement during heavy glitch (death / boot).
      if (uGlitch > 0.02) {
        float block = floor(uv.y * 28.0);
        float br = rand(vec2(block, floor(uTime * 24.0)));
        if (br > 1.0 - uGlitch * 0.4) {
          uv.x += (rand(vec2(block, uTime)) - 0.5) * 0.14 * uGlitch;
          uv.y += (rand(vec2(block * 3.1, uTime)) - 0.5) * 0.01 * uGlitch;
        }
      }

      // Chromatic aberration grows toward the edges and with glitch.
      vec2 dir = uv - 0.5;
      float d = length(dir);
      float ca = (0.0009 + uGlitch * 0.012 + uBeat * 0.0005) * (0.3 + d * 1.6);
      vec2 off = (d > 1e-4 ? dir / d : vec2(1.0, 0.0)) * ca;
      float r = texture2D(tDiffuse, uv + off).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - off).b;
      vec3 col = vec3(r, g, b);

      // Scanlines (every other physical line) and a faint aperture grille.
      float scan = 0.86 + 0.14 * sin(uv.y * uResolution.y * 3.14159265);
      float grille = 0.97 + 0.03 * sin(uv.x * uResolution.x * 2.0943951);
      col *= scan * grille;

      // Slow rolling VHS band.
      float bandPos = fract(uTime * 0.06);
      float band = exp(-pow((uv.y - bandPos) * 18.0, 2.0));
      col += band * 0.05;
      col *= 1.0 - band * 0.06;

      // Grain.
      float grain = rand(uv * (uTime + 1.0) * 60.0) - 0.5;
      col += grain * (0.02 + uGlitch * 0.1);

      // Colour bleed: pink/cyan tint at extremes during glitch.
      col += vec3(0.08, -0.02, 0.06) * uGlitch * rand(vec2(uTime, 3.0));

      // Vignette + flicker.
      float vig = smoothstep(0.98, 0.3, d);
      col *= mix(0.62, 1.0, vig);
      col *= 0.985 + 0.015 * sin(uTime * 110.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface PostFXOptions {
  /** 4x MSAA on the scene render target. Changing it requires a new PostFX. */
  antialias: boolean;
  bloom: boolean;
}

export class PostFX {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly vcr: ShaderPass;
  private readonly baseBloom = 0.42;

  constructor(private readonly r: Renderer, options: PostFXOptions) {
    const size = new THREE.Vector2();
    r.renderer.getSize(size);
    const pr = r.renderer.getPixelRatio();
    // Scene target: half float for the bloom range, multisampled when antialias is on.
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: options.antialias ? 4 : 0,
    });
    this.composer = new EffectComposer(r.renderer, target);
    this.composer.setPixelRatio(pr);
    this.composer.addPass(new RenderPass(r.scene, r.camera));
    this.bloom = new UnrealBloomPass(size.clone(), this.baseBloom, 0.35, 0.62);
    this.bloom.enabled = options.bloom;
    this.composer.addPass(this.bloom);
    this.vcr = new ShaderPass(VCRShader);
    this.composer.addPass(this.vcr);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setBloomEnabled(on: boolean): void {
    this.bloom.enabled = on;
  }

  /** Matches the composer to the renderer's current size and pixel ratio. */
  setSize(w: number, h: number): void {
    const pr = this.r.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    (this.vcr.uniforms['uResolution']!.value as THREE.Vector2).set(w * pr, h * pr);
  }

  /** Frees GPU buffers. Call before building a replacement PostFX. */
  dispose(): void {
    this.bloom.dispose();
    this.vcr.dispose();
    this.composer.dispose();
  }

  render(time: number, fx: FxState): void {
    this.bloom.strength = this.baseBloom + fx.beat * 0.14 + fx.bloomBoost * 0.6;
    this.vcr.uniforms['uTime']!.value = time;
    this.vcr.uniforms['uGlitch']!.value = fx.glitch;
    this.vcr.uniforms['uBeat']!.value = fx.beat;
    this.composer.render();
  }
}
