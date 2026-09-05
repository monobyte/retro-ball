(async()=>{
  const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)},samples=[];
  const {loadLevelDocument}=await import(new URL('src/content/Catalogue.ts',location.href).href);
  for(const hz of [30,60,120]){
    await r.app.loadLevel('signal-crossing');const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();
    const control=g.dynamics.switches[0],laser=g.dynamics.lasers[0];
    assert(laser.enabled&&control.stateOutputs().active,'Initial power not applied');
    let pressed=false;
    for(let frame=0;frame<hz*20&&g.state==='play';frame++){
      const p=g.ball.body.translation();
      if(!pressed&&p.z<6.4){
        const code=r.input.settings.bindings.interact[0];
        window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));pressed=code;
      }
      r.input.override={x:Math.SQRT1_2,y:Math.SQRT1_2};g.update(1/hz);
      if(typeof pressed==='string'){window.dispatchEvent(new KeyboardEvent('keyup',{code:pressed,bubbles:true}));pressed=true}
      assert(!g.resetCount,`Circuit/${hz}: failed to cut power before crossing`);
    }
    assert(g.state==='win'&&!laser.enabled&&!control.stateOutputs().active,`Circuit/${hz}: did not complete powered-off route`);
    const completed=g.runTime,trace=structuredClone(g.dynamics.signals.trace);
    assert(trace.some(e=>e.channel==='main-power'&&e.value===false),'Missing named channel delivery');
    assert(g.checkpointSnapshot.checkpointId==='checkpoint-2','Final checkpoint not reached');
    // Return to play at the saved checkpoint, deliberately change the circuit,
    // then take the real death path and verify source and target state recover.
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,.6,-4));g.ball.body.setGravityScale(1,true);r.input.override={x:0,y:0};
    g.setState('play');control.interact();g.update(1/hz);
    assert(laser.enabled&&laser.armingRemaining>0,'Re-enabling omitted its safe warning window');
    assert(!laser.test(g.ballPosition.clone().set(0,.5,0),.5,0),'Laser killed during re-arming warning');
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));r.input.override={x:0,y:0};
    for(let frame=0;frame<hz*3;frame++)g.update(1/hz);
    assert(g.state==='play'&&g.resetCount===1&&!laser.enabled&&!control.stateOutputs().active,`Circuit/${hz}: checkpoint did not restore circuit`);
    assert(!g.dynamics.signals.fault,'Signal network faulted');
    g.restart();assert(laser.enabled&&control.stateOutputs().active,'Full retry did not restore initial power');
    samples.push({hz,completionSeconds:completed,trace,checkpointCircuitRestored:true,rearmWarning:true,retryInitialState:true});
    await r.app.returnToHub();assert(g.physics.disposed&&g.dynamics.signals.trace.length===0,'Signal runtime survived unload');
  }
  // A pulse-only circuit exercises instance-local links as well as named links.
  const d=loadLevelDocument('signal-crossing');d.signals=[];
  const control=d.instances.find(i=>i.type==='switch');
  control.parameters.initial='off';control.links=[{output:'activated',target:{instanceId:'laser-005',input:'reset'}}];
  await r.app.loadDocument(d);const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();
  for(let i=0;i<120;i++)g.update(1/120);
  const native=g.dynamics.components.find(c=>c.id==='laser-005');
  assert(native.capture().elapsed>.9,'Native clock did not run');
  g.dynamics.signals.emit(control.id,'activated',null);assert(native.capture().elapsed>.9,'Pulse delivered recursively');
  g.update(1/120);assert(native.capture().elapsed===0,'Queued reset pulse did not rewind native obstacle');
  await r.app.returnToHub();
  // Timed switch state uses simulation time and survives snapshot round trips.
  const timed=loadLevelDocument('signal-crossing');const t=timed.instances.find(i=>i.type==='switch');t.parameters.mode='timed';t.parameters.duration=.5;t.parameters.initial='off';
  await r.app.loadDocument(timed);const tg=r.game;r.debug.fixedDt=0;tg.audio=null;tg.restart();const timer=tg.dynamics.switches[0];
  timer.interact();tg.update(1/120);assert(tg.dynamics.lasers[0].enabled,'Timed activation did not publish');
  const state=structuredClone(timer.capture());timer.reset(null);timer.reset(state);assert(JSON.stringify(timer.capture())===JSON.stringify(state),'Timed state changed across snapshot');
  for(let i=0;i<70;i++)tg.update(1/120);
  assert(!timer.stateOutputs().active&&!tg.dynamics.lasers[0].enabled,'Timed signal did not expire');
  await r.app.returnToHub();
  return {samples,inlinePulse:'queued native reset',timed:'activation, snapshot and expiry'};
})()
