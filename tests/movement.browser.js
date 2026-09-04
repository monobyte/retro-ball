(async () => {
  const r = window.__retro, app = r.app;
  const { documentFromLegacy } = await import(new URL('src/content/LevelDocument.ts', location.href).href);
  const { SURFACES } = await import(new URL('src/physics/Surfaces.ts', location.href).href);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const frame = () => new Promise(requestAnimationFrame);
  const waitState = async state => { for(let i=0;i<30 && app.state!==state;i++) await frame(); assert(app.state===state, `Expected ${state}; got ${app.state}`); };
  const samples = [];
  for (const surface of Object.keys(SURFACES)) {
    const doc = documentFromLegacy({ name: 'Brake fixture', start: { x: 0, y: .6, z: 0 }, pieces: [
      { kind: 'slab', x: 0, z: 0, y: 0, w: 160, d: 160, surface },
      { kind: 'goal', x: 70, z: 0, y: 0, w: 3, d: 3 },
    ] }, 'brake-fixture');
    await app.loadDocument(doc); const g = r.game; g.audio=null; r.debug.fixedDt=0;
    for (const hz of [30, 60, 120]) for (const speed of [4, 8, 16]) {
      g.restart();
      for(let i=0;i<120;i++) g.update(1/120);
      assert(g.grounded && g.surface===surface, `Surface detection failed: ${surface}`);
      g.ball.body.setLinvel({x:speed,y:0,z:0},true);
      g.ball.body.setAngvel({x:0,y:0,z:-speed/.5},true);
      const start=g.ball.body.translation().x;
      r.input.override={x:0,y:0,brake:1};
      let frames=0;
      do {g.update(1/hz); frames++;} while(Math.hypot(g.ballVelocity.x,g.ballVelocity.z)>.1 && frames<hz*12);
      assert(frames<hz*12,'Brake failed to stop');
      samples.push({surface,hz,speed,distance:g.ballPosition.x-start,time:frames/hz});
    }
  }
  for(const surface of Object.keys(SURFACES)) for(const speed of [4,8,16]) {
    const distances=samples.filter(s=>s.surface===surface&&s.speed===speed).map(s=>s.distance);
    assert(Math.max(...distances)-Math.min(...distances)<.04,`Display-rate braking drift: ${surface} / ${speed}`);
  }
  const stop = surface => samples.find(s=>s.surface===surface&&s.hz===60&&s.speed===16).distance;
  assert(stop('ice')>stop('standard')*1.5,'Ice does not teach a longer stopping distance');
  assert(stop('rough')<stop('standard'),'Rough ground should stop sooner');
  await app.loadLevel('grip-lab');
  const lab = r.game; lab.audio=null; lab.restart(); r.debug.fixedDt=0;
  r.input.override={x:Math.SQRT1_2,y:-Math.SQRT1_2}; const visited = new Set();
  for(let step=0;step<1800&&lab.state!=='win';step++){lab.update(1/120);if(lab.grounded)visited.add(lab.surface);}
  assert(lab.state==='win' && lab.resetCount===0 && visited.size===4,'Grip Lab route did not teach all four surfaces');
  const descriptor=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
  const pad={index:0,id:'Automated standard-controller fixture',connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  let pads=[pad];
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pads});
  try {
    await app.loadLevel('relay'); const g=r.game; g.audio=null; g.restart(); r.debug.fixedDt=0;
    r.input.poll(); pad.axes=[Math.SQRT1_2,-Math.SQRT1_2];
    for(let step=0;step<2400&&g.state!=='win';step++){r.input.poll();g.update(1/120);}
    assert(g.state==='win'&&g.resetCount===0,'Standard controller failed relay course');
    pad.axes=[0,0]; g.restart(); r.input.poll(); await waitState('playing');
    app.menuInput.poll(); pads=[]; app.menuInput.poll();
    assert(app.state==='paused','Disconnect did not pause');
    const time=g.physics.simulationTime; for(let i=0;i<4;i++)await frame();
    assert(time===g.physics.simulationTime,'Disconnected pause advanced physics');
    pads=[pad]; pad.axes=[1,0]; r.input.poll(); assert(r.input.axis().x===0,'Reconnection bypassed neutral gating');
    pad.axes=[0,0]; r.input.poll(); app.menuInput.poll();
    pad.buttons[9].pressed=true; await waitState('playing'); pad.buttons[9].pressed=false;
    pads=[]; r.input.poll(); app.menuInput.poll();
    if(app.state==='paused')app.togglePause();
    g.restart();
    for(const code of ['ArrowUp','ArrowRight'])window.dispatchEvent(new KeyboardEvent('keydown',{code}));
    for(let step=0;step<2400&&g.state!=='win';step++)g.update(1/120);
    for(const code of ['ArrowUp','ArrowRight'])window.dispatchEvent(new KeyboardEvent('keyup',{code}));
    assert(g.state==='win'&&g.resetCount===0,'Keyboard failed relay course');
  } finally {
    if(descriptor)Object.defineProperty(navigator,'getGamepads',descriptor);else delete navigator.getGamepads;
    await app.returnToHub();
  }
  return {gripLab:'WIN through four surfaces',brakingSamples:samples,rateComparison:'30/60/120 Hz simulation cadence within 0.04 units',keyboard:'relay WIN',controller:'standard API fixture relay WIN',disconnectRecovery:'passed',physicalController:'not tested'};
})()
