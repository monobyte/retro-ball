import * as THREE from 'three';
import type { Physics, BallHandles } from '../physics/Physics';
import { TUNING } from '../physics/Physics';
import type { Renderer } from '../render/Renderer';
import type { Input } from '../input/Input';
import type { Hud } from '../ui/Hud';
import { LevelGeometry } from './Level';
import { LevelDynamics, type DeathCause } from './Dynamics';
import { Marble, MARBLE_COLOR, buildNeonEnvironment } from './Marble';
import { Burst } from './Burst';
import { disposeObjects } from '../runtime/disposeObjects';
import type { LevelDocument } from '../content/LevelDocument';
import type { CheckpointSnapshot } from '../runtime/Component';
import type { LevelDefinition } from './LevelData';

export type GameState = 'intro' | 'play' | 'reset' | 'win';

/** Values the post-processing stack reads each frame. */
export interface FxState {
  /** 0..1 glitch intensity (VCR pass). */
  glitch: number;
  /** Extra bloom strength. */
  bloomBoost: number;
  /** Current beat energy 0..1. */
  beat: number;
}

/** What the game needs from the audio layer; wired in main.ts. */
export interface GameAudio {
  start(): void;
  beatEnergy(): number;
  roll(speed: number, grounded: boolean): void;
  impact(strength: number): void;
  jump(): void;
  death(cause: DeathCause): void;
  checkpoint(): void;
  win(): void;
  land(): void;
  toggleMute(): boolean;
}

const PLAY_VIEW_HEIGHT = 23;
const INTRO_VIEW_HEIGHT = 74;

export class Game {
  state: GameState = 'intro';
  readonly root = new THREE.Group();
  private readonly listeners = new AbortController();
  private readonly environment: THREE.WebGLRenderTarget;
  private disposed = false;
  private checkpointSnapshot: CheckpointSnapshot;
  readonly fx: FxState = { glitch: 0, bloomBoost: 0, beat: 0 };
  readonly level: LevelGeometry;
  readonly dynamics: LevelDynamics;
  readonly marble: Marble;
  private readonly ball: BallHandles;
  private readonly burst = new Burst();
  private spawn: THREE.Vector3;
  private runTime = 0;
  private resets = 0;
  private stateTime = 0;
  private time = 0;
  private lastDeath: DeathCause = 'fall';
  private readonly ballPos = new THREE.Vector3();
  private readonly ballVel = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private readonly groundN = new THREE.Vector3();
  private grounded = false;
  private wasGrounded = false;
  private impactCooldown = 0;
  private readonly camTarget = new THREE.Vector3();
  private viewHeight = INTRO_VIEW_HEIGHT;
  private readonly levelCenter = new THREE.Vector3();
  private readonly lowestY: number;
  private readonly winOrigin = new THREE.Vector3();
  /** Where the camera looks while the reset animation plays. */
  private readonly resetFocus = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  audio: GameAudio | null = null;
  /** Dev flag: ignore laser and void deaths (falls still count). */
  godMode = false;
  /** Dev diagnostics: where and why the marble last died. */
  lastDeathInfo: { cause: DeathCause; pos: THREE.Vector3 } | null = null;

  /** Seconds since the game object was created. */
  get elapsed(): number {
    return this.time;
  }

  get ballPosition(): THREE.Vector3 {
    return this.ballPos.clone();
  }

  get ballVelocity(): THREE.Vector3 {
    return this.ballVel.clone();
  }

  get resetCount(): number {
    return this.resets;
  }

  groundBasis(): { up: THREE.Vector3; right: THREE.Vector3 } {
    return this.renderer.groundBasis();
  }

