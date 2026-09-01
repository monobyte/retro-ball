import { Soundtrack, createAudioGraph, type AudioGraph } from './Soundtrack';
import { Sfx } from './Sfx';
import type { GameAudio } from '../game/Game';
import type { DeathCause } from '../game/Dynamics';

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

  start(): void {
    if (this.graph) {
      void this.graph.ctx.resume();
      return;
    }
    try {
      this.graph = createAudioGraph();
      this.music = new Soundtrack(this.graph);
      this.sfx = new Sfx(this.graph);
      this.music.start();
      this.applyMute();
    } catch (err) {
      console.warn('Audio unavailable:', err);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMute();
    return this.muted;
  }

  private applyMute(): void {
    this.music?.setVolume(this.muted ? 0 : 0.9);
    this.sfx?.setVolume(this.muted ? 0 : 0.9);
  }

  beatEnergy(): number {
    if (this.music) return this.music.beatEnergy();
    // Before audio unlocks, fake a pulse at the soundtrack's tempo.
    const beats = (performance.now() / 1000) * (BPM_FALLBACK / 60);
    return Math.exp(-(beats % 1) * 4);
  }

  roll(speed: number, grounded: boolean): void {
    this.sfx?.roll(speed, grounded);
  }
  impact(strength: number): void {
    this.sfx?.impact(strength);
  }
  land(): void {
    this.sfx?.land();
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
