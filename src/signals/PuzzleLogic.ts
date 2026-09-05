import type { SignalPort, SignalValue } from './SignalTypes.ts';

/** A three-step latch. A wrong input clears progress; step 1 starts a new try. */
export class OrderedSequence {
  progress = 0;
  remaining = 0;
  private completed = false;
  readonly timeout: number;
  constructor(timeout: number) { this.timeout = timeout; }
  get active(): boolean { return this.progress === 3; }
  receive(port: SignalPort, value: SignalValue): void {
    if (value !== null) return;
    if (port === 'reset') { this.reset(); return; }
    if (this.active) return;
    const step = ['step1', 'step2', 'step3'].indexOf(port) + 1;
    if (!step) return;
    this.progress = step === this.progress + 1 ? step : step === 1 ? 1 : 0;
    this.remaining = this.progress > 0 && this.progress < 3 ? this.timeout : 0;
    this.completed = this.active;
  }
  update(dt: number): void {
    if (this.progress === 0 || this.active) return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining <= 1e-9) this.reset();
  }
  takeCompleted(): boolean { const pulse = this.completed; this.completed = false; return pulse; }
  capture(): { progress: number; remaining: number } { return { progress: this.progress, remaining: this.remaining }; }
  reset(state?: { progress?: unknown; remaining?: unknown }): void {
    const p = state?.progress, r = state?.remaining;
    this.progress = typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 3 ? p : 0;
    this.remaining = this.progress > 0 && this.progress < 3 && typeof r === 'number' && Number.isFinite(r) ? Math.max(0, Math.min(this.timeout, r)) : 0;
    if (this.progress < 3 && this.remaining === 0) this.progress = 0;
    this.completed = false;
  }
}

export const combineInputs = (operation: 'and' | 'or', a: boolean, b: boolean): boolean => operation === 'and' ? a && b : a || b;

/** Rising contact edge drives toggle/timed actions; continuous weight cannot retrigger. */
export class PressureAction {
  active = false;
  held = false;
  remaining = 0;
  private activated = false;
  private releaseTime = 0;
  readonly mode: 'hold' | 'toggle' | 'timed';
  readonly duration: number;
  constructor(mode: 'hold' | 'toggle' | 'timed', duration: number) { this.mode = mode; this.duration = duration; }
  update(held: boolean, dt: number): void {
    // Ignore single-step contact chatter at a plate edge or during settling.
    this.releaseTime = held ? 0 : Math.min(.08, this.releaseTime + dt);
    held = held || (this.held && this.releaseTime < .08);
    this.remaining = Math.max(0, this.remaining - dt);
    if (held && !this.held) {
      this.activated = true;
      if (this.mode === 'toggle') this.active = !this.active;
      if (this.mode === 'timed') this.remaining = this.duration;
    }
    this.held = held;
    if (this.mode === 'hold') this.active = held;
    if (this.mode === 'timed') this.active = this.remaining > 1e-9;
  }
  takeActivated(): boolean { const pulse = this.activated; this.activated = false; return pulse; }
  capture(): { active: boolean; held: boolean; remaining: number; releaseTime: number } { return { active: this.active, held: this.held, remaining: this.remaining, releaseTime: this.releaseTime }; }
  reset(state?: { active?: unknown; held?: unknown; remaining?: unknown; releaseTime?: unknown }): void {
    this.active = state?.active === true; this.held = state?.held === true;
    const r = state?.remaining;
    this.remaining = typeof r === 'number' && Number.isFinite(r) ? Math.max(0, Math.min(this.duration, r)) : 0;
    this.releaseTime = typeof state?.releaseTime === 'number' && Number.isFinite(state.releaseTime) ? Math.max(0, state.releaseTime) : 0;
    this.activated = false;
  }
}