  constructor(
    private readonly def: LevelDefinition,
    private readonly renderer: Renderer,
    private readonly physics: Physics,
    private readonly input: Input,
    private readonly hud: Hud,
    readonly document: LevelDocument,
  ) {
    renderer.scene.add(this.root);
    this.level = new LevelGeometry(def);
    this.root.add(this.level.group);
    for (const box of this.level.boxes) physics.addStaticBox(box);

    this.dynamics = new LevelDynamics(def, physics, this.level.labels, TUNING.gravity, TUNING.linearDamping, document);
    this.root.add(this.dynamics.group);

    this.environment = buildNeonEnvironment(renderer.renderer);
    this.marble = new Marble(TUNING.radius, this.environment.texture);
    this.root.add(this.marble.group);
    for (const o of this.marble.sceneExtras) this.root.add(o);
    this.root.add(this.burst.points);

    this.root.add(new THREE.HemisphereLight(0x6a3cff, 0x120428, 0.9));
    const key = new THREE.DirectionalLight(0x38f5ff, 1.2);
    key.position.set(-6, 10, 4);
    this.root.add(key);

    this.spawn = new THREE.Vector3(def.start.x, def.start.y, def.start.z);
    this.ball = physics.createBall(this.spawn);
    this.checkpointSnapshot = this.captureCheckpoint(null);
    this.level.bounds.getCenter(this.levelCenter);
    this.lowestY = this.level.bounds.min.y;

    this.camTarget.copy(this.levelCenter);
    this.renderer.viewHeight = this.viewHeight;
    this.renderer.updateFrustum();
    this.renderer.lookAt(this.camTarget);
    this.onResize();
    window.addEventListener('resize', () => this.onResize(), { signal: this.listeners.signal });

    this.marble.resetTrail(this.spawn);
    this.hud.showIntro(def.name);
    this.hud.setHudVisible(false);
    this.input.onStartRequested = () => this.boot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.input.onStartRequested = null;
    this.audio = null;
    this.dynamics.dispose();
    disposeObjects(this.root);
    this.environment.dispose();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.level.setResolution(w, h);
    this.dynamics.setResolution(w, h);
  }

  /** Leaves the intro: unlocks audio and starts the run. */
  private boot(): void {
    if (this.state !== 'intro') return;
    this.input.onStartRequested = null;
    this.audio?.start();
    this.hud.clearOverlay();
    this.hud.setHudVisible(true);
    this.setState('play');
    this.runTime = 0;
    this.resets = 0;
    this.fx.glitch = 0.8;
  }

  private setState(s: GameState): void {
    this.state = s;
    this.stateTime = 0;
  }

  /* ---------------------------------------------------------------- loop */

  update(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    this.stateTime += dt;
    const beat = this.audio ? this.audio.beatEnergy() : Math.max(0, 1 - ((this.time * 112) / 60 % 1) * 1.8);
    this.fx.beat = beat;
    this.fx.glitch = Math.max(0, this.fx.glitch - dt * 1.6);
    this.fx.bloomBoost = Math.max(0, this.fx.bloomBoost - dt * 1.2);

    if (this.input.wasPressed('KeyM') && this.audio) {
      this.hud.showToast(this.audio.toggleMute() ? 'AUDIO MUTED' : 'AUDIO ONLINE');
    }
    if (this.input.wasPressed('KeyR')) {
      if (this.state === 'play') this.die('fall', true);
      else if (this.state === 'win') this.restart();
    }

    switch (this.state) {
      case 'intro':
        this.updateIntro(dt);
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'reset':
        this.updateReset(dt);
        break;
      case 'win':
        this.updateWin(dt);
        break;
    }

    this.syncMarble();
    const speed = this.ballVel.length();
    this.marble.update(this.time, beat, this.state === 'play' ? speed : 0, TUNING.maxSpeed);
    const glowPos = this.marble.group.visible ? this.marble.group.position : this.resetFocus;
    this.level.setFrame(this.time, beat, glowPos);
    this.dynamics.update(this.physics.simulationTime, dt, beat, glowPos, this.time);
    this.burst.update(dt, TUNING.gravity);
    this.updateCamera(dt, speed);

    this.hud.setClock(this.runTime);
    this.hud.setVelocity(this.state === 'play' ? speed : 0);
    this.input.endFrame();
  }

