const THREE_clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/** Keyboard state. Movement is expressed in screen space (right = +x, up = +y). */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  /** Fired on the first user gesture (needed to unlock audio). */
  onAnyKey: (() => void) | null = null;
  /** When set (dev autopilot), replaces the keyboard axis. */
  override: { x: number; y: number } | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedThisFrame.add(e.code);
      if (this.onAnyKey && e.code !== 'Escape' && e.key !== 'Escape') this.onAnyKey();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
    target.addEventListener('pointerdown', () => {
      if (this.onAnyKey) this.onAnyKey();
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True only on the frame the key went down. Call `endFrame()` each frame. */
  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
  }

  /** Screen-space movement axis in [-1, 1]^2. */
  axis(): { x: number; y: number } {
    if (this.override) return { x: THREE_clamp(this.override.x), y: THREE_clamp(this.override.y) };
    let x = 0;
    let y = 0;
    if (this.isDown('ArrowLeft') || this.isDown('KeyA')) x -= 1;
    if (this.isDown('ArrowRight') || this.isDown('KeyD')) x += 1;
    if (this.isDown('ArrowUp') || this.isDown('KeyW')) y += 1;
    if (this.isDown('ArrowDown') || this.isDown('KeyS')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }
}
