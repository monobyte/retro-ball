import type { AudioChannel } from './Soundtrack';
import type { DeathCause } from '../game/Dynamics';

/** Synthesised sound effects sharing the soundtrack's audio graph. */
export class Sfx {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly rollGain: GainNode;
  private readonly rollFilter: BiquadFilterNode;
  private readonly humOsc: OscillatorNode;
  private readonly humGain: GainNode;

  constructor(private readonly g: AudioChannel) {
    this.ctx = g.ctx;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(g.master);

    // Continuous rolling bed: filtered noise + a low hum, both speed-driven.
    const src = this.ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 200;
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.out);
    src.start();

    this.humOsc = this.ctx.createOscillator();
    this.humOsc.type = 'triangle';
    this.humOsc.frequency.value = 55;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0;
    this.humOsc.connect(this.humGain).connect(this.out);
    this.humOsc.start();
  }

  setVolume(v: number): void {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  roll(speed: number, grounded: boolean): void {
    const t = this.ctx.currentTime;
    const k = Math.min(1, speed / 22);
    const target = grounded ? 0.16 * k : 0;
    this.rollGain.gain.setTargetAtTime(target, t, 0.08);
    this.rollFilter.frequency.setTargetAtTime(180 + 1400 * k, t, 0.1);
    this.humGain.gain.setTargetAtTime(grounded ? 0.05 * k : 0.01 * k, t, 0.1);
    this.humOsc.frequency.setTargetAtTime(48 + 90 * k, t, 0.1);
  }

  impact(strength: number): void {
    const t = this.ctx.currentTime;
    const s = Math.max(0.1, Math.min(1, strength));
    const src = this.ctx.createBufferSource();
    src.buffer = this.g.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600 + 1800 * s;
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(0.5 * s, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.1 + 0.1 * s);
    src.connect(lp).connect(gn).connect(this.out);
    src.start(t);
    src.stop(t + 0.3);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.6 * s, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(og).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  land(): void {
    this.impact(0.5);
  }

  jump(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.28);
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gn).connect(this.out);
    gn.connect(this.g.reverb);
    osc.start(t);
    osc.stop(t + 0.45);
    const src = this.ctx.createBufferSource();
    src.buffer = this.g.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.3);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(bp).connect(ng).connect(this.out);
    src.start(t);
    src.stop(t + 0.4);
  }

  death(cause: DeathCause): void {
    const t = this.ctx.currentTime;
    if (cause === 'laser') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.45);
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 4);
      }
      shaper.curve = curve;
      const gn = this.ctx.createGain();
      gn.gain.setValueAtTime(0.45, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(shaper).connect(gn).connect(this.out);
      gn.connect(this.g.reverb);
      osc.start(t);
      osc.stop(t + 0.55);
      this.burstNoise(t, 0.45, 0.3, 3000);
    } else if (cause === 'void') {
      // Stepped, bit-crushed descent.
      for (let i = 0; i < 9; i++) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 660 * Math.pow(0.8, i);
        const gn = this.ctx.createGain();
        const t0 = t + i * 0.07;
        gn.gain.setValueAtTime(0.22, t0);
        gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.065);
        osc.connect(gn).connect(this.out);
        gn.connect(this.g.reverb);
        osc.start(t0);
        osc.stop(t0 + 0.07);
      }
      this.burstNoise(t, 0.25, 0.6, 900);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.8);
      const trem = this.ctx.createOscillator();
      trem.frequency.value = 18;
      const tremGain = this.ctx.createGain();
      tremGain.gain.value = 0.5;
      const gn = this.ctx.createGain();
      gn.gain.setValueAtTime(0.4, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      trem.connect(tremGain).connect(gn.gain);
      osc.connect(gn).connect(this.out);
      gn.connect(this.g.reverb);
      osc.start(t);
      trem.start(t);
      osc.stop(t + 0.9);
      trem.stop(t + 0.9);
    }
  }

  checkpoint(): void {
    const t = this.ctx.currentTime;
    for (const [i, hz] of [1318.5, 1760, 2637].entries()) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const gn = this.ctx.createGain();
      const t0 = t + i * 0.09;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.28, t0 + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      osc.connect(gn).connect(this.out);
      gn.connect(this.g.reverb);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    }
  }

  win(): void {
    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.5, 1760];
    notes.forEach((hz, i) => {
      const t0 = t + i * 0.11;
      for (const det of [-6, 6]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz;
        osc.detune.value = det;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3000;
        const gn = this.ctx.createGain();
        const sustain = i === notes.length - 1 ? 2.2 : 0.5;
        gn.gain.setValueAtTime(0.0001, t0);
        gn.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.001, t0 + sustain);
        osc.connect(lp).connect(gn).connect(this.out);
        gn.connect(this.g.reverb);
        osc.start(t0);
        osc.stop(t0 + sustain + 0.05);
      }
    });
  }

  private burstNoise(t: number, amp: number, dur: number, cutoff: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.g.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(amp, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(gn).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
