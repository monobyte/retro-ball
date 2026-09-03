/**
 * Procedural synthwave soundtrack rendered live with the Web Audio API.
 *
 * "Retro Ball (Main Theme)" is an original composition written for
 * this game and released into the public domain (CC0). Because every note is
 * scheduled by this sequencer we know the exact time of every kick drum, so
 * the visuals pulse in perfect sync instead of relying on FFT beat detection.
 *
 * Structure: 112 BPM, A minor, 8-bar loop:  Am F C G | Am F Dm E
 * Layers:    four-on-the-floor kick, clap, hats, side-chained octave bass,
 *            plucked 16th-note arpeggio with dotted-eighth delay, detuned
 *            saw pads, and a lead phrase over the second half of the loop.
 */

const BPM = 112;
const STEPS_PER_BAR = 16;
const SECONDS_PER_BEAT = 60 / BPM;
const SECONDS_PER_STEP = SECONDS_PER_BEAT / 4;
const LOOKAHEAD_S = 0.14;
const TICK_MS = 25;

type ChordQuality = 'min' | 'maj';
interface Chord {
  root: number; // MIDI note of the bass root
  quality: ChordQuality;
}

const PROGRESSION: Chord[] = [
  { root: 45, quality: 'min' }, // Am
  { root: 41, quality: 'maj' }, // F
  { root: 48, quality: 'maj' }, // C
  { root: 43, quality: 'maj' }, // G
  { root: 45, quality: 'min' }, // Am
  { root: 41, quality: 'maj' }, // F
  { root: 50, quality: 'min' }, // Dm
  { root: 40, quality: 'maj' }, // E
];

const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 4, 3, 2, 4, 5, 4];

/** Lead phrase (MIDI or 0 for rest) for bars 4..7 of the loop, 16 steps each. */
const LEAD_PHRASE: number[][] = [
  [69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 0, 0, 69, 0, 0, 0],
  [65, 0, 69, 0, 72, 0, 0, 0, 74, 0, 72, 0, 69, 0, 0, 0],
  [74, 0, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 69, 0, 72, 0],
  [71, 0, 0, 0, 68, 0, 0, 0, 71, 0, 0, 0, 76, 0, 0, 0],
];

const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

function chordTones(c: Chord): number[] {
  const third = c.quality === 'min' ? 3 : 4;
  return [c.root, c.root + third, c.root + 7];
}

/** Shared audio graph pieces that the SFX layer reuses. */
export interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  reverb: ConvolverNode;
  noise: AudioBuffer;
}

export function createAudioGraph(): AudioGraph {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  master.connect(comp).connect(ctx.destination);

  // Impulse response: 2.4 s of exponentially decaying stereo noise.
  const reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.4);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (ch === 0 ? 1 : 0.9);
    }
  }
  reverb.buffer = ir;
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.55;
  reverb.connect(reverbGain).connect(master);

  const noiseLen = ctx.sampleRate * 2;
  const noise = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

  return { ctx, master, reverb, noise };
}

export class Soundtrack {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly duck: GainNode;
  private readonly drumBus: GainNode;
  private readonly delay: DelayNode;
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;
  private readonly kickTimes: number[] = [];
  private startedAt = 0;

  constructor(private readonly g: AudioGraph) {
    this.ctx = g.ctx;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(g.master);

    // Everything melodic goes through the side-chain "duck" gain.
    this.duck = this.ctx.createGain();
    this.duck.connect(this.out);
    this.drumBus = this.ctx.createGain();
    this.drumBus.gain.value = 1.0;
    this.drumBus.connect(this.out);

    // Dotted-eighth delay for arps and lead.
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = SECONDS_PER_BEAT * 0.75;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.36;
    const dampen = this.ctx.createBiquadFilter();
    dampen.type = 'lowpass';
    dampen.frequency.value = 3200;
    this.delay.connect(dampen).connect(fb).connect(this.delay);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.45;
    this.delay.connect(wet).connect(this.duck);
    wet.connect(g.reverb);
  }

