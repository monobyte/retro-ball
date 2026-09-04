// CPU submission cost is not GPU execution time. rAF cadence includes scheduling.
// Run once at DPR 1 and once at DPR 2, 1511 x 862 CSS pixels, on an idle machine.
(async () => {
  const r = window.__retro, g = r.game, renderer = g.renderer.renderer;
  const { loadSettings } = await import(new URL('src/settings/Settings.ts', location.href).href);
  const saved = loadSettings(), audio = g.audio;
  const update = g.update, step = g.physics.world.step, render = renderer.render;
  const savedAutoReset = renderer.info.autoReset;
  const savedDt = r.debug.fixedDt, savedSteps = r.debug.stepsPerFrame;
  let updateMs = 0, physicsMs = 0, submitMs = 0;
  g.update = function(...args) { const t=performance.now(); try { return update.apply(this,args); } finally { updateMs+=performance.now()-t; } };
  g.physics.world.step = function(...args) { const t=performance.now(); try { return step.apply(this,args); } finally { physicsMs+=performance.now()-t; } };
  renderer.render = function(...args) { const t=performance.now(); try { return render.apply(this,args); } finally { submitMs+=performance.now()-t; } };
  renderer.info.autoReset = false;
  const frame = () => new Promise(requestAnimationFrame);
  const summary = values => { const sorted=values.slice().sort((a,b)=>a-b); return { median:sorted[Math.floor(sorted.length*.5)], p95:sorted[Math.floor(sorted.length*.95)], max:sorted.at(-1) }; };
  const results = [];
  try {
    r.autopilot.stop(); r.input.override={x:0,y:0}; g.audio=null;
    r.debug.fixedDt=1/60; r.debug.stepsPerFrame=1;
    for (const [name, quality] of [
      ['low', { pixelRatioCap:1, antialias:false, bloom:false, nebulaScale:.25 }],
      ['standard', { pixelRatioCap:2, antialias:false, bloom:true, nebulaScale:.25 }],
      ['high', { pixelRatioCap:2, antialias:true, bloom:true, nebulaScale:1 }],
    ]) {
      r.applySettings({...saved,...quality,frameCap:0});
      g.restart(); const p=g.dynamics.checkpoints[0].spawn;
      g.physics.resetBall(g.ball,p); g.ballPos.copy(p); g.camTarget.copy(p); g.renderer.lookAt(p);
      for(let i=0;i<60;i++) await frame();
      const intervals=[], updates=[], physics=[], submits=[], calls=[], triangles=[];
      let last=await frame();
      for(let i=0;i<240;i++) {
        updateMs=physicsMs=submitMs=0; renderer.info.reset();
        const now=await frame(); intervals.push(now-last); last=now;
        updates.push(updateMs); physics.push(physicsMs); submits.push(submitMs);
        calls.push(renderer.info.render.calls); triangles.push(renderer.info.render.triangles);
      }
      results.push({name,settings:quality,buffer:[renderer.domElement.width,renderer.domElement.height],pixelRatio:renderer.getPixelRatio(),frameIntervalMs:summary(intervals),gameUpdateMs:summary(updates),physicsStepMs:summary(physics),renderSubmissionMs:summary(submits),drawCalls:summary(calls),triangles:summary(triangles),resources:{...renderer.info.memory,programs:renderer.info.programs.length,bodies:g.physics.world.bodies.len(),colliders:g.physics.world.colliders.len()}});
    }
  } finally {
    g.update=update; g.physics.world.step=step; renderer.render=render;
    renderer.info.autoReset=savedAutoReset; renderer.info.reset();
    g.audio=audio; r.input.override=null; r.debug.fixedDt=savedDt; r.debug.stepsPerFrame=savedSteps;
    r.applySettings(saved); g.restart();
  }
  const gl=renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
  return { browser:navigator.userAgent, gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable', viewport:[innerWidth,innerHeight],devicePixelRatio,readyAtMs:r.readyAtMs, navigation:performance.getEntriesByType('navigation')[0].toJSON(),results };
})()
