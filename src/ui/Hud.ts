import type { DeathCause } from '../game/Dynamics';

const DEATH_CAPTIONS: Record<DeathCause, string> = {
  laser: 'LASER GRID CONTACT',
  void: 'DATA VOID BREACH',
  fall: 'SIGNAL LOST',
};

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Minimal digital HUD plus the intro / reset / win overlays. */
export class Hud {
  private readonly clockEl = document.getElementById('hud-clock')!;
  private readonly velEl = document.getElementById('hud-velocity')!;
  private readonly overlay = document.getElementById('overlay')!;
  private readonly flashEl = document.getElementById('flash')!;
  private readonly hudEl = document.getElementById('hud')!;
  private lastClock = '';
  private lastVel = '';

  setClock(seconds: number): void {
    const s = formatClock(seconds);
    if (s !== this.lastClock) {
      this.clockEl.textContent = s;
      this.lastClock = s;
    }
  }

  setVelocity(v: number): void {
    const s = v.toFixed(1);
    if (s !== this.lastVel) {
      this.velEl.textContent = s;
      this.lastVel = s;
    }
  }

  setHudVisible(v: boolean): void {
    this.hudEl.classList.toggle('hidden', !v);
  }

  showIntro(levelName: string): void {
    this.overlay.className = 'overlay intro';
    this.overlay.innerHTML = `
      <div class="intro-card">
        <div class="eyebrow">// MARBLE RUNTIME v2.6 — ISOMETRIC BUILD</div>
        <h1 class="title" data-text="${levelName}">${levelName}</h1>
        <div class="subtitle">A SYNTHWAVE MARBLE CIRCUIT</div>
        <div class="controls">
          <span><b>ARROWS / WASD</b> ROLL</span>
          <span><b>R</b> REBOOT AT CHECKPOINT</span>
          <span><b>M</b> MUTE</span>
        </div>
        <div class="prompt">PRESS ANY KEY TO BOOT</div>
      </div>`;
  }

  showDeath(cause: DeathCause): void {
    this.overlay.className = 'overlay death';
    this.overlay.innerHTML = `
      <div class="death-card">
        <div class="death-title">${DEATH_CAPTIONS[cause]}</div>
        <div class="death-sub">REBOOTING FROM LAST CHECKPOINT</div>
      </div>`;
  }

  showWin(seconds: number, resets: number): void {
    this.overlay.className = 'overlay win';
    this.overlay.innerHTML = `
      <div class="win-card">
        <div class="eyebrow">// TRANSMISSION COMPLETE</div>
        <h1 class="title" data-text="CIRCUIT CLEARED">CIRCUIT CLEARED</h1>
        <div class="win-stats">
          <div><span class="hud-label">SYSTEM CLOCK</span><span class="win-value">${formatClock(seconds)}</span></div>
          <div><span class="hud-label">REBOOTS</span><span class="win-value">${String(resets).padStart(2, '0')}</span></div>
        </div>
        <div class="prompt">PRESS R TO RE-RUN</div>
      </div>`;
  }

  showToast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1800);
  }

  clearOverlay(): void {
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = '';
  }

  /** Full-screen colour flash; opacity decays via CSS transition. */
  flash(color: string, strength = 1): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = String(strength);
    // Force reflow so the transition restarts.
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity 0.6s ease-out';
    this.flashEl.style.opacity = '0';
  }
}