  start(): void {
    if (this.timer !== null) return;
    void this.ctx.resume();
    this.startedAt = this.ctx.currentTime + 0.1;
    this.nextStepTime = this.startedAt;
    this.step = 0;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  setVolume(v: number): void {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** 1.0 on a kick, decaying exponentially; drives the visual pulse. */
  beatEnergy(): number {
    const now = this.ctx.currentTime;
    let last = -Infinity;
    for (const t of this.kickTimes) if (t <= now && t > last) last = t;
    if (last === -Infinity) return 0;
    return Math.exp(-(now - last) * 7);
  }

  /* --------------------------------------------------------------- core */

  private tick(): void {
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_S) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += SECONDS_PER_STEP;
      this.step += 1;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const s = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length;
    const loop = Math.floor(step / (STEPS_PER_BAR * PROGRESSION.length));
    const chord = PROGRESSION[bar]!;
    const tones = chordTones(chord);

    // Drums.
    if (s % 4 === 0) {
      this.kick(t);
      this.sideChain(t);
    }
    if (s === 4 || s === 12) this.clap(t);
    if (s % 2 === 1) this.hat(t, false, s % 4 === 3 ? 0.5 : 0.3);
    if (s === 14 && bar % 2 === 1) this.hat(t, true, 0.35);

    // Bass: pulsing octaves, accent on the beat.
    const bassNote = chord.root - 12 + (s % 4 === 2 ? 12 : 0);
    this.bass(t, midiToHz(bassNote), s % 4 === 0 ? 1.0 : 0.72);

    // Arpeggio (two octaves above the bass root), pattern over chord tones.
    const arpTones = [...tones, tones[0]! + 12, tones[1]! + 12, tones[2]! + 12];
    const arpNote = arpTones[ARP_PATTERN[s]!]! + 12;
    if (loop > 0 || bar >= 2) this.pluck(t, midiToHz(arpNote), 0.32);

    // Pad on each bar start.
    if (s === 0) this.pad(t, tones.map((n) => n + 12), SECONDS_PER_STEP * STEPS_PER_BAR);

    // Lead over the second half of the loop.
    if (bar >= 4) {
      const note = LEAD_PHRASE[bar - 4]![s]!;
      if (note > 0) this.lead(t, midiToHz(note), SECONDS_PER_STEP * 1.8);
    }
  }

  private sideChain(t: number): void {
    const gp = this.duck.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(0.32, t);
    gp.linearRampToValueAtTime(1.0, t + 0.3);
  }

  /* ------------------------------------------------------------- voices */

  private kick(t: number): void {
    const ctx = this.ctx;
    this.kickTimes.push(t);
    if (this.kickTimes.length > 16) this.kickTimes.shift();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(gain).connect(this.drumBus);
    osc.start(t);
    osc.stop(t + 0.4);
    // Click transient.
    const click = ctx.createBufferSource();
    click.buffer = this.g.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.35, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    click.connect(hp).connect(cg).connect(this.drumBus);
    click.start(t);
    click.stop(t + 0.05);
  }

  private clap(t: number): void {
    const ctx = this.ctx;
    for (const [dt, amp] of [[0, 0.5], [0.012, 0.4], [0.026, 0.6]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.g.noise;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 0.9;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(amp, t + dt);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dt + (dt > 0.02 ? 0.26 : 0.05));
      src.connect(bp).connect(gn).connect(this.drumBus);
      gn.connect(this.g.reverb);
      src.start(t + dt);
      src.stop(t + dt + 0.3);
    }
  }

  private hat(t: number, open: boolean, amp: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.g.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(amp * 0.5, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.28 : 0.05));
    src.connect(hp).connect(gn).connect(this.drumBus);
    src.start(t);
    src.stop(t + 0.3);
  }

  private bass(t: number, hz: number, amp: number): void {
    const ctx = this.ctx;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = hz;
    const sq = ctx.createOscillator();
    sq.type = 'square';
    sq.frequency.value = hz;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(260 + 900 * amp, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.33 * amp, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    saw.connect(mix);
    sq.connect(mix);
    mix.connect(lp).connect(gn).connect(this.duck);
    saw.start(t);
    sq.start(t);
    saw.stop(t + 0.25);
    sq.stop(t + 0.25);
  }

  private pluck(t: number, hz: number, amp: number): void {
    const ctx = this.ctx;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(amp * 0.22, t + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.3);
    }
    lp.connect(gn);
    gn.connect(this.duck);
    gn.connect(this.delay);
  }

  private pad(t: number, notes: number[], dur: number): void {
    const ctx = this.ctx;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.055, t + 0.45);
    gn.gain.setValueAtTime(0.055, t + dur - 0.3);
    gn.gain.linearRampToValueAtTime(0, t + dur + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 850;
    lp.Q.value = 1.2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.5);
    for (const n of [...notes, notes[0]! + 12]) {
      for (const det of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToHz(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
    lp.connect(gn);
    gn.connect(this.duck);
    gn.connect(this.g.reverb);
  }

  private lead(t: number, hz: number, dur: number): void {
    const ctx = this.ctx;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.14, t + 0.02);
    gn.gain.setValueAtTime(0.14, t + dur * 0.6);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.Q.value = 2;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 6;
    vib.start(t);
    vib.stop(t + dur + 0.1);
    for (const [type, det] of [['square', -5], ['sawtooth', 5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      o.detune.value = det;
      vib.connect(vibGain).connect(o.detune);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    lp.connect(gn);
    gn.connect(this.duck);
    gn.connect(this.delay);
  }
}
