import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GridMaterial, TONES } from '../render/GridMaterial';
import type { Physics } from '../physics/Physics';
import type RAPIER from '@dimforge/rapier3d-compat';
import type {
  CheckpointPiece,
  ElevatorPiece,
  GoalPiece,
  JumpPadPiece,
  LaserPiece,
  LevelDefinition,
  VoidPiece,
} from './LevelData';
import type { LabelSpec } from './Level';

export type DeathCause = 'laser' | 'void' | 'fall';

export type TriggerEvent =
  | { type: 'jump'; velocity: THREE.Vector3 }
  | { type: 'death'; cause: DeathCause }
  | { type: 'checkpoint'; id: number; position: THREE.Vector3 }
  | { type: 'goal'; position: THREE.Vector3 };

const PINK = new THREE.Color(1.0, 0.18, 0.72);
const CYAN = new THREE.Color(0.25, 1.0, 1.0);
const VIOLET = new THREE.Color(0.6, 0.3, 1.0);
const LASER_RED = new THREE.Color(1.0, 0.12, 0.35);

function additive(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  m.toneMapped = false;
  return m;
}

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uInvert;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float h = mix(vUv.y, 1.0 - vUv.y, uInvert);
    float fade = pow(1.0 - h, 2.2);
    float scan = 0.7 + 0.3 * sin(vUv.y * 60.0 - uTime * 3.0);
    gl_FragColor = vec4(uColor * (1.0 + 0.4 * scan), uOpacity * fade * scan);
  }
