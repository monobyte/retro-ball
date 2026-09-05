export type FloorPhase = 'solid' | 'warning' | 'absent' | 'returning';
export interface FloorState { phase: FloorPhase; elapsed: number }
/** A floor always telegraphs withdrawal and waits for a clear volume to re-solidify. */
export class FloorCycle {
  state: FloorState = { phase: 'solid', elapsed: 0 };
  readonly warning: number;
  readonly recovery: number;
  constructor(warning: number, recovery: number) { this.warning = warning; this.recovery = recovery; }
  touch(): void { if (this.state.phase === 'solid') this.state = { phase: 'warning', elapsed: 0 }; }
  tick(dt: number, clear: boolean): void {
    const s = this.state;
    if (s.phase === 'solid') return;
    s.elapsed += dt;
    if (s.phase === 'warning' && s.elapsed + 1e-9 >= this.warning) this.state = { phase: 'absent', elapsed: 0 };
    else if (s.phase === 'absent' && s.elapsed + 1e-9 >= this.recovery) this.state = { phase: 'returning', elapsed: 0 };
    else if (s.phase === 'returning' && s.elapsed + 1e-9 >= .6 && clear) this.state = { phase: 'solid', elapsed: 0 };
  }
  reset(state?: FloorState): void { this.state = state ? { ...state } : { phase: 'solid', elapsed: 0 }; }
}
