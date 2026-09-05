import * as THREE from 'three';
import type { SwitchPiece } from '../LevelData';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import { disposeObjects } from '../../runtime/disposeObjects';

/** An explicit interact action toggles or temporarily powers a named circuit. */
export class SignalSwitch implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  private active = false;
  private remaining = 0;
  private readonly arm: THREE.Mesh;
  private readonly lamp = new THREE.MeshBasicMaterial({ color: 0xffcc63 });
  private disposed = false;

  constructor(readonly def: SwitchPiece, instance: LevelInstance) {
    this.id = instance.id; this.resetGroup = instance.resetGroup;
    this.group.position.set(def.x, def.y, def.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.65, .8, .2, 6), new THREE.MeshBasicMaterial({ color: 0x33224f }));
    base.position.y = .1; this.group.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.85, .06, 8, 40), this.lamp);
    ring.rotation.x = -Math.PI/2; ring.position.y = .08; this.group.add(ring);
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(.16, .8, .16), this.lamp);
    this.arm.position.y = .55; this.group.add(this.arm);
    this.reset(null);
  }
  interact(): void {
    this.active = this.def.mode === 'timed' || !this.active;
    this.remaining = this.active && this.def.mode === 'timed' ? this.def.duration : 0;
  }
  fixedUpdate(_time: number, dt: number): void {
    if (this.active && this.def.mode === 'timed') {
      this.remaining = Math.max(0, this.remaining-dt);
      if (this.remaining === 0) this.active = false;
    }
  }
  visualUpdate(_frame: VisualFrame): void {
    this.lamp.color.setHex(this.active ? 0x75ffe0 : 0xffcc63);
    this.arm.rotation.z = this.active ? -.55 : .55;
    this.arm.scale.y = this.active && this.def.mode === 'timed' ? .3+.7*this.remaining/this.def.duration : 1;
  }
  stateOutputs(): { active: boolean } { return { active: this.active }; }
  receiveSignal(port: SignalPort, _value: SignalValue): void { if (port === 'reset') this.reset(null); }
  capture(): LogicalValue { return { active: this.active, remaining: this.remaining }; }
  reset(state: LogicalValue): void {
    const s = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    this.active = typeof s['active'] === 'boolean' ? s['active'] : this.def.initial === 'on';
    this.remaining = typeof s['remaining'] === 'number' && Number.isFinite(s['remaining']) ? THREE.MathUtils.clamp(s['remaining'],0,this.def.duration) : this.active ? this.def.duration : 0;
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; disposeObjects(this.group); }
}
