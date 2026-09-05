(async()=>{
  const r=window.__retro,app=r.app;
  const {documentFromLegacy}=await import(new URL('src/content/LevelDocument.ts',location.href).href);
  const assert=(ok,message)=>{if(!ok)throw new Error(message)};
  const samples=[];
  for(const kind of ['conveyor','bridge','rotator']){
    const params=kind==='conveyor'?{dir:'+x',speed:6,acceleration:12}:kind==='bridge'?{dir:'+x',distance:8,period:10,dwell:2}:{angularSpeed:30};
    const doc=documentFromLegacy({name:'Moving contact fixture',start:{x:-20,y:.6,z:0},pieces:[
      {kind:'slab',x:-20,y:0,z:0,w:6,d:6},
      {kind,x:0,y:0,z:0,w:12,d:12,...params},
      {kind:'goal',x:-22,y:0,z:0,w:1,d:1},
    ]},'moving-contact');
    doc.resetGroups[0].policy='attempt';
    for(const hz of [30,60,120]){
      await app.loadDocument(doc);const g=r.game;g.audio=null;r.debug.fixedDt=0;
      const moving=g.dynamics.movingSurfaces[0];
      g.restart();g.physics.clearAccumulator();
      g.physics.resetBall(g.ball,g.ballPosition.clone().set(kind==='rotator'?2:0,.6,0));
      r.input.override={x:0,y:0,brake:kind==='conveyor'?0:1};
      let worstRelative=0,lowest=100;
      for(let frame=0;frame<hz*(kind==='conveyor'?1:10);frame++){
        g.update(1/hz);lowest=Math.min(lowest,g.ballPosition.y);
        if(kind!=='conveyor'){
          const local=g.ballPosition.sub(moving.group.position).applyQuaternion(moving.group.quaternion.clone().invert());
          worstRelative=Math.max(worstRelative,Math.hypot(local.x-(kind==='rotator'?2:0),local.z));
        }
      }
      assert(g.state==='play'&&g.resetCount===0&&lowest>.3,`${kind}/${hz}: dropped or died`);
      if(kind==='conveyor')assert(g.ballPosition.x>1,`${kind}/${hz}: belt did not accelerate ball`);
      else assert(worstRelative<.1,`${kind}/${hz}: braking did not hold relative position (${worstRelative})`);
      const snapshot=structuredClone(moving.capture()),before=g.ballPosition.toArray();
      moving.fixedUpdate(100,1);moving.reset(snapshot);
      assert(JSON.stringify(moving.capture())===JSON.stringify(snapshot),'Moving surface snapshot changed');
      samples.push({kind,hz,position:before,lowest,worstRelative,snapshot});
      const physics=g.physics;
      await app.returnToHub();assert(physics.disposed,'Moving surface world survived unload');
    }
  }
  for(const kind of ['conveyor','bridge','rotator']){
    const result=samples.filter(s=>s.kind===kind);
    for(let axis=0;axis<3;axis++)assert(Math.max(...result.map(s=>s.position[axis]))-Math.min(...result.map(s=>s.position[axis]))<.005,`${kind}: cadence drift`);
  }
  return {samples,description:'Physical carrying/braking and belt acceleration at three presentation cadences; checkpoint-state round trip and world disposal'};
})()