`;

/** Soft vertical light column that fades with height (or downward when inverted). */
class BeamMaterial extends THREE.ShaderMaterial {
  constructor(color: THREE.Color, opacity: number, invert = false) {
    super({
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: opacity },
        uInvert: { value: invert ? 1 : 0 },
        uTime: { value: 0 },
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }
  setOpacity(v: number): void {
    this.uniforms['uOpacity']!.value = v;
  }
  setTime(t: number): void {
    this.uniforms['uTime']!.value = t;
  }
}

function fatLines(segments: number[], color: THREE.Color, width: number, opacity = 1): LineSegments2 {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(segments);
  const mat = new LineMaterial({ color: color.getHex(), linewidth: width, worldUnits: false, transparent: true, opacity, depthWrite: false });
  mat.toneMapped = false;
  const l = new LineSegments2(geo, mat);
  l.renderOrder = 3;
  return l;
}

function rectSegments(cx: number, y: number, cz: number, w: number, d: number): number[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  return [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0];
}

/* ------------------------------------------------------------------------ */

class JumpPad {
  readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMats: THREE.MeshBasicMaterial[] = [];
  readonly launchVelocity = new THREE.Vector3();
  private cooldownUntil = 0;
  private readonly half = 0.9;

  constructor(readonly def: JumpPadPiece, gravity: number) {
    // Deterministic ballistic solve so every launch lands on the target.
    const g = Math.abs(gravity);
    const dh = def.targetY - (def.y + 0.5);
    const apex = Math.max(dh, 0) + (def.arc ?? 3.5);
    const vy = Math.sqrt(2 * g * apex);
    const disc = Math.max(0, vy * vy - 2 * g * dh);
    const t = (vy + Math.sqrt(disc)) / g;
    // Linear damping bleeds ~10% of velocity over the flight; compensate.
    const dragComp = 1.0 + 0.06 * t;
    this.launchVelocity.set(((def.targetX - def.x) / t) * dragComp, vy * (1.0 + 0.03 * t), ((def.targetZ - def.z) / t) * dragComp);

    this.group.position.set(def.x, def.y, def.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(this.half, this.half, 0.12, 32), additive(CYAN, 0.35));
    base.position.y = 0.06;
    this.group.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(this.half, 0.05, 8, 48), additive(CYAN, 0.9));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.12;
    this.group.add(rim);
    for (let i = 0; i < 3; i++) {
      const mat = additive(CYAN, 0.6);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      this.rings.push(ring);
      this.ringMats.push(mat);
      this.group.add(ring);
    }
    // Direction chevron pointing along the launch.
    const dir = new THREE.Vector3(this.launchVelocity.x, 0, this.launchVelocity.z).normalize();
    const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 3), additive(CYAN, 0.8));
    chevron.position.set(dir.x * 0.45, 0.16, dir.z * 0.45);
    chevron.rotation.x = Math.PI / 2;
    chevron.rotation.z = -Math.atan2(dir.z, dir.x) + Math.PI / 2;
    chevron.rotation.order = 'ZXY';
    this.group.add(chevron);
  }

  update(time: number, beat: number): void {
    for (let i = 0; i < this.rings.length; i++) {
      const phase = (time * 1.1 + i / this.rings.length) % 1;
      const ring = this.rings[i]!;
      ring.position.y = 0.15 + phase * 1.8;
      const s = 1.0 + 0.5 * beat - phase * 0.55;
      ring.scale.setScalar(Math.max(0.1, s));
      this.ringMats[i]!.opacity = (1 - phase) * 0.7;
    }
  }

  test(p: THREE.Vector3, time: number): boolean {
    if (time < this.cooldownUntil) return false;
    const d = this.def;
    if (Math.abs(p.x - d.x) < this.half && Math.abs(p.z - d.z) < this.half && p.y > d.y && p.y < d.y + 1.4) {
      this.cooldownUntil = time + 0.6;
      return true;
    }
    return false;
  }
}

/* ------------------------------------------------------------------------ */

class Elevator {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  private readonly size: THREE.Vector3;
  private readonly platform: THREE.Group;
  private readonly beam: THREE.Mesh;
  private readonly beamMat: BeamMaterial;
  readonly material: GridMaterial;

  constructor(readonly def: ElevatorPiece, physics: Physics) {
    this.size = new THREE.Vector3(def.w, 1, def.d);
    const start = new THREE.Vector3(def.x, this.heightAt(0) - 0.5, def.z);
    this.body = physics.createKinematicBox(start, this.size);

    this.platform = new THREE.Group();
    this.material = new GridMaterial(TONES.cyan, 0.85);
    const geo = new THREE.BoxGeometry(def.w, 1, def.d);
    // Grid attribute in tile units (same convention as the static level).
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    const grid = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const su = nx > 0.5 ? def.d : def.w;
      const sv = ny > 0.5 ? def.d : 1;
      grid[i * 2] = uv.getX(i) * su;
      grid[i * 2 + 1] = uv.getY(i) * sv;
    }
    geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.renderOrder = 1;
    this.platform.add(mesh);
    const hx = def.w / 2, hz = def.d / 2;
    const edges: number[] = [];
    for (const y of [-0.5, 0.5]) edges.push(...rectSegments(0, y, 0, def.w, def.d));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) edges.push(sx * hx, -0.5, sz * hz, sx * hx, 0.5, sz * hz);
    this.platform.add(fatLines(edges, VIOLET, 2.2));
    this.group.add(this.platform);

    // Vertical guide rails spanning the travel range.
    const rails: number[] = [];
    const yLo = def.y0 - 1.2, yHi = def.y1 + 0.6;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      rails.push(def.x + sx * hx, yLo, def.z + sz * hz, def.x + sx * hx, yHi, def.z + sz * hz);
    }
    rails.push(...rectSegments(def.x, yLo, def.z, def.w, def.d));
    this.group.add(fatLines(rails, CYAN, 1.3, 0.55));

    // Light column under the platform.
    this.beamMat = new BeamMaterial(CYAN, 0.35, true);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(hx, hz) * 0.75, Math.min(hx, hz) * 0.9, 1, 24, 1, true), this.beamMat);
    this.group.add(this.beam);
  }

  /** Piecewise cycle: dwell at bottom, rise, dwell at top, descend. */
  heightAt(time: number): number {
    const u = ((time / this.def.period + (this.def.phase ?? 0)) % 1 + 1) % 1;
    const ease = (t: number) => t * t * (3 - 2 * t);
    let f: number;
    if (u < 0.28) f = 0;
    else if (u < 0.5) f = ease((u - 0.28) / 0.22);
    else if (u < 0.78) f = 1;
    else f = 1 - ease((u - 0.78) / 0.22);
    return this.def.y0 + (this.def.y1 - this.def.y0) * f;
  }

  /** Called once per physics sub-step. */
  stepKinematic(time: number): void {
    const y = this.heightAt(time) - 0.5;
    this.body.setNextKinematicTranslation({ x: this.def.x, y, z: this.def.z });
  }

  update(time: number, beat: number): void {
    this.beamMat.setTime(time);
    const t = this.body.translation();
    this.platform.position.set(t.x, t.y, t.z);
    const bottom = this.def.y0 - 1.2;
    const h = Math.max(0.05, t.y - 0.5 - bottom);
    this.beam.position.set(t.x, bottom + h / 2, t.z);
    this.beam.scale.set(1, h, 1);
    this.beamMat.setOpacity(0.25 + 0.25 * beat);
  }
}

/* ------------------------------------------------------------------------ */

class Laser {
  readonly group = new THREE.Group();
  private readonly beamGroup = new THREE.Group();
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly emitterMats: THREE.MeshBasicMaterial[] = [];
  private on = 1;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor(readonly def: LaserPiece) {
    const beamY = def.y + 0.5;
    this.group.position.set(def.x, 0, def.z);
    const along = def.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);

    this.coreMat = additive(new THREE.Color(1.0, 0.7, 0.85), 0.95);
    this.glowMat = additive(LASER_RED, 0.32);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, def.length, 8, 1, true), this.coreMat);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, def.length, 12, 1, true), this.glowMat);
    for (const m of [core, glow]) {
      m.rotation.z = def.axis === 'x' ? Math.PI / 2 : 0;
      m.rotation.x = def.axis === 'z' ? Math.PI / 2 : 0;
      m.position.y = beamY;
      this.beamGroup.add(m);
    }
    // Emitter posts at both ends.
    for (const s of [-1, 1]) {
      const post = new THREE.Group();
      post.position.copy(along).multiplyScalar((s * def.length) / 2);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.15, 0.28), new THREE.MeshBasicMaterial({ color: 0x1a0630 }));
      pillar.position.y = def.y + 0.575;
      post.add(pillar);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(pillar.geometry), new THREE.LineBasicMaterial({ color: PINK }));
      (edges.material as THREE.LineBasicMaterial).toneMapped = false;
      edges.position.copy(pillar.position);
      post.add(edges);
      const tipMat = additive(new THREE.Color(1, 0.5, 0.75), 1);
      this.emitterMats.push(tipMat);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), tipMat);
      tip.position.y = beamY;
      post.add(tip);
      this.beamGroup.add(post);
    }
    this.group.add(this.beamGroup);
  }

  private sweepOffset(time: number): number {
    const d = this.def;
    if (d.sweep === 0) return 0;
    return d.sweep * Math.sin(2 * Math.PI * (time * d.speed + (d.phase ?? 0)));
  }

  private isOn(time: number): boolean {
    const d = this.def;
    if (!d.gatePeriod) return true;
    const u = ((time / d.gatePeriod + (d.phase ?? 0)) % 1 + 1) % 1;
    return u < (d.gateDuty ?? 0.5);
  }

  update(time: number, beat: number, dt: number): void {
    const off = this.sweepOffset(time);
    if (this.def.axis === 'x') this.beamGroup.position.z = off;
    else this.beamGroup.position.x = off;
    const target = this.isOn(time) ? 1 : 0;
    this.on += (target - this.on) * Math.min(1, dt * 18);
    this.coreMat.opacity = this.on * (0.8 + 0.2 * beat);
    this.glowMat.opacity = this.on * (0.25 + 0.2 * beat);
    for (const m of this.emitterMats) m.opacity = 0.35 + 0.65 * this.on;
  }

  /** Distance test of the marble against the live beam segment. */
  test(p: THREE.Vector3, radius: number, time: number): boolean {
    if (!this.isOn(time)) return false;
    const d = this.def;
    const off = this.sweepOffset(time);
    const y = d.y + 0.5;
    if (d.axis === 'x') {
      this.a.set(d.x - d.length / 2, y, d.z + off);
      this.b.set(d.x + d.length / 2, y, d.z + off);
    } else {
      this.a.set(d.x + off, y, d.z - d.length / 2);
      this.b.set(d.x + off, y, d.z + d.length / 2);
    }
    const ab = this.b.clone().sub(this.a);
    const t = THREE.MathUtils.clamp(p.clone().sub(this.a).dot(ab) / ab.lengthSq(), 0, 1);
    const closest = this.a.clone().addScaledVector(ab, t);
    return closest.distanceTo(p) < radius + 0.12;
  }
}

/* ------------------------------------------------------------------------ */

const VOID_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vUv - 0.5;
    float r = max(abs(p.x), abs(p.y)) * 2.0;
    float rim = smoothstep(0.62, 1.0, r);
    float flick = 0.6 + 0.4 * step(0.35, hash(vec2(floor(uTime * 12.0), floor(vUv.y * 6.0))));
    vec3 col = vec3(1.0, 0.1, 0.3) * rim * flick * 1.6;
    float scan = step(0.6, fract(vUv.y * 10.0 - uTime * 2.0)) * 0.25;
    col += vec3(0.5, 0.0, 0.18) * scan * (1.0 - rim);
    float depth = 1.0 - smoothstep(0.0, 0.7, r);
    col *= 1.0 - depth * 0.9;
    gl_FragColor = vec4(col, 0.97);
  }
`;
const VOID_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

