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
  for(const [mode,x,y,z] of [['puzzle',0,.6,0],['vertical',0,4.6,-20],['speed',0,8.6,-34],['arena',8,8.6,-43]]){
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
  // Complete the whole camera course through keyboard and standard gamepad input
  // at each presentation cadence; physics remains fixed at 120 Hz.
  const descriptor=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
  const pad={index:0,id:'Camera-course controller',connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  let pads=[];
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pads});
  const routes=[];let flightFrames=0,maxNdc=0;
  try {
    for(const hz of [30,60,120])for(const control of ['keyboard','controller']){
      pads=[];r.input.poll();g.restart();r.debug.fixedDt=0;
      // A synthetic disconnection may pause the app; direct fixed-step checks
      // use the game's state and do not resume its real-time frame loop.
      if(control==='controller'){
        pads=[pad];pad.axes=[0,0];r.input.poll();pad.axes=[Math.SQRT1_2,-Math.SQRT1_2];
      }else for(const code of ['ArrowUp','ArrowRight'])window.dispatchEvent(new KeyboardEvent('keydown',{code}));
      let flights=0;
      for(let frame=0;frame<hz*30&&g.state!=='win';frame++){
        r.input.poll();g.update(1/hz);
        if(g.landingTarget){
          flights++;flightFrames++;
          for(const point of [g.ballPosition,g.landingTarget.clone()]){
            const p=point.project(g.renderer.camera);maxNdc=Math.max(maxNdc,Math.abs(p.x),Math.abs(p.y));
            assert(Math.abs(p.x)<.84&&Math.abs(p.y)<.84,`${control}/${hz}: ball or target left the jump framing margin`);
          }
        }
      }
      for(const code of ['ArrowUp','ArrowRight'])window.dispatchEvent(new KeyboardEvent('keyup',{code}));
      pad.axes=[0,0];
      assert(g.state==='win'&&g.resetCount===0,`${control}/${hz}: Sightlines did not complete cleanly`);
      assert(flights>0,'Sightlines did not exercise jump framing');
      routes.push({hz,control,state:g.state,resets:g.resetCount,time:g.runTime});
    }
  }finally{
    for(const code of ['ArrowUp','ArrowRight'])window.dispatchEvent(new KeyboardEvent('keyup',{code}));
    if(descriptor)Object.defineProperty(navigator,'getGamepads',descriptor);else delete navigator.getGamepads;
  }
  await app.returnToHub();
  return {contacts,modes,routes,sightlines:'WIN without resets',flightFrames,maxNdc,occlusion:'solid scenery only; verify accompanying screenshot',physicalDisplays:'simulation cadence only'};
})()
