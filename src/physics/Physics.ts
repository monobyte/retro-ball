import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { BoxSpec } from '../game/Level';

/** Physics tuning for the marble: the "heavy chrome" arcade feel. */
export const TUNING = {
  gravity: -36,
  timestep: 1 / 120,
  radius: 0.5,
  /** Density gives the ball a mass of ~1 unit (V = 0.52). */
  density: 1.9,
  /** Ground acceleration (units/s^2), scaled by mass into an impulse. */
  groundAccel: 26,
  airAccel: 4,
  maxSpeed: 22,
  linearDamping: 0.12,
  angularDamping: 0.35,
  ballFriction: 1.1,
  ballRestitution: 0.42,
  trackFriction: 1.0,
  trackRestitution: 0.35,
  wallRestitution: 0.75,
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
  private accumulator = 0;

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: TUNING.gravity, z: 0 });
    this.world.timestep = TUNING.timestep;
  }

  addStaticBox(box: BoxSpec): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.center.x, box.center.y, box.center.z)
      .setRotation({ x: box.quat.x, y: box.quat.y, z: box.quat.z, w: box.quat.w })
      .setFriction(TUNING.trackFriction)
      .setRestitution(box.kind === 'wall' ? TUNING.wallRestitution : TUNING.trackRestitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    return this.world.createCollider(desc);
  }

  createKinematicBox(center: THREE.Vector3, size: THREE.Vector3): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z),
    );
    const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setFriction(1.4)
      .setRestitution(0.1);
    this.world.createCollider(desc, body);
    return body;
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
  update(dt: number, onStep: (stepDt: number) => void): void {
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= TUNING.timestep) {
      onStep(TUNING.timestep);
      this.world.step();
      this.accumulator -= TUNING.timestep;
    }
  }

  /** Returns the surface normal under the ball, or null when airborne. */
  groundNormal(ball: BallHandles, out: THREE.Vector3): THREE.Vector3 | null {
    const p = ball.body.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, TUNING.radius + 0.12, true, undefined, undefined, ball.collider);
    if (!hit) return null;
    return out.set(hit.normal.x, hit.normal.y, hit.normal.z);
  }

  resetBall(ball: BallHandles, pos: THREE.Vector3): void {
    ball.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
}