  private updateIntro(dt: number): void {
    // Slow pan around the whole circuit while we wait for the player.
    const t = this.time * 0.12;
    this.tmp.set(Math.cos(t) * 10, 0, Math.sin(t) * 10).add(this.levelCenter);
    this.camTarget.lerp(this.tmp, 1 - Math.exp(-dt * 1.5));
    this.physics.update(dt, (stepDt) => {
      void stepDt;
      this.dynamics.stepKinematics(this.physics.simulationTime);
    });
  }

  private updatePlay(dt: number): void {
    this.runTime += dt;
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const axis = this.input.axis();
    const basis = this.renderer.groundBasis();

    this.physics.update(dt, (stepDt) => {
      this.dynamics.stepKinematics(this.physics.simulationTime);
      this.readBall();
      this.prevVel.copy(this.ballVel);
      this.grounded = this.physics.groundNormal(this.ball, this.groundN) !== null;
      this.applyControls(axis, basis, stepDt);
    });

    this.readBall();
    this.detectImpacts();
    this.audio?.roll(this.ballVel.length(), this.grounded);

    if (this.ballPos.y < this.lowestY - 10) {
      this.die('fall');
      return;
    }

    for (const ev of this.dynamics.checkTriggers(this.ballPos, TUNING.radius, this.physics.simulationTime)) {
      switch (ev.type) {
        case 'death':
          if (this.godMode) break;
          this.die(ev.cause);
          return;
        case 'jump':
          this.ball.body.setLinvel({ x: ev.velocity.x, y: ev.velocity.y, z: ev.velocity.z }, true);
          this.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          this.audio?.jump();
          this.fx.bloomBoost = 0.6;
          break;
        case 'checkpoint': {
          const instance = this.document.instances.find(i => i.type === 'checkpoint' && i.parameters.id === ev.id);
          const policy = this.document.checkpoints.find(c => c.instanceId === instance?.id);
          this.spawn.copy(ev.position);
          if (policy) this.spawn.set(policy.spawn.x, policy.spawn.y, policy.spawn.z);
          this.checkpointSnapshot = this.captureCheckpoint(policy?.id ?? null);
          this.hud.showToast('CHECKPOINT LOGGED');
          this.hud.flash('rgba(56,245,255,0.35)', 0.6);
          this.audio?.checkpoint();
          break;
        }
        case 'goal':
          this.win(ev.position);
          return;
      }
    }
  }

