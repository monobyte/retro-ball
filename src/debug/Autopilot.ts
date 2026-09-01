import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { Input } from '../input/Input';

/**
 * Development-only waypoint follower. It drives the marble through the
 * circuit using the same screen-space input the player has, which makes it
 * an end-to-end test of level connectivity and physics tuning.
 */
export interface Waypoint {
  x: number;
  z: number;
  /** Arrival radius (default 1.0). */
  radius?: number;
  /** Desired cruise speed toward this waypoint (default 11). */
  speed?: number;
  /** Hold position here until the marble's height exceeds this value (elevators). */
  waitForY?: number;
  label?: string;
}

/** Reference route through THE NEON GRID CIRCUIT, one entry per turn. */
export const CIRCUIT_ROUTE: Waypoint[] = [
  { x: 0, z: -3, label: 'leave start' },
  { x: 0.9, z: -5.5, speed: 8, label: 'chicane 1' },
  { x: -0.9, z: -8.5, speed: 8, label: 'chicane 2' },
  { x: 0, z: -11, label: 'ramp foot' },
  { x: 0, z: -17.5, speed: 13, label: 'ramp top' },
  { x: 0, z: -22, speed: 10, label: 'plateau' },
  { x: 4.5, z: -22, speed: 8, label: 'ledge start' },
  { x: 10.8, z: -22, speed: 7, label: 'ledge jog' },
  { x: 11.5, z: -19.2, speed: 6, label: 'jog corner' },
  { x: 15, z: -19, speed: 8 },
  { x: 21, z: -19, speed: 8, label: 'checkpoint A' },
  { x: 21, z: -22.5, speed: 6 },
  { x: 21, z: -24.6, speed: 5, radius: 0.7, label: 'jump pad 1' },
  { x: 21, z: -33, radius: 2.5, speed: 6, label: 'landing' },
  { x: 27, z: -33.5, speed: 9, label: 'corridor' },
  { x: 31.5, z: -33.5, speed: 6, radius: 0.8, waitForY: 9.7, label: 'elevator 1' },
  { x: 31.5, z: -38, speed: 7, label: 'high platform' },
  { x: 28.5, z: -38.5, speed: 8, label: 'ramp start' },
  { x: 10, z: -38.5, speed: 16, radius: 1.6, label: 'speed ramp' },
  { x: 6.5, z: -39.2, speed: 9, label: 'void field in' },
  { x: 3.5, z: -40.6, speed: 8 },
  { x: -0.5, z: -40.6, speed: 7 },
  { x: -2, z: -43, speed: 6, label: 'ledge B' },
  { x: -2, z: -48, speed: 8 },
  { x: -2, z: -52, speed: 7, label: 'checkpoint B' },
  { x: -6, z: -52, speed: 7 },
  { x: -10, z: -52, speed: 7, label: 'laser gate' },
  { x: -13.5, z: -52, speed: 6, radius: 0.8, waitForY: 8.7, label: 'elevator 2' },
  { x: -13.5, z: -47.5, speed: 7, label: 'skyway start' },
  { x: -13.5, z: -40, speed: 9 },
  { x: -13.5, z: -34, speed: 9 },
  { x: -13.5, z: -27, speed: 8, label: 'skyway end' },
  { x: -13.5, z: -25, speed: 5 },
  { x: -13.5, z: -23.2, speed: 4, radius: 0.7, label: 'jump pad 2' },
  { x: -19.5, z: -16.5, radius: 2.5, speed: 6, label: 'island' },
  { x: -20, z: -12.5, speed: 6, label: 'drop ramp' },
  { x: -20, z: -6.5, speed: 8 },
  { x: -20, z: -5, speed: 6, label: 'final approach' },
  { x: -16, z: -5, speed: 7 },
  { x: -13.8, z: -4.8, speed: 5, label: 's-bend' },
  { x: -13.8, z: 0, speed: 6 },
  { x: -11, z: 0, speed: 6 },
  { x: -9.5, z: 3.5, speed: 8, label: 'goal plateau' },
  { x: -9.5, z: 10, speed: 9, radius: 1.2, label: 'GOAL' },
];

