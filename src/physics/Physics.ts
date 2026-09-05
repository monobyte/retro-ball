import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { SURFACES, type SurfaceId } from './Surfaces.ts';
import type { PuzzleToken } from '../game/LevelData';
import type { BoxSpec } from '../game/Level';

/** Physics tuning for the marble: the "heavy chrome" arcade feel. */
export const TUNING = {
  gravity: -36,
  timestep: 1 / 120,
  radius: 0.5,
  /** Density gives the ball a mass of ~1 unit (V = 0.52). */
  density: 1.9,
  /** Ground acceleration (units/s^2), scaled by mass into an impulse. */
  groundAccel: 20,
  airAccel: 6,
  maxSpeed: 16,
  linearDamping: 0.25,
  angularDamping: 0.35,
  ballFriction: 1.1,
  ballRestitution: 0.42,
  trackFriction: 1.0,
  trackRestitution: 0.35,
  wallRestitution: 0.6,
} as const;

export interface BallHandles {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

/**
 * Thin wrapper over Rapier: fixed-step world, static track colliders,
 * kinematic platforms and the marble rigid body.
 */
export class Physics {
  readonly world: RAPIER.World;
  private readonly colliderSurfaces = new Map<number, SurfaceId>();
  groundSurface: SurfaceId = 'standard';
  groundCollider: RAPIER.Collider | null = null;
  readonly groundVelocity = new THREE.Vector3();
  readonly groundAngularVelocity = new THREE.Vector3();
  private readonly carryingBodies = new Set<number>();
  private readonly puzzleTokens = new Map<number, PuzzleToken>();
  private readonly beforeStep = new Map<number, {x:number; y:number; z:number}>();
  private accumulator = 0;
  simulationTime = 0;
  private disposed = false;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.colliderSurfaces.clear(); this.carryingBodies.clear(); this.groundCollider = null;
    this.puzzleTokens.clear();this.beforeStep.clear();
    this.world.free();
  }

