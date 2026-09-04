import { loadControls, PAD_BUTTONS, radialAxis, type Action, type ControlSettings, type PadSnapshot } from './Actions.ts';

/** Keyboard and standard gamepad input. Rolling is screen-relative and analogue. */
export class Input {
  private readonly listeners = new AbortController();
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly padDown = new Set<Action>();
  private readonly padPressed = new Set<Action>();
  private padAxis = { x: 0, y: 0 };
  private padIndex: number | null = null;
  private padIdentity: string | null = null;
  private padBrake = 0;
  private requireNeutral = false;
  private disposed = false;
  settings: ControlSettings = loadControls();
  onStartRequested: (() => void) | null = null;
  onControllerDisconnected: (() => void) | null = null;
  controllerName: string | null = null;
  override: { x: number; y: number; brake?: number } | null = null;

  private readonly getPads: () => readonly (PadSnapshot | null)[];

  constructor(target: Window = window, getPads: () => readonly (PadSnapshot | null)[] = () => navigator.getGamepads?.() ?? []) {
    this.getPads = getPads;
    target.addEventListener('keydown', (e) => {
      if (e.repeat || this.editing(e.target)) return;
      this.down.add(e.code); this.pressedThisFrame.add(e.code);
      if (e.code === 'Space' && this.onStartRequested) { this.onStartRequested(); e.preventDefault(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    }, { signal: this.listeners.signal });
    target.addEventListener('keyup', e => this.down.delete(e.code), { signal: this.listeners.signal });
    target.addEventListener('blur', () => this.clear(), { signal: this.listeners.signal });
  }

  private editing(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable || !!target.closest('[data-rebinding]'));
  }

  configure(settings: ControlSettings): void { this.settings = structuredClone(settings); this.clear(); }
  clear(): void {
    this.down.clear(); this.pressedThisFrame.clear(); this.override = null;
    this.padDown.clear(); this.padPressed.clear(); this.padAxis = { x: 0, y: 0 }; this.padBrake = 0; this.requireNeutral = true;
  }
  dispose(): void { this.disposed = true; this.listeners.abort(); this.clear(); this.onStartRequested = null; this.onControllerDisconnected = null; }
  isDown(code: string): boolean { return this.down.has(code); }
  wasPressed(code: string): boolean { return this.pressedThisFrame.has(code); }
  actionDown(action: Action): boolean { return this.padDown.has(action) || this.settings.bindings[action].some(code => this.down.has(code)); }
  actionPressed(action: Action): boolean { return this.padPressed.has(action) || this.settings.bindings[action].some(code => this.pressedThisFrame.has(code)); }
  endFrame(): void { this.pressedThisFrame.clear(); this.padPressed.clear(); }

  /** Poll once per app frame, including menus and paused frames. */
  poll(): void {
    if (this.disposed) return;
    let pads: readonly (PadSnapshot | null)[];
    try { pads = this.getPads(); } catch { pads = []; }
    const previous = this.padIndex;
    const available = pads.filter((pad): pad is PadSnapshot => !!pad?.connected && pad.mapping === 'standard');
    const pad = available.find(pad => pad.index === previous) ?? available[0];
    if (previous !== null && (!pad || pad.index !== previous || pad.id !== this.padIdentity)) {
      this.padIndex = null; this.padIdentity = null; this.controllerName = null; this.clear(); this.onControllerDisconnected?.();
    }
    if (!pad) return;
    if (this.padIndex !== pad.index) { this.padIndex = pad.index; this.padIdentity = pad.id; this.controllerName = pad.id; this.requireNeutral = true; }
    const axis = radialAxis(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0), this.settings.deadZone, this.settings.sensitivity);
    const pressed = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > .5;
    if (this.requireNeutral) {
      if (Math.hypot(axis.x, axis.y) > 0 || pad.buttons.some((_, i) => pressed(i))) return;
      this.requireNeutral = false;
    }
    this.padAxis = { x: axis.x, y: axis.y };
    if (pressed(14) || pressed(15)) this.padAxis.x = Number(pressed(15)) - Number(pressed(14));
    if (pressed(12) || pressed(13)) this.padAxis.y = Number(pressed(12)) - Number(pressed(13));
    const trigger = pad.buttons[6]?.value ?? 0;
    this.padBrake = pressed(4) ? 1 : Number.isFinite(trigger) ? Math.max(0, Math.min(1, trigger)) : 0;
    const length = Math.hypot(this.padAxis.x, this.padAxis.y);
    if (length > 1) { this.padAxis.x /= length; this.padAxis.y /= length; }
    for (const [key, indices] of Object.entries(PAD_BUTTONS)) {
      const action = key as Action;
      const active = indices.some(pressed) || (action === 'menuUp' && axis.y > .6) || (action === 'menuDown' && axis.y < -.6);
      if (active && !this.padDown.has(action)) this.padPressed.add(action);
      if (active) this.padDown.add(action); else this.padDown.delete(action);
    }
  }

  brake(): number { return this.override?.brake ?? Math.max(this.padBrake, Number(this.settings.bindings.brake.some(code => this.down.has(code)))); }
  axis(): { x: number; y: number } {
    if (this.override) return { x: Math.max(-1, Math.min(1, this.override.x)), y: Math.max(-1, Math.min(1, this.override.y)) };
    const x = Number(this.actionDown('right')) - Number(this.actionDown('left'));
    const y = Number(this.actionDown('up')) - Number(this.actionDown('down'));
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / Math.max(1, length), y: y / Math.max(1, length) } : { ...this.padAxis };
  }
}
