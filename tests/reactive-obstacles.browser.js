(async()=>{
  const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)},routes=[],probes=[];
  const {documentFromLegacy}=await import(new URL('src/content/LevelDocument.ts',location.href).href);
  const prepare=async(source)=>{await(typeof source==='string'?r.app.loadLevel(source):r.app.loadDocument(source));const g=r.game;assert(g,'Fixture load failed');r.debug.fixedDt=0;g.audio=null;g.restart();return g};
  for(const id of ['balance-act','borrowed-time','spring-yard'])for(const hz of [30,60,120]){
    const g=await prepare(id);let stage=0,hits=0,maxTilt=0,elapsed=0;const warnings=new Set();
    if(id==='spring-yard'){
      const bumper=g.dynamics.bumpers[0],contact=bumper.contact.bind(bumper);
      bumper.contact=ball=>{const hit=contact(ball);if(hit){hits++;assert(ball.body.linvel().x<-8,'Spring did not reverse the marble with a bounded kick')}return hit};
    }
    for(let frame=0;frame<hz*30&&g.state==='play';frame++){
      const p=g.ball.body.translation(),v=g.ball.body.linvel();let tx=id==='borrowed-time'?14:9,tz=0;
      if(id==='spring-yard'){
        if(stage===0){tx=-4;if(Math.hypot(p.x-tx,p.z)<.4)stage=1}
        if(stage===1){tx=0;if(hits)stage=2}
        if(stage===2)tx=-10;
      }
      const cap=x=>Math.max(-1,Math.min(1,x)),vel=x=>Math.max(-6,Math.min(6,x*2));
      const ax=cap((vel(tx-p.x)-v.x)*.5),az=cap((vel(tz-p.z)-v.z)*.5);
      r.input.override={x:(ax-az)*Math.SQRT1_2,y:(-ax-az)*Math.SQRT1_2};g.update(1/hz);elapsed=(frame+1)/hz;
      for(const plate of g.dynamics.reactivePlates){const state=plate.capture();if(state.phase==='warning')warnings.add(plate.id);maxTilt=Math.max(maxTilt,Math.abs(state.angle??0))}
      assert(!g.resetCount,`${id}/${hz}: traversal fell`);
    }
    assert(g.state==='win',`${id}/${hz}: incomplete route`);
    if(id==='spring-yard')assert(hits===1,`${id}/${hz}: expected one physical spring rebound`);
    if(id==='balance-act')assert(maxTilt>.02,`${id}/${hz}: weight did not tip the seesaw`);
    if(id==='borrowed-time')assert(warnings.size===2,`${id}/${hz}: did not trigger both recovering floors`);
    routes.push({id,hz,completionSeconds:elapsed,hits,maxTiltRadians:maxTilt,warnedFloors:warnings.size});
    await r.app.returnToHub();assert(g.physics.disposed,'World survived disposal');
  }
  const fixture=(piece)=>{
    const d=documentFromLegacy({name:'Reactive physics probe',start:{x:-10,y:.6,z:0},pieces:[
      {kind:'slab',x:-10,y:0,z:0,w:6,d:8},{...piece,x:0,y:0,z:0},
      {kind:'checkpoint',x:-10,y:0,z:0,id:1},{kind:'goal',x:-12,y:0,z:0,w:1,d:1},
    ]},'reactive-probe');
    d.resetGroups[0].policy='checkpoint';d.checkpoints[0].resetGroups=['course'];return d;
  };
  for(const mode of ['drop','retract'])for(const hz of [30,60,120]){
    const g=await prepare(fixture({kind:'fragile',w:6,d:6,mode,dir:'+z',warning:1.2,recovery:2.5}));
    const plate=g.dynamics.reactivePlates[0];r.input.override={x:0,y:0,brake:1};g.update(1/hz);
    assert(g.checkpointSnapshot.checkpointId,'Physics fixture checkpoint not activated');
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,.5,0));
    const phases=new Set();let dropped=false,restored;
    const reset=plate.reset.bind(plate);plate.reset=state=>{restored=structuredClone(state);reset(state)};
    for(let i=0;i<hz*5;i++){
      g.update(1/hz);const phase=plate.cycle.state.phase;phases.add(phase);
      if(phase==='absent'){assert(!plate.body.collider(0).isEnabled(),'Absent floor still collides');if(plate.cycle.state.elapsed>=.5)assert(!plate.deck.visible,'Withdrawn floor still looks landable');if(g.ballPosition.y<-.5)dropped=true}
    }
    assert(phases.has('warning')&&phases.has('absent')&&dropped,`${mode}/${hz}: floor did not warn, disappear and allow a fall`);
    assert(g.resetCount===1&&g.state==='play'&&g.ballPosition.x<-9,`${mode}/${hz}: death recovery failed`);
    assert(restored?.phase==='solid'&&plate.body.collider(0).isEnabled(),`${mode}/${hz}: checkpoint did not restore solid floor`);
    // Hold a stationary physics body in the return volume to prove anti-crush behaviour.
    g.restart();r.input.override={x:0,y:0,brake:1};g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,.5,0));g.ball.body.setGravityScale(0,true);
    for(let i=0;i<hz*6;i++)g.update(1/hz);
    assert(plate.cycle.state.phase==='returning'&&!plate.body.collider(0).isEnabled(),`${mode}/${hz}: floor reappeared through the marble`);
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(-10,.6,0));
    for(let i=0;i<5;i++)g.update(1/hz);
    assert(plate.cycle.state.phase==='solid'&&plate.body.collider(0).isEnabled(),`${mode}/${hz}: clear floor did not recover`);
    probes.push({mode,hz,phases:[...phases],fellThrough:true,checkpointRecovered:true,blockedReturn:true,clearReturn:true});
    await r.app.returnToHub();assert(g.physics.disposed,'Reactive probe leaked world');
  }
  for(const hz of [30,60,120]){
    const g=await prepare(fixture({kind:'seesaw',w:8,d:8,axis:'z',maxTilt:12,response:3}));
    const plate=g.dynamics.reactivePlates[0];g.update(1/hz);
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(2,.5,0));r.input.override={x:0,y:0,brake:1};
    for(let i=0;i<hz*3;i++)g.update(1/hz);
    const loaded=plate.capture();assert(loaded.angle<-.07&&Math.abs(loaded.angle)<12*Math.PI/180+.001,`Seesaw/${hz}: wrong or unbounded weight response`);
    assert(!g.resetCount&&g.ballPosition.y>-.5,`Seesaw/${hz}: lost rider`);
    const snapshot=structuredClone(loaded);plate.reset(null);plate.reset(snapshot);assert(JSON.stringify(plate.capture())===JSON.stringify(snapshot),'Seesaw snapshot changed');
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(-10,.6,0));
    for(let i=0;i<hz*4;i++)g.update(1/hz);
    assert(Math.abs(plate.capture().angle)<.002,`Seesaw/${hz}: did not settle without weight`);
    let restored;
    const reset=plate.reset.bind(plate);plate.reset=state=>{restored=structuredClone(state);reset(state)};
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));
    for(let i=0;i<hz*3;i++)g.update(1/hz);
    assert(g.resetCount===1&&g.state==='play'&&restored?.angle===0&&g.ballPosition.x<-9,`Seesaw/${hz}: checkpoint recovery failed`);
    probes.push({kind:'seesaw',hz,loadedAngle:loaded.angle,settledAngle:plate.capture().angle,checkpointRecovered:true});
    await r.app.returnToHub();assert(g.physics.disposed,'Seesaw probe leaked world');
  }
  for(const hz of [30,60,120]){
    const d=fixture({kind:'bumper',radius:.8,kickSpeed:10,cooldown:1});
    d.instances[0].transform.position.x=0;d.instances[0].parameters.w=30;
    const g=await prepare(d),bumper=g.dynamics.bumpers[0];g.update(1/hz);
    let hits=0,restored;const contact=bumper.contact.bind(bumper),reset=bumper.reset.bind(bumper);
    bumper.contact=ball=>{const fired=contact(ball);if(fired)hits++;return fired};
    bumper.reset=state=>{restored=structuredClone(state);reset(state)};
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(-1.3,.5,0));g.ball.body.setLinvel({x:2,y:0,z:0},true);
    r.input.override={x:Math.SQRT1_2,y:-Math.SQRT1_2};
    let charged=false;
    for(let i=0;i<hz&&!hits;i++){g.update(1/hz);if(bumper.capture().phase==='charging')charged=true}
    assert(charged&&hits===1&&bumper.capture().phase==='cooldown',`Bumper/${hz}: missing warning/kick/cooldown`);
    const snapshot=structuredClone(bumper.capture());bumper.reset(null);bumper.reset(snapshot);
    assert(JSON.stringify(bumper.capture())===JSON.stringify(snapshot),'Bumper snapshot changed');
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));r.input.override={x:0,y:0};
    for(let i=0;i<hz*3;i++)g.update(1/hz);
    assert(g.resetCount===1&&g.state==='play'&&restored?.phase==='idle'&&bumper.capture().phase==='idle',`Bumper/${hz}: checkpoint cooldown reset failed`);
    probes.push({kind:'bumper',hz,charged,kicks:hits,checkpointRecovered:true});
    await r.app.returnToHub();assert(g.physics.disposed,'Bumper probe leaked world');
  }
  return {routes,probes,description:'Nine complete reactive routes; deliberate floor falls and checkpoint restores; occupied/clear returns and seesaw weight/settling probes'};
})()