  clearAccumulator(): void { this.accumulator = 0; }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: TUNING.gravity, z: 0 });
    this.world.timestep = TUNING.timestep;
  }

  addStaticBox(box: BoxSpec): RAPIER.Collider {
    const surface = SURFACES[box.surface];
    const desc = RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.center.x, box.center.y, box.center.z)
      .setRotation({ x: box.quat.x, y: box.quat.y, z: box.quat.z, w: box.quat.w })
      .setFriction(surface.friction)
      .setRestitution(box.kind === 'wall' ? TUNING.wallRestitution : surface.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    if (box.surface !== 'standard') desc.setFrictionCombineRule(box.surface === 'ice' ? RAPIER.CoefficientCombineRule.Min : RAPIER.CoefficientCombineRule.Max);
    const collider = this.world.createCollider(desc);
    this.colliderSurfaces.set(collider.handle, box.surface);
    return collider;
  }

  createKinematicBox(center: THREE.Vector3, size: THREE.Vector3, carries = false): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z),
    );
    const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setFriction(1.4)
      .setRestitution(0.1);
    this.world.createCollider(desc, body);
    if (carries) this.carryingBodies.add(body.handle);
    return body;
  }

  createKinematicHull(center: THREE.Vector3, points: THREE.Vector3[]): RAPIER.RigidBody {
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x,center.y,center.z));
    const shape=RAPIER.ColliderDesc.convexHull(new Float32Array(points.flatMap(p=>[p.x,p.y,p.z])));
    if(!shape)throw new Error('Invalid convex plate footprint.');
    this.world.createCollider(shape.setFriction(.5).setRestitution(0),body);return body;
  }

  createFixedCylinder(center: THREE.Vector3, radius: number, height: number): RAPIER.RigidBody {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius).setFriction(.4).setRestitution(.1), body);
    return body;
  }

  touching(a: RAPIER.Collider, b: RAPIER.Collider): boolean {
    let touching = false;
    this.world.contactPair(a, b, manifold => { if (manifold.numSolverContacts() > 0) touching = true; });
    return touching;
  }

  /** Actual solver contacts only; sensors and nearby bodies do not count as weight. */
  contactBodies(collider: RAPIER.Collider): RAPIER.RigidBody[] {
    const bodies = new Map<number, RAPIER.RigidBody>();
    this.world.contactPairsWith(collider, other => {
      const body = other.parent();
      if (body?.isDynamic() && this.touching(collider, other)) bodies.set(body.handle, body);
    });
    return [...bodies.values()];
  }

  /** Conservative clearance query shared by doors and recovering puzzle geometry. */
  dynamicOverlap(center: THREE.Vector3, size: THREE.Vector3): boolean {
    return this.occupied(center,size,true);
  }

  occupied(center: THREE.Vector3, size: THREE.Vector3, dynamicOnly=false, exclude?: RAPIER.RigidBody): boolean {
    let occupied = false;
    this.world.intersectionsWithShape(center, { x:0, y:0, z:0, w:1 }, new RAPIER.Cuboid(size.x/2,size.y/2,size.z/2), collider => {
      if ((!exclude || collider.parent()?.handle!==exclude.handle) && (!dynamicOnly || collider.parent()?.isDynamic())) { occupied = true; return false; }
      return true;
    });
    return occupied;
  }

  token(body: RAPIER.RigidBody): PuzzleToken | undefined { return this.puzzleTokens.get(body.handle); }
  incomingVelocity(body: RAPIER.RigidBody): {x:number;y:number;z:number} { return this.beforeStep.get(body.handle) ?? body.linvel(); }

  createPushable(pos: THREE.Vector3, size: number, mass: number, shape: 'cube'|'orb', token: PuzzleToken): BallHandles {
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x,pos.y,pos.z).setLinearDamping(.7).setAngularDamping(.8).setCcdEnabled(true));
    const collider=this.world.createCollider((shape==='cube'?RAPIER.ColliderDesc.cuboid(size/2,size/2,size/2):RAPIER.ColliderDesc.ball(size/2)).setMass(mass).setFriction(shape==='cube'?.16:.45).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.05),body);
    this.puzzleTokens.set(body.handle,token);return {body,collider};
  }

  createBall(pos: THREE.Vector3): BallHandles {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(TUNING.linearDamping)
        .setAngularDamping(TUNING.angularDamping)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(TUNING.radius)
        .setDensity(TUNING.density)
        .setFriction(TUNING.ballFriction)
        .setRestitution(TUNING.ballRestitution),
      body,
    );
    return { body, collider };
  }

  /**
   * Advances the world with a fixed timestep. `onStep` runs before each
   * sub-step so forces and kinematic targets are applied consistently.
   */
  update(dt: number, onStep: (stepDt: number) => void, afterStep?: (stepDt: number) => void): void {
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= TUNING.timestep) {
      this.simulationTime += TUNING.timestep;
      onStep(TUNING.timestep);
      this.beforeStep.clear();
      this.world.forEachRigidBody(body=>{if(body.isDynamic() && body.isEnabled())this.beforeStep.set(body.handle,{...body.linvel()})});
      this.world.step();
      afterStep?.(TUNING.timestep);
      this.accumulator -= TUNING.timestep;
    }
  }

  /** Returns the surface normal under the ball, or null when airborne. */
  groundNormal(ball: BallHandles, out: THREE.Vector3, clearance = 0.12): THREE.Vector3 | null {
    const p = ball.body.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, TUNING.radius + clearance, true, undefined, undefined, ball.collider);
    this.groundCollider = hit?.collider ?? null; this.groundVelocity.set(0, 0, 0); this.groundAngularVelocity.set(0, 0, 0);
    if (!hit) { this.groundSurface = 'standard'; return null; }
    const support = hit.collider.parent();
    if (support && this.carryingBodies.has(support.handle)) {
      const velocity = support.velocityAtPoint(p), spin = support.angvel();
      this.groundVelocity.set(velocity.x, velocity.y, velocity.z);
      this.groundAngularVelocity.set(spin.x, spin.y, spin.z);
    }
    this.groundSurface = this.colliderSurfaces.get(hit.collider.handle) ?? 'standard';
    return out.set(hit.normal.x, hit.normal.y, hit.normal.z);
  }

  sightlineBlocked(ball: BallHandles, direction: THREE.Vector3): boolean {
    const p = ball.body.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, direction);
    const hit = this.world.castRay(ray, 160, true, undefined, undefined, ball.collider);
    return hit !== null;
  }

  removeBody(body: RAPIER.RigidBody): void { this.carryingBodies.delete(body.handle); this.puzzleTokens.delete(body.handle); this.beforeStep.delete(body.handle); this.world.removeRigidBody(body); }

  resetBall(ball: BallHandles, pos: THREE.Vector3): void {
    ball.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
}
