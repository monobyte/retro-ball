(async () => {
  const r=window.__retro, app=r.app;
  const { documentFromLegacy }=await import(new URL('src/content/LevelDocument.ts',location.href).href);
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const contacts=[];
  const doc=documentFromLegacy({name:'Contact fixture',start:{x:0,y:.6,z:0},pieces:[
    {kind:'slab',x:0,z:0,y:0,w:40,d:40},
    {kind:'wall',x:8,z:0,y:0,w:1,d:20,h:3},
    {kind:'goal',x:-15,z:-15,y:0,w:3,d:3},
  ]},'contacts');
  await app.loadDocument(doc); let g=r.game;g.audio=null;r.debug.fixedDt=0;
  for(const hz of [30,60,120]){
    let landings=0,impacts=0;
    for(let repeat=0;repeat<4;repeat++){
      g.restart();g.physics.clearAccumulator();
      g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,4,0));
      for(let frame=0;frame<hz*3;frame++)g.update(1/hz);
      assert(g.contactStats.landings>0,`Missed landing at ${hz} Hz`);landings+=g.contactStats.landings;
      g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,.55,0));
      g.ball.body.setLinvel({x:14,y:0,z:0},true);
      for(let frame=0;frame<hz;frame++)g.update(1/hz);
      assert(g.contactStats.impacts>0,`Missed wall impact at ${hz} Hz`);impacts+=g.contactStats.impacts;
    }
    contacts.push({hz,landings,impacts});
  }
  assert(new Set(contacts.map(c=>c.landings)).size===1,'Landing count differs by display cadence');
  assert(new Set(contacts.map(c=>c.impacts)).size===1,'Impact count differs by display cadence');
  await app.loadLevel('sightlines');g=r.game;g.audio=null;g.restart();r.debug.fixedDt=0;
  const modes=[];
  for(const [mode,x,y,z] of [['puzzle',0,.6,0],['vertical',0,2.7,-12],['speed',0,8.6,-34],['arena',8,8.6,-43]]){
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(x,y,z));
    for(let frame=0;frame<90;frame++)g.update(1/60);
    const p=g.ballPosition.project(g.renderer.camera);
    assert(Math.abs(p.x)<.83&&Math.abs(p.y)<.83,`${mode}: ball left framing margin`);
    assert(g.cameraZoneId===mode,`Expected ${mode} camera, got ${g.cameraZoneId}`);
    modes.push({mode,viewHeight:g.renderer.viewHeight,ballNdc:p.toArray()});
  }
  g.restart();g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,.6,0));
  for(let frame=0;frame<120;frame++)g.update(1/60);
  assert(g.physics.sightlineBlocked(g.ball,g.sightDirection),'Occluder fixture does not block the sightline');
  assert(g.level.materials.every(m=>m.uniforms.uOccluded.value===1),'Solid scenery did not open its viewing window');
  // Play the full course, checking every frame of the launched ball's trajectory.
  g.restart();r.input.override={x:Math.SQRT1_2,y:Math.SQRT1_2};let flightFrames=0,maxNdc=0;
  for(let step=0;step<3600&&g.state!=='win';step++){
    g.update(1/120);
    if(g.landingTarget){
      flightFrames++;
      for(const point of [g.ballPosition,g.landingTarget.clone()]){
        const p=point.project(g.renderer.camera);maxNdc=Math.max(maxNdc,Math.abs(p.x),Math.abs(p.y));
        assert(Math.abs(p.x)<.84&&Math.abs(p.y)<.84,'Ball or target left the jump framing margin');
      }
    }
  }
  assert(g.state==='win'&&g.resetCount===0,'Sightlines course did not complete cleanly');
  assert(flightFrames>0,'Sightlines did not exercise jump framing');
  await app.returnToHub();
  return {contacts,modes,sightlines:'WIN without resets',flightFrames,maxNdc,occlusion:'solid scenery only; verify accompanying screenshot',physicalDisplays:'simulation cadence only'};
})()
