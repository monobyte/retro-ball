import * as THREE from 'three';
import { disposeObjects } from '../runtime/disposeObjects';

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

const NEBULA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec2 uOffset;
  uniform float uBeat;
  uniform float uAspect;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 2.4 + uOffset;
    float t = uTime * 0.02;
    float n1 = fbm(p * 1.1 + vec2(t, -t * 0.6));
    float n2 = fbm(p * 2.3 - vec2(t * 0.7, t * 0.4) + n1 * 1.5);
    float n3 = fbm(p * 0.6 + vec2(-t * 0.3, t * 0.2));

    vec3 base = vec3(0.02, 0.005, 0.06);
    vec3 purple = vec3(0.22, 0.04, 0.42);
    vec3 blue = vec3(0.03, 0.12, 0.45);
    vec3 pink = vec3(0.5, 0.05, 0.36);

    vec3 col = base;
    col += purple * smoothstep(0.35, 0.8, n1) * 0.9;
    col += blue * smoothstep(0.45, 0.85, n2) * 0.8;
    col += pink * pow(smoothstep(0.55, 0.95, n3 * n2 * 1.6), 1.4) * 1.2;
    col *= 0.85 + 0.15 * uBeat;

    // Subtle diagonal light shaft (a distant sun below the horizon).
    float shaft = exp(-pow((uv.x - uv.y * 0.5 - 0.15), 2.0) * 14.0) * 0.08;
    col += vec3(0.45, 0.08, 0.4) * shaft;

    float vig = smoothstep(1.2, 0.2, length((uv - 0.5) * vec2(uAspect, 1.0)));
    col *= 0.45 + 0.55 * vig;
    col *= 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Copies the offscreen nebula texture onto the camera-locked plane. */
const BLIT_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(uMap, vUv); }
`;

const FLOOR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform vec3 uFocus;
  varying vec3 vWorld;
  void main() {
    vec2 g = vWorld.xz / 4.0;
    g.y += uTime * 0.12;
    vec2 d = max(fwidth(g), vec2(1e-4));
    vec2 a = abs(fract(g - 0.5) - 0.5) / d;
    float line = 1.0 - clamp(min(a.x, a.y) - 0.6, 0.0, 1.0);
    float dist = length(vWorld.xz - uFocus.xz);
    float fade = exp(-dist * dist / (2.0 * 55.0 * 55.0));
    vec3 col = mix(vec3(0.45, 0.08, 0.6), vec3(0.1, 0.3, 0.9), 0.5 + 0.5 * sin(dist * 0.05 - uTime * 0.6));
    col *= line * fade * (0.16 + 0.14 * uBeat);
    gl_FragColor = vec4(col, line * fade);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    vTwinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aPhase * 2.0) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (0.7 + 0.3 * vTwinkle);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d) * vTwinkle;
    gl_FragColor = vec4(vColor, a);
  }
`;

/**
 * Deep-space backdrop: a camera-locked procedural nebula, a synthwave
 * floor grid far below the circuit, twinkling stars and drifting
 * wireframe "data shards".
 */