  private applyControls(axis: { x: number; y: number }, basis: { up: THREE.Vector3; right: THREE.Vector3 }, stepDt: number): void {
    if (axis.x === 0 && axis.y === 0) return;
    const dir = this.tmp.set(0, 0, 0).addScaledVector(basis.right, axis.x).addScaledVector(basis.up, axis.y);
    if (this.grounded) {
      // Project the push onto the surface so ramps feel natural.
      const n = this.groundN;
      dir.addScaledVector(n, -dir.dot(n));
    }
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    const accel = this.grounded ? TUNING.groundAccel : TUNING.airAccel;

    // Soft speed cap: only resist the component that would exceed max speed.
    const horizSpeed = Math.hypot(this.ballVel.x, this.ballVel.z);
    let scale = 1;
    if (horizSpeed > TUNING.maxSpeed) {
      const along = (this.ballVel.x * dir.x + this.ballVel.z * dir.z) / horizSpeed;
      if (along > 0) scale = Math.max(0, 1 - along);
    }
    const mass = this.ball.body.mass();
    const k = accel * mass * stepDt * scale;
    this.ball.body.applyImpulse({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, true);
    // Torque makes the marble visibly spin up, part of the "heavy" feel.
    const torqueAxis = new THREE.Vector3(0, 1, 0).cross(dir);
    const tq = k * TUNING.radius * 0.6;
    this.ball.body.applyTorqueImpulse({ x: torqueAxis.x * tq, y: 0, z: torqueAxis.z * tq }, true);
  }

  private detectImpacts(): void {
    const dv = this.tmp.copy(this.ballVel).sub(this.prevVel);
    dv.y -= TUNING.gravity * TUNING.timestep; // ignore the gravity step
    const mag = dv.length();
    if (mag > 5 && this.impactCooldown <= 0) {
      this.impactCooldown = 0.12;
      this.audio?.impact(Math.min(1, mag / 20));
      this.fx.bloomBoost = Math.max(this.fx.bloomBoost, Math.min(0.5, mag / 40));
    }
    if (this.grounded && !this.wasGrounded && this.prevVel.y < -8) {
      this.audio?.land();
    }
    this.wasGrounded = this.grounded;
  }

  private readBall(): void {
    const p = this.ball.body.translation();
    const v = this.ball.body.linvel();
    this.ballPos.set(p.x, p.y, p.z);
    this.ballVel.set(v.x, v.y, v.z);
  }

  private syncMarble(): void {
    this.readBall();
    const r = this.ball.body.rotation();
    this.marble.setPose(this.ballPos, new THREE.Quaternion(r.x, r.y, r.z, r.w));
    if (this.state === 'win') {
      // Spiral the marble up the goal beam.
      const t = this.stateTime;
      const rise = Math.min(1, t / 2.4);
      const eased = rise * rise;
      const ang = t * 6;
      const rad = 0.9 * (1 - eased);
      this.marble.group.position.set(
        this.winOrigin.x + Math.cos(ang) * rad,
        this.winOrigin.y + 0.6 + eased * 16,
        this.winOrigin.z + Math.sin(ang) * rad,
      );
      this.marble.scale = Math.max(0, 1 - eased);
    }
  }

  private updateCamera(dt: number, speed: number): void {
    const inPlay = this.state === 'play' || this.state === 'reset' || this.state === 'win';
    if (inPlay) {
      // Look ahead along the velocity so fast sections read on screen.
      const lead = this.tmp.copy(this.ballVel).multiplyScalar(0.28);
      lead.y = 0;
      const desired = this.state === 'win' ? this.winOrigin : this.state === 'reset' ? this.resetFocus : this.ballPos;
      const goal = desired.clone().add(this.state === 'play' ? lead : new THREE.Vector3());
      const k = 1 - Math.exp(-dt * (this.state === 'reset' ? 2.5 : 6));
      this.camTarget.lerp(goal, k);
      const targetView = this.state === 'win' ? PLAY_VIEW_HEIGHT + 6 : PLAY_VIEW_HEIGHT + Math.min(5, speed * 0.2);
      this.viewHeight += (targetView - this.viewHeight) * (1 - Math.exp(-dt * 2.2));
    } else {
      this.viewHeight += (INTRO_VIEW_HEIGHT - this.viewHeight) * (1 - Math.exp(-dt * 1.5));
    }
    if (Math.abs(this.viewHeight - this.renderer.viewHeight) > 1e-3) {
      this.renderer.viewHeight = this.viewHeight;
      this.renderer.updateFrustum();
      this.burst.setPixelScale(window.innerHeight / this.viewHeight);
    }
    this.renderer.lookAt(this.camTarget);
  }

  /* -------------------------------------------------------- transitions */

  private die(cause: DeathCause, manual = false): void {
    if (this.state !== 'play') return;
    this.lastDeath = cause;
    this.resets += 1;
    this.setState('reset');
    this.resetFocus.copy(this.ballPos);
    this.lastDeathInfo = { cause, pos: this.ballPos.clone() };
    this.burst.emit(this.ballPos, [MARBLE_COLOR, new THREE.Color(0.3, 1, 1), new THREE.Color(1, 0.15, 0.35)], 11, 0.6);
    this.marble.scale = 0;
    this.fx.glitch = manual ? 0.6 : 1.0;
    this.hud.flash(cause === 'laser' ? 'rgba(255,31,79,0.55)' : 'rgba(122,60,255,0.45)', 0.9);
    this.hud.showDeath(cause);
    this.audio?.death(cause);
    // Park the body while the animation plays.
    this.physics.resetBall(this.ball, this.tmp.set(this.spawn.x, this.spawn.y + 200, this.spawn.z));
    this.ball.body.setGravityScale(0, true);
  }

  private updateReset(dt: number): void {
    this.runTime += dt;
    const t = this.stateTime;
    if (t > 0.75 && this.marble.scale === 0) {
      this.restoreCheckpointGroups();
      this.input.clear();
      this.prevVel.set(0, 0, 0); this.wasGrounded = false; this.impactCooldown = 0;
      this.physics.resetBall(this.ball, this.spawn);
      this.ball.body.setGravityScale(1, true);
      this.marble.resetTrail(this.spawn);
      this.resetFocus.copy(this.spawn);
      this.marble.scale = 0.001;
      this.fx.glitch = Math.max(this.fx.glitch, 0.35);
    }
    if (this.marble.scale > 0) {
      this.marble.scale = Math.min(1, this.marble.scale + dt * 3.5);
    }
    this.physics.update(dt, () => this.dynamics.stepKinematics(this.physics.simulationTime));
    if (t > 1.15) {
      this.hud.clearOverlay();
      this.setState('play');
    }
    void this.lastDeath;
  }

  private win(at: THREE.Vector3): void {
    this.setState('win');
    this.winOrigin.copy(at);
    this.ball.body.setGravityScale(0, true);
    this.ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.burst.emit(this.ballPos, [new THREE.Color(0.3, 1, 1), MARBLE_COLOR, new THREE.Color(1, 1, 1)], 8, 1.2);
    this.fx.bloomBoost = 1.2;
    this.fx.glitch = 0.5;
    this.hud.flash('rgba(255,255,255,0.7)', 1);
    this.audio?.win();
  }

  private updateWin(dt: number): void {
    this.physics.update(dt, () => this.dynamics.stepKinematics(this.physics.simulationTime));
    if (this.stateTime > 0.5 && this.stateTime - dt <= 0.5) {
      this.burst.emit(this.winOrigin.clone().setY(this.winOrigin.y + 2), [new THREE.Color(0.3, 1, 1), MARBLE_COLOR], 10, 0.8);
    }
    if (this.stateTime > 1.4 && this.stateTime - dt <= 1.4) {
      this.hud.showWin(this.runTime, this.resets);
    }
  }

  captureCheckpoint(checkpointId: string | null): CheckpointSnapshot {
    const snapshot: CheckpointSnapshot = {
      schemaVersion: 1, levelId: this.document.id, contentVersion: this.document.contentVersion,
      checkpointId, spawn: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z }, groups: {},
    };
    for (const group of this.document.resetGroups) snapshot.groups[group.id] = { components: {}, actors: {}, puzzles: {}, objectives: {} };
    for (const component of this.dynamics.components) snapshot.groups[component.resetGroup]!.components[component.id] = component.capture();
    return structuredClone(snapshot);
  }

