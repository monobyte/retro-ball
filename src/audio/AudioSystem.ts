import { Soundtrack, createAudioGraph, type AudioGraph } from './Soundtrack';
import { Sfx } from './Sfx';
import type { GameAudio } from '../game/Game';
import type { DeathCause } from '../game/Dynamics';
import type { SurfaceId } from '../physics/Surfaces';
import type { QualitySettings } from '../settings/Settings';

const BPM_FALLBACK = 112;

/**
 * Glue between the game and the audio layer. The AudioContext is created
 * lazily on the first user gesture (browser autoplay policy).
 */
export class AudioSystem implements GameAudio {
  private graph: AudioGraph | null = null;
  private music: Soundtrack | null = null;
  private sfx: Sfx | null = null;
  private muted = false;
  private musicEnabled = true;
  private soundFxEnabled = true;

  applySettings(settings: Pick<QualitySettings, 'musicEnabled' | 'soundFxEnabled'>): void {
    this.musicEnabled = settings.musicEnabled;
    this.soundFxEnabled = settings.soundFxEnabled;
    this.applyMute();
  }

  start(): void {
    if (this.graph) {
      void this.graph.ctx.resume();
      return;
    }
    try {
      this.graph = createAudioGraph();
      this.music = new Soundtrack(this.graph.music);
      this.sfx = new Sfx(this.graph.sfx);
      this.applyMute(true);
      this.music.start();
    } catch (err) {
      console.warn('Audio unavailable:', err);
    }
  }

  async suspend(): Promise<void> { if (this.graph?.ctx.state === 'running') await this.graph.ctx.suspend(); }
  async resume(): Promise<void> { if (this.graph?.ctx.state === 'suspended') await this.graph.ctx.resume(); }

  async dispose(): Promise<void> {
    this.music?.stop();
    const graph = this.graph;
    this.graph = null; this.music = null; this.sfx = null;
    if (graph && graph.ctx.state !== 'closed') await graph.ctx.close();
  }

  get isMuted(): boolean { return this.muted; }
  setMuted(muted: boolean): void { this.muted = muted; this.applyMute(); }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMute();
    return this.muted;
  }

  private applyMute(immediate = false): void {
    if (!this.graph) return;
    const { ctx, master, music, sfx } = this.graph;
    // Gates sit after dry and wet paths; source volume preferences stay intact.
    for (const [gain, value] of [
      [master.gain, this.muted ? 0 : 0.8],
      [music.master.gain, this.musicEnabled ? 1 : 0],
      [sfx.master.gain, this.soundFxEnabled ? 1 : 0],
    ] as const) {
      gain.cancelScheduledValues(ctx.currentTime);
      if (immediate) gain.setValueAtTime(value, ctx.currentTime);
      else gain.setTargetAtTime(value, ctx.currentTime, 0.01);
    }
  }

  beatEnergy(): number {
    if (this.music) return this.music.beatEnergy();
    // Before audio unlocks, fake a pulse at the soundtrack's tempo.
    const beats = (performance.now() / 1000) * (BPM_FALLBACK / 60);
    return Math.exp(-(beats % 1) * 4);
  }

  roll(speed: number, grounded: boolean, surface: SurfaceId = 'standard', braking = 0, sliding = 0): void {
    this.sfx?.roll(speed, grounded, surface, braking, sliding);
  }
  impact(strength: number): void {
    this.sfx?.impact(strength);
  }
  land(strength = .5): void {
    this.sfx?.land(strength);
  }
  jump(): void {
    this.sfx?.jump();
  }
  death(cause: DeathCause): void {
    this.sfx?.death(cause);
  }
  checkpoint(): void {
    this.sfx?.checkpoint();
  }
  win(): void {
    this.sfx?.win();
  }
}
