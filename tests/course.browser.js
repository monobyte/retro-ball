// Poll __retro.autopilot.status() until done; success requires WIN, never god mode.
(() => {
  const r = window.__retro;
  r.game.restart();
  r.game.godMode = false;
  r.game.audio.applySettings({ musicEnabled: false, soundFxEnabled: false });
  r.debug.fixedDt = 1 / 60;
  r.debug.stepsPerFrame = 16;
  r.autopilot.start();
  return { started: true };
})()