export class Autopilot {
  enabled = false;
  index = 0;
  done = false;
  failed: string | null = null;
  readonly log: string[] = [];
  private stuck = 0;
  private lastState = 'intro';
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly game: Game,
    private readonly input: Input,
    private readonly route: Waypoint[] = CIRCUIT_ROUTE,
  ) {}

  start(): void {
    this.enabled = true;
    this.index = 0;
    this.done = false;
    this.failed = null;
    this.stuck = 0;
    this.log.length = 0;
  }

  stop(): void {
    this.enabled = false;
    this.input.override = null;
  }

  status(): Record<string, unknown> {
    const p = this.game.ballPosition;
    return {
      index: this.index,
      total: this.route.length,
      label: this.route[Math.min(this.index, this.route.length - 1)]?.label ?? '',
      done: this.done,
      failed: this.failed,
      resets: this.game.resetCount,
      state: this.game.state,
      time: Number(this.game.elapsed.toFixed(1)),
      pos: [Number(p.x.toFixed(1)), Number(p.y.toFixed(1)), Number(p.z.toFixed(1))],
      log: this.log.slice(-6),
    };
  }

  update(dt: number): void {
    if (!this.enabled || this.done) {
      this.input.override = null;
      return;
    }
    const state = this.game.state;
    if (state === 'win') {
      this.done = true;
      this.log.push(`WIN at t=${this.game.elapsed.toFixed(1)} resets=${this.game.resetCount}`);
      this.input.override = null;
      return;
    }
    if (state !== 'play') {
      if (state === 'reset' && this.lastState === 'play') {
        const d = this.game.lastDeathInfo;
        if (d) this.log.push(`DEATH ${d.cause} at ${d.pos.x.toFixed(1)},${d.pos.y.toFixed(1)},${d.pos.z.toFixed(1)} (wp ${this.index} ${this.route[this.index]?.label ?? ''})`);
      }
      this.input.override = null;
      this.lastState = state;
      return;
    }
    if (this.lastState === 'reset') {
      // Respawned: continue from the waypoint closest to where we are.
      const p = this.game.ballPosition;
      let best = 0;
      let bestD = Infinity;
      this.route.forEach((w, i) => {
        const d = Math.hypot(w.x - p.x, w.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      this.index = best;
      this.log.push(`respawn -> wp ${best} (${this.route[best]?.label ?? ''})`);
      this.stuck = 0;
    }
    this.lastState = state;

    const wp = this.route[this.index];
    if (!wp) {
      this.input.override = null;
      return;
    }
    const p = this.game.ballPosition;
    const v = this.game.ballVelocity;
    if (Math.abs(v.y) > 3) {
      // Airborne (jump pad flight or falling): let the ballistic arc play out.
      this.input.override = { x: 0, y: 0 };
      this.stuck += dt;
      return;
    }
    const dx = wp.x - p.x;
    const dz = wp.z - p.z;
    const dist = Math.hypot(dx, dz);
    const radius = wp.radius ?? 1.0;

    let desiredX: number;
    let desiredZ: number;
    if (dist < radius) {
      if (wp.waitForY !== undefined && p.y < wp.waitForY) {
        // Hold still while the elevator carries us up.
        desiredX = 0;
        desiredZ = 0;
      } else {
        this.log.push(`wp ${this.index} ${wp.label ?? ''} t=${this.game.elapsed.toFixed(1)}`);
        this.index += 1;
        this.stuck = 0;
        if (this.index >= this.route.length) this.index = this.route.length - 1;
        return;
      }
    } else {
      const cruise = wp.speed ?? 11;
      const speed = Math.min(cruise, 2.5 + dist * 2.5);
      desiredX = (dx / dist) * speed;
      desiredZ = (dz / dist) * speed;
    }

    // Steer velocity toward the desired velocity.
    let ax = (desiredX - v.x) * 0.5;
    let az = (desiredZ - v.z) * 0.5;
    const mag = Math.hypot(ax, az);
    if (mag > 1) {
      ax /= mag;
      az /= mag;
    }
    const basis = this.game.groundBasis();
    this.tmp.set(ax, 0, az);
    this.input.override = { x: this.tmp.dot(basis.right), y: this.tmp.dot(basis.up) };

    this.stuck += dt;
    if (this.stuck > 25) {
      this.failed = `stuck at wp ${this.index} (${wp.label ?? ''}) pos=${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
      this.log.push(this.failed);
      this.done = true;
      this.input.override = null;
    }
  }
}
