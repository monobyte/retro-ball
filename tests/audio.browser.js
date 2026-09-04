// Checks real output samples, including reverb, as well as UI and persistence.
(async () => {
  const { AudioSystem } = await import(new URL('src/audio/AudioSystem.ts', location.href).href);
  const { loadSettings } = await import(new URL('src/settings/Settings.ts', location.href).href);
  const audio = new AudioSystem();
  audio.applySettings({ musicEnabled: false, soundFxEnabled: false });
  audio.start();
  if (!audio.graph) throw new Error('AudioContext unavailable');
  const { ctx, music, sfx, master } = audio.graph;
  await Promise.race([ctx.resume(), new Promise((_, reject) => setTimeout(() => reject(new Error('Unlock audio with Space before running this check')), 2000))]);
  if (ctx.state !== 'running') throw new Error('Unlock audio with Space before running this check');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  master.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  // Constant probes exercise each category's dry AND wet routes deterministically.
  const probes = [music, sfx].map(channel => {
    const meter = ctx.createAnalyser(); meter.fftSize = 2048; channel.master.connect(meter);
    const source = ctx.createOscillator();
    const gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(gain); gain.connect(channel.master); gain.connect(channel.reverb);
    source.start(); return { source, gain, meter };
  });
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const saved = loadSettings();
  let cases = 0;
  try {
    audio.music.setVolume(0.37); audio.sfx.setVolume(0.61);
    for (const musicEnabled of [false, true]) for (const soundFxEnabled of [false, true]) {
      audio.applySettings({ musicEnabled, soundFxEnabled });
      for (const [key, enabled] of [['musicEnabled', musicEnabled], ['soundFxEnabled', soundFxEnabled]]) {
        const button = document.querySelector(`[data-setting="${key}"] button[data-value="${enabled ? 1 : 0}"]`);
        assert(button, `Missing ${key} control`); button.click();
        assert(button.getAttribute('aria-pressed') === 'true', `${key} selection not exposed`);
        assert(loadSettings()[key] === enabled, `${key} not persisted`);
      }
      for (let category = 0; category < 2; category++) {
        probes.forEach((probe, i) => { probe.gain.gain.value = i === category ? 0.1 : 0; });
        await wait(160);
        // Disabled bus must have decayed to silence even with active wet sends.
        const bus = category === 0 ? music : sfx;
        const enabled = category === 0 ? musicEnabled : soundFxEnabled;
        assert(Math.abs(bus.master.gain.value - Number(enabled)) < 0.0001, 'Category gain did not settle');
        probes[category].meter.getFloatTimeDomainData(samples);
        const peak = Math.max(...samples.map(Math.abs));
        assert(enabled ? peak > 0.01 : peak < 0.0001, 'Category dry/reverb output does not match its preference');
      }
      audio.toggleMute(); await wait(160);
      analyser.getFloatTimeDomainData(samples);
      assert(Math.max(...samples.map(Math.abs)) < 0.0001, 'Master mute leaked audio/reverb');
      audio.applySettings({ musicEnabled: !musicEnabled, soundFxEnabled: !soundFxEnabled });
      audio.applySettings({ musicEnabled, soundFxEnabled });
      audio.toggleMute(); await wait(160);
      assert(Math.abs(music.master.gain.value - Number(musicEnabled)) < 0.0001, 'Unmute changed music choice');
      assert(Math.abs(sfx.master.gain.value - Number(soundFxEnabled)) < 0.0001, 'Unmute changed FX choice');
      if (!musicEnabled && !soundFxEnabled) {
        analyser.getFloatTimeDomainData(samples);
        assert(Math.max(...samples.map(Math.abs)) < 0.0001, 'Category mute leaked reverb');
      }
      assert(Math.abs(audio.music.out.gain.value - 0.37) < 0.0001, 'Music volume was overwritten');
      assert(Math.abs(audio.sfx.out.gain.value - 0.61) < 0.0001, 'FX volume was overwritten');
      assert(Number.isFinite(audio.beatEnergy()), 'Music off broke visual rhythm');
      cases++;
    }
  } finally {
    audio.music.stop(); probes.forEach(p => p.source.stop()); await ctx.close();
    for (const key of ['musicEnabled', 'soundFxEnabled']) {
      document.querySelector(`[data-setting="${key}"] button[data-value="${saved[key] ? 1 : 0}"]`).click();
    }
  }
  return { combinations: cases, wetAndDryMute: 'passed', volumePreservation: 'passed' };
})()
