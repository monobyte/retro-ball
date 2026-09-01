import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aLife;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uScale * (0.35 + 0.65 * aLife);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vLife;
    gl_FragColor = vec4(vColor * (1.0 + vLife), a);
  }
`;

/** A pool of neon shards used for death and win bursts. */
export class Burst {
  readonly points: THREE.Points;
  private readonly count = 220;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly col: Float32Array;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.col = new Float32Array(this.count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 24 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Point size scales with pixel density so bursts look the same on any screen. */
  setPixelScale(pixelsPerUnit: number): void {
    this.material.uniforms['uScale']!.value = Math.max(6, pixelsPerUnit * 0.45);
  }

  emit(origin: THREE.Vector3, colors: THREE.Color[], speed = 9, upward = 0.5): void {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.pos[i3] = origin.x;
      this.pos[i3 + 1] = origin.y;
      this.pos[i3 + 2] = origin.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.9);
      this.vel[i3] = Math.sin(phi) * Math.cos(theta) * s;
      this.vel[i3 + 1] = Math.cos(phi) * s + upward * speed;
      this.vel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
      this.life[i] = 0.7 + Math.random() * 0.5;
      const c = colors[Math.floor(Math.random() * colors.length)]!;
      this.col[i3] = c.r;
      this.col[i3 + 1] = c.g;
      this.col[i3 + 2] = c.b;
    }
    this.flag();
  }

  update(dt: number, gravity: number): void {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i]! <= 0) continue;
      any = true;
      const i3 = i * 3;
      this.vel[i3 + 1]! += gravity * 0.35 * dt;
      this.pos[i3]! += this.vel[i3]! * dt;
      this.pos[i3 + 1]! += this.vel[i3 + 1]! * dt;
      this.pos[i3 + 2]! += this.vel[i3 + 2]! * dt;
      this.life[i] = Math.max(0, this.life[i]! - dt * 0.9);
    }
    if (any) this.flag();
  }

  private flag(): void {
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }
}