class VoidMarker {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;

  constructor(readonly def: VoidPiece) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VOID_VERT,
      fragmentShader: VOID_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.d), this.material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(def.x, def.y - 0.85, def.z);
    this.group.add(plane);
    this.group.add(fatLines(rectSegments(def.x, def.y + 0.01, def.z, def.w, def.d), LASER_RED, 1.8, 0.9));
  }

  update(time: number): void {
    this.material.uniforms['uTime']!.value = time;
  }

  test(p: THREE.Vector3): boolean {
    const d = this.def;
    return Math.abs(p.x - d.x) < d.w / 2 && Math.abs(p.z - d.z) < d.d / 2 && p.y < d.y - 0.7;
  }
}

/* ------------------------------------------------------------------------ */

class Checkpoint {
  readonly group = new THREE.Group();
  private readonly discMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly halo: THREE.Mesh;
  active = false;
  readonly spawn: THREE.Vector3;

  constructor(readonly def: CheckpointPiece) {
    this.spawn = new THREE.Vector3(def.x, def.y + 0.6, def.z);
    this.group.position.set(def.x, def.y, def.z);
    this.discMat = additive(VIOLET, 0.35);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 40), this.discMat);
    disc.position.y = 0.05;
    this.group.add(disc);
    this.ringMat = additive(VIOLET, 0.9);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 56), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    this.group.add(ring);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 48), this.ringMat);
    this.halo.position.y = 1.0;
    this.group.add(this.halo);
  }

  update(time: number, beat: number): void {
    this.halo.rotation.y = time * 1.4;
    this.halo.rotation.x = Math.sin(time * 0.9) * 0.6;
    this.halo.position.y = 1.0 + Math.sin(time * 2.0) * 0.15;
    const c = this.active ? CYAN : VIOLET;
    this.discMat.color.copy(c);
    this.ringMat.color.copy(c);
    this.discMat.opacity = 0.25 + 0.3 * beat;
  }

  test(p: THREE.Vector3): boolean {
    if (this.active) return false;
    const d = this.def;
    return Math.hypot(p.x - d.x, p.z - d.z) < 1.3 && p.y > d.y && p.y < d.y + 2.5;
  }
}

