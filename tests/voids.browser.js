// Run on the Vite dev page: agent-browser eval --stdin < tests/voids.browser.js.
// Exercise the real collider, void trigger and checkpoint respawn together.
(() => {
  const retro = window.__retro;
  if (!retro) throw new Error('Open the Vite development build first.');
  const game = retro.game;
  const savedAudio = game.audio;
  const savedDt = retro.debug.fixedDt;
  retro.autopilot.stop();
  retro.input.override = { x: 0, y: 0 };
  retro.debug.fixedDt = 0;
  game.audio = null;
  const checkpoint = game.dynamics.checkpoints.find(c => c.def.id === 2).spawn;
  const offsets = [[0, 0], [-0.08, -0.08], [-0.08, 0.08], [0.08, -0.08], [0.08, 0.08]];
  let passed = 0;
  try {
    for (const marker of game.dynamics.voids) {
      const hole = marker.def;
      for (const [dx, dz] of offsets) {
        game.restart();
        game.spawn.copy(checkpoint);
        game.physics.resetBall(game.ball, checkpoint.clone().set(hole.x + dx, hole.y + 0.6, hole.z + dz));
        game.lastDeathInfo = null;
        for (let step = 0; step < 240 && game.state === 'play'; step++) game.update(1 / 120);
        if (game.state !== 'reset' || game.lastDeathInfo?.cause !== 'void') {
          throw new Error(`Trapped at ${hole.x + dx}, ${hole.z + dz}: y=${game.ballPosition.y}, state=${game.state}`);
        }
        for (let step = 0; step < 180 && game.state === 'reset'; step++) game.update(1 / 120);
        if (game.state !== 'play' || game.ballPosition.distanceTo(checkpoint) > 0.2) {
          throw new Error(`Did not respawn at checkpoint B after falling into ${hole.x}, ${hole.z}`);
        }
        passed++;
      }
    }
  } finally {
    game.restart();
    game.audio = savedAudio;
    retro.debug.fixedDt = savedDt;
    retro.input.override = null;
  }
  return { holes: game.dynamics.voids.length, dropsAndRespawnsPassed: passed };
})()