  private restoreCheckpointGroups(): void {
    const checkpoint = this.document.checkpoints.find(c => c.id === this.checkpointSnapshot.checkpointId);
    const resetGroups = new Set(checkpoint?.resetGroups ?? this.document.resetGroups.filter(g => g.policy !== 'course').map(g => g.id));
    for (const component of this.dynamics.components) {
      if (resetGroups.has(component.resetGroup)) component.reset(this.checkpointSnapshot.groups[component.resetGroup]?.components[component.id] ?? null);
      // Cooldowns and transient triggers clear even for persistent course groups.
      else if (component.capture() === null) component.reset(null);
    }
  }

  restart(): void {
    this.spawn.set(this.def.start.x, this.def.start.y, this.def.start.z);
    this.dynamics.resetCheckpoints();
    for (const component of this.dynamics.components) component.reset(null);
    this.checkpointSnapshot = this.captureCheckpoint(null);
    this.input.clear(); this.prevVel.set(0, 0, 0); this.wasGrounded = false; this.impactCooldown = 0;
    this.physics.resetBall(this.ball, this.spawn);
    this.ball.body.setGravityScale(1, true);
    this.marble.resetTrail(this.spawn);
    this.marble.scale = 1;
    this.runTime = 0;
    this.resets = 0;
    this.hud.clearOverlay();
    this.hud.setHudVisible(true);
    this.fx.glitch = 0.8;
    this.setState('play');
  }
}