/* ------------------------------------------------------------------------ */

const PORTAL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  varying vec2 vUv;
  void main() {
    float scan = 0.5 + 0.5 * sin((vUv.y * 40.0) - uTime * 6.0);
    float wave = 0.5 + 0.5 * sin(vUv.y * 6.0 + uTime * 2.0);
    vec3 pink = vec3(1.0, 0.2, 0.75);
    vec3 cyan = vec3(0.3, 1.0, 1.0);
    vec3 col = mix(pink, cyan, wave) * (0.35 + 0.35 * scan) * (1.0 + 0.6 * uBeat);
    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x);
    float fade = 1.0 - smoothstep(0.55, 1.0, vUv.y);
    gl_FragColor = vec4(col, (0.28 + 0.2 * scan) * edge * fade);
  }
`;

class Goal {
  readonly group = new THREE.Group();
  private readonly portalMat: THREE.ShaderMaterial;
  private readonly beamMat: BeamMaterial;
  readonly position: THREE.Vector3;

  constructor(readonly def: GoalPiece) {
    this.position = new THREE.Vector3(def.x, def.y, def.z);
    this.group.position.copy(this.position);
    const h = 3.4;
    const postGeo = new THREE.BoxGeometry(0.35, h, 0.35);
    const postMat = new THREE.MeshBasicMaterial({ color: 0x2a0840 });
    const edgeMat = new THREE.LineBasicMaterial({ color: PINK });
    edgeMat.toneMapped = false;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set((s * def.w) / 2, h / 2, 0);
      this.group.add(post);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(postGeo), edgeMat);
      e.position.copy(post.position);
      this.group.add(e);
    }
    const barGeo = new THREE.BoxGeometry(def.w + 0.35, 0.35, 0.35);
    const bar = new THREE.Mesh(barGeo, postMat);
    bar.position.set(0, h, 0);
    this.group.add(bar);
    const be = new THREE.LineSegments(new THREE.EdgesGeometry(barGeo), edgeMat);
    be.position.copy(bar.position);
    this.group.add(be);

    this.portalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBeat: { value: 0 } },
      vertexShader: VOID_VERT,
      fragmentShader: PORTAL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(def.w, h - 0.2), this.portalMat);
    portal.position.set(0, (h - 0.2) / 2, 0);
    this.group.add(portal);

    this.beamMat = new BeamMaterial(PINK, 0.22);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(def.w * 0.3, def.w * 0.5, 26, 24, 1, true), this.beamMat);
    beam.position.y = 13;
    this.group.add(beam);
  }

  update(time: number, beat: number): void {
    this.portalMat.uniforms['uTime']!.value = time;
    this.portalMat.uniforms['uBeat']!.value = beat;
    this.beamMat.setTime(time);
    this.beamMat.setOpacity(0.16 + 0.14 * beat);
  }

  test(p: THREE.Vector3): boolean {
    const d = this.def;
    return Math.abs(p.x - d.x) < d.w / 2 && Math.abs(p.z - d.z) < d.d / 2 + 0.3 && p.y > d.y && p.y < d.y + 3;
  }
}

/* ------------------------------------------------------------------------ */

function makeLabel(spec: LabelSpec): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,47,185,0.9)';
  ctx.shadowColor = 'rgba(255,47,185,1)';
  ctx.shadowBlur = 24;
  ctx.strokeRect(24, 24, c.width - 48, c.height - 48);
  ctx.font = 'bold 150px Orbitron, "Share Tech Mono", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd9f5';
  ctx.shadowBlur = 40;
  ctx.fillText(spec.text, c.width / 2, c.height / 2 + 6);
  ctx.fillStyle = 'rgba(255,47,185,0.55)';
  ctx.fillText(spec.text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  mat.toneMapped = false;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.width / 4), mat);
  plane.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.position.copy(spec.position);
  g.rotation.y = Math.PI / 4;
  g.add(plane);
  g.renderOrder = 2;
  return g;
}

/* ------------------------------------------------------------------------ */

/** All animated / interactive pieces of the level. */
export class LevelDynamics {
  readonly group = new THREE.Group();
  readonly jumpPads: JumpPad[] = [];
  readonly elevators: Elevator[] = [];
  readonly lasers: Laser[] = [];
  readonly voids: VoidMarker[] = [];
  readonly checkpoints: Checkpoint[] = [];
  goal: Goal | null = null;

  constructor(def: LevelDefinition, physics: Physics, labels: LabelSpec[], gravity: number) {
    for (const p of def.pieces) {
      switch (p.kind) {
        case 'jumppad': {
          const j = new JumpPad(p, gravity);
          this.jumpPads.push(j);
          this.group.add(j.group);
          break;
        }
        case 'elevator': {
          const e = new Elevator(p, physics);
          this.elevators.push(e);
          this.group.add(e.group);
          break;
        }
        case 'laser': {
          const l = new Laser(p);
          this.lasers.push(l);
          this.group.add(l.group);
          break;
        }
        case 'void': {
          const v = new VoidMarker(p);
          this.voids.push(v);
          this.group.add(v.group);
          break;
        }
        case 'checkpoint': {
          const c = new Checkpoint(p);
          this.checkpoints.push(c);
          this.group.add(c.group);
          break;
        }
        case 'goal': {
          this.goal = new Goal(p);
          this.group.add(this.goal.group);
          break;
        }
        default:
          break;
      }
    }
    for (const l of labels) this.group.add(makeLabel(l));
  }

  setResolution(w: number, h: number): void {
    this.group.traverse((o) => {
      if (o instanceof LineSegments2) (o.material as LineMaterial).resolution.set(w, h);
    });
  }

  /** Per physics sub-step: move kinematic bodies. */
  stepKinematics(time: number): void {
    for (const e of this.elevators) e.stepKinematic(time);
  }

  /** Per render frame: animate visuals. */
  update(time: number, dt: number, beat: number, marblePos: THREE.Vector3): void {
    for (const j of this.jumpPads) j.update(time, beat);
    for (const e of this.elevators) {
      e.update(time, beat);
      e.material.setFrame(time, beat, marblePos);
    }
    for (const l of this.lasers) l.update(time, beat, dt);
    for (const v of this.voids) v.update(time);
    for (const c of this.checkpoints) c.update(time, beat);
    this.goal?.update(time, beat);
  }

  checkTriggers(p: THREE.Vector3, radius: number, time: number): TriggerEvent[] {
    const out: TriggerEvent[] = [];
    for (const l of this.lasers) if (l.test(p, radius, time)) out.push({ type: 'death', cause: 'laser' });
    for (const v of this.voids) if (v.test(p)) out.push({ type: 'death', cause: 'void' });
    for (const j of this.jumpPads) if (j.test(p, time)) out.push({ type: 'jump', velocity: j.launchVelocity.clone() });
    for (const c of this.checkpoints) {
      if (c.test(p)) {
        c.active = true;
        out.push({ type: 'checkpoint', id: c.def.id, position: c.spawn.clone() });
      }
    }
    if (this.goal && this.goal.test(p)) out.push({ type: 'goal', position: this.goal.position.clone() });
    return out;
  }

  resetCheckpoints(): void {
    for (const c of this.checkpoints) c.active = false;
  }
}
