import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { DIR_VEC, type MechanicalPiece } from '../LevelData';
import { gridBoxGeometry } from '../Level';
import { GridMaterial, TONES } from '../../render/GridMaterial';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { Physics, BallHandles } from '../../physics/Physics';
import { disposeObjects } from '../../runtime/disposeObjects';
import { shuttleFraction } from './Motion.ts';

/** Physical carrying surfaces; their local clock is part of checkpoint state. */
export class MovingSurface implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly material = new GridMaterial(TONES.cyan, .95);
  private elapsed = 0;
  private enabled = true;
  private readonly origin: THREE.Vector3;
  private readonly arrows: THREE.Group[] = [];
  private readonly direction = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly nextPosition = new THREE.Vector3();
  private readonly physics: Physics;
  private disposed = false;

  constructor(readonly def: MechanicalPiece, instance: LevelInstance, physics: Physics) {
    this.id = instance.id; this.resetGroup = instance.resetGroup; this.physics = physics;
    this.origin = new THREE.Vector3(def.x, def.y - .3, def.z);
    this.body = physics.createKinematicBox(this.origin, new THREE.Vector3(def.w, .6, def.d), true);
    this.body.collider(0).setFriction(2.5); this.body.collider(0).setRestitution(.05);
    if (def.kind !== 'rotator') { const [x, z] = DIR_VEC[def.dir]; this.direction.set(x, 0, z); }
    const mesh = new THREE.Mesh(gridBoxGeometry(new THREE.Vector3(def.w, .6, def.d)), this.material);
    this.group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: def.kind === 'conveyor' ? 0xffda63 : 0x70ffe2 }));
    this.group.add(edges);
    const mat = new THREE.MeshBasicMaterial({ color: def.kind === 'conveyor' ? 0xffda63 : 0x70ffe2, side: THREE.DoubleSide, transparent: true, opacity: .85 });
    if (def.kind === 'rotator') {
      // Curved arrows identify rotation before the player steps onto the platform.
      const radius = Math.min(def.w, def.d) * .3, sign = Math.sign(def.angularSpeed);
      const segments: number[] = [];
      const point = (angle: number) => new THREE.Vector3(Math.cos(angle) * radius, .33, -Math.sin(angle) * radius * sign);
      for (const start of [0, Math.PI]) {
        for (let i = 0; i < 24; i++) segments.push(...point(start + i / 24 * Math.PI * .7).toArray(), ...point(start + (i + 1) / 24 * Math.PI * .7).toArray());
        const angle = start + Math.PI * .7, end = point(angle);
        const back = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle) * sign).multiplyScalar(.5);
        const side = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle) * sign).multiplyScalar(.28);
        for (const direction of [-1, 1]) segments.push(...end.toArray(), ...end.clone().add(back).addScaledVector(side, direction).toArray());
      }
      this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segments, 3)), new THREE.LineBasicMaterial({ color: 0xffda63 })));
    }
    const lanes = def.kind === 'rotator' ? 0 : Math.max(1, Math.floor((def.dir.endsWith('x') ? def.w : def.d) / 2));
    for (let i = 0; i < lanes; i++) {
      const arrow = new THREE.Group();
      for (const side of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(.13, .025, .7), mat);
        stripe.rotation.y = side * Math.PI / 4; stripe.position.set(side * .22, .32, .2); arrow.add(stripe);
      }
      arrow.rotation.y = def.kind === 'rotator' ? 0 : Math.atan2(-this.direction.x, -this.direction.z);
      this.arrows.push(arrow); this.group.add(arrow);
    }
    if (!lanes) mat.dispose();
    this.sync(true);
  }
  fixedUpdate(_time: number, dt: number): void {
    if(this.enabled)this.elapsed+=dt;this.sync(false);
    if(this.def.kind==='conveyor')for(const body of this.physics.contactBodies(this.body.collider(0))){
      if(this.physics.token(body) && body.translation().y>this.def.y-.1)this.contact({body,collider:body.collider(0)},this.body.collider(0),dt);
    }
  }
  private sync(immediate: boolean): void {
    this.nextPosition.copy(this.origin); this.rotation.identity();
    if (this.def.kind === 'bridge') this.nextPosition.addScaledVector(this.direction, this.def.distance * shuttleFraction(this.elapsed, this.def.period, this.def.dwell));
    if (this.def.kind === 'rotator') this.rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.elapsed * this.def.angularSpeed * Math.PI / 180);
    if (immediate) { this.body.setTranslation(this.nextPosition, true); this.body.setRotation(this.rotation, true); }
    this.body.setNextKinematicTranslation(this.nextPosition); this.body.setNextKinematicRotation(this.rotation);
  }
  /** Conveyor acceleration is tangential and only applies to a contacted body. */
  contact(ball: BallHandles, collider: RAPIER.Collider | null, dt: number): void {
    if (!this.enabled || this.def.kind !== 'conveyor' || collider?.handle !== this.body.collider(0).handle) return;
    const v = ball.body.linvel(), along = v.x * this.direction.x + v.z * this.direction.z;
    const change = THREE.MathUtils.clamp(this.def.speed - along, -(this.def.acceleration ?? 12) * dt, (this.def.acceleration ?? 12) * dt);
    ball.body.applyImpulse(this.direction.clone().multiplyScalar(change * ball.body.mass()), true);
  }
  visualUpdate(frame: VisualFrame): void {
    const p = this.body.translation(), q = this.body.rotation();
    this.group.position.set(p.x, p.y, p.z); this.group.quaternion.set(q.x, q.y, q.z, q.w);
    this.material.setFrame(frame.presentationTime, frame.beat, frame.marblePosition);
    const length = this.def.kind !== 'rotator' && this.def.dir.endsWith('x') ? this.def.w : this.def.d;
    for (const [i, arrow] of this.arrows.entries()) {
      const travel = this.def.kind === 'conveyor' ? (this.elapsed * this.def.speed * .5) % length : 0;
      const offset = ((i * length / this.arrows.length + travel) % length) - length / 2;
      arrow.position.copy(this.def.kind === 'rotator' ? new THREE.Vector3(0, 0, offset) : this.direction.clone().multiplyScalar(offset));
    }
  }
  receiveSignal(port: SignalPort, value: SignalValue): void { if (port === 'enable') this.enabled = value === true; else if (port === 'reset') this.reset(null); }
  capture(): LogicalValue { return { elapsed: this.elapsed, enabled: this.enabled }; }
  reset(state: LogicalValue): void {
    this.enabled = !(state && typeof state === 'object' && 'enabled' in state && state.enabled === false);
    this.elapsed = state && typeof state === 'object' && 'elapsed' in state && typeof state.elapsed === 'number' && Number.isFinite(state.elapsed) ? Math.max(0, state.elapsed) : 0;
    this.sync(true);
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; disposeObjects(this.group); this.physics.removeBody(this.body); }
}