export class Background {
  readonly group = new THREE.Group();
  private readonly nebulaMat: THREE.ShaderMaterial;
  private readonly floorMat: THREE.ShaderMaterial;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly shards: THREE.Object3D[] = [];
  private readonly nebula: THREE.Mesh;
  /** Offscreen nebula: the heavy noise shader runs here at reduced size. */
  private nebulaTarget: THREE.WebGLRenderTarget | null = null;
  private nebulaScale = 1;
  private readonly blitMat: THREE.ShaderMaterial;
  private readonly offscreen = new THREE.Scene();
  private readonly offscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(camera: THREE.Camera, bounds: THREE.Box3, pixelRatio: number) {
    // Nebula plane rides with the camera, far behind everything.
    const quadVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    this.nebulaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOffset: { value: new THREE.Vector2() }, uBeat: { value: 0 }, uAspect: { value: 1.6 } },
      vertexShader: quadVert,
      fragmentShader: NEBULA_FRAG,
      depthWrite: false,
      depthTest: false,
    });
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null } },
      vertexShader: quadVert,
      fragmentShader: BLIT_FRAG,
      depthWrite: false,
      depthTest: false,
    });
    this.nebula = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.nebulaMat);
    this.nebula.position.set(0, 0, -520);
    this.nebula.renderOrder = -100;
    this.nebula.frustumCulled = false;
    camera.add(this.nebula);
    // Full-screen quad used when the nebula renders offscreen.
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.nebulaMat);
    quad.frustumCulled = false;
    this.offscreen.add(quad);

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    // Floor grid.
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uFocus: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: FLOOR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, bounds.min.y - 34, center.z);
    floor.renderOrder = -50;
    this.group.add(floor);

    // Stars scattered below and around the circuit.
    const count = 2200;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(0.4, 1, 1), new THREE.Color(1, 0.35, 0.85), new THREE.Color(0.7, 0.5, 1), new THREE.Color(1, 1, 1)];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = center.x + (Math.random() - 0.5) * (size.x + 260);
      pos[i * 3 + 1] = bounds.min.y - 6 - Math.random() * 120;
      pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * (size.z + 260);
      sizes[i] = 1 + Math.random() * 2.4;
      phases[i] = Math.random();
      const c = palette[Math.floor(Math.random() * palette.length)]!;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, this.starMat);
    stars.renderOrder = -40;
    stars.frustumCulled = false;
    this.group.add(stars);

    // Wireframe data shards drifting in the void.
    const shardGeos = [new THREE.OctahedronGeometry(1), new THREE.TetrahedronGeometry(1), new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.IcosahedronGeometry(1)];
    const shardMats = [
      new THREE.LineBasicMaterial({ color: 0x7a3cff, transparent: true, opacity: 0.35 }),
      new THREE.LineBasicMaterial({ color: 0xff2fb9, transparent: true, opacity: 0.25 }),
      new THREE.LineBasicMaterial({ color: 0x38f5ff, transparent: true, opacity: 0.2 }),
    ];
    for (const m of shardMats) m.toneMapped = false;
    for (let i = 0; i < 46; i++) {
      const geo = shardGeos[i % shardGeos.length]!;
      const shard = new THREE.LineSegments(new THREE.EdgesGeometry(geo), shardMats[i % shardMats.length]!);
      const s = 0.7 + Math.random() * 1.9;
      shard.scale.setScalar(s);
      shard.position.set(
        center.x + (Math.random() - 0.5) * (size.x + 90),
        bounds.min.y - 10 - Math.random() * 40,
        center.z + (Math.random() - 0.5) * (size.z + 90),
      );
      shard.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      shard.userData['spin'] = (Math.random() - 0.5) * 0.4;
      shard.userData['bob'] = Math.random() * Math.PI * 2;
      shard.userData['baseY'] = shard.position.y;
      this.shards.push(shard);
      this.group.add(shard);
    }
  }

  dispose(): void {
    this.nebulaTarget?.dispose();
    this.nebulaTarget = null;
    this.blitMat.uniforms['uMap']!.value = null;
    disposeObjects(this.group, this.nebula, this.offscreen);
    this.nebulaMat.dispose();
    this.blitMat.dispose();
  }

  setAspect(aspect: number): void {
    this.nebulaMat.uniforms['uAspect']!.value = aspect;
  }

  /** Star point sizes are in device pixels, so they track the render pixel ratio. */
  setPixelRatio(pixelRatio: number): void {
    this.starMat.uniforms['uPixelRatio']!.value = pixelRatio;
  }

  /**
   * Sets the nebula render scale. At 1 the noise shader draws straight onto
   * the plane. Below 1 it draws into an offscreen target of
   * `bufferWidth * scale` by `bufferHeight * scale`, and the plane shows that texture.
   */
  setNebulaScale(scale: number, bufferWidth: number, bufferHeight: number): void {
    this.nebulaScale = scale;
    if (scale >= 1) {
      this.nebulaTarget?.dispose();
      this.nebulaTarget = null;
      this.nebula.material = this.nebulaMat;
      return;
    }
    const w = Math.max(1, Math.round(bufferWidth * scale));
    const h = Math.max(1, Math.round(bufferHeight * scale));
    if (!this.nebulaTarget) {
      this.nebulaTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    } else {
      this.nebulaTarget.setSize(w, h);
    }
    this.blitMat.uniforms['uMap']!.value = this.nebulaTarget.texture;
    this.nebula.material = this.blitMat;
  }

  /** Call after a resize so the offscreen target keeps its scale. */
  setSize(bufferWidth: number, bufferHeight: number): void {
    if (this.nebulaTarget) this.setNebulaScale(this.nebulaScale, bufferWidth, bufferHeight);
  }

  /** Draws the offscreen nebula, if enabled. Call once per frame before the main render. */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.nebulaTarget) return;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.nebulaTarget);
    renderer.render(this.offscreen, this.offscreenCamera);
    renderer.setRenderTarget(prev);
  }

  /** Called every frame with the camera target so parallax and fades follow the marble. */
  update(time: number, beat: number, focus: THREE.Vector3, viewHeight: number, aspect: number): void {
    this.nebulaMat.uniforms['uTime']!.value = time;
    this.nebulaMat.uniforms['uBeat']!.value = beat;
    (this.nebulaMat.uniforms['uOffset']!.value as THREE.Vector2).set((focus.x - focus.z) * 0.004, (focus.x + focus.z) * 0.003);
    this.nebulaMat.uniforms['uAspect']!.value = aspect;
    // Keep the nebula plane covering the orthographic frustum.
    this.nebula.scale.set(viewHeight * aspect * 0.5 + 2, viewHeight * 0.5 + 2, 1);

    this.floorMat.uniforms['uTime']!.value = time;
    this.floorMat.uniforms['uBeat']!.value = beat;
    (this.floorMat.uniforms['uFocus']!.value as THREE.Vector3).copy(focus);
    this.starMat.uniforms['uTime']!.value = time;

    for (const s of this.shards) {
      s.rotation.y += (s.userData['spin'] as number) * 0.016;
      s.rotation.x += (s.userData['spin'] as number) * 0.009;
      s.position.y = (s.userData['baseY'] as number) + Math.sin(time * 0.5 + (s.userData['bob'] as number)) * 0.8;
    }
  }
}
