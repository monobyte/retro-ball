(async()=>{
  const r=window.__retro, samples=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message)};
  for(const id of ['conveyor-run','shuttle-bay','spin-crossing']) for(const hz of [30,60,120]){
    await r.app.loadLevel(id);const g=r.game;g.audio=null;r.debug.fixedDt=0;g.restart();
    const moving=g.dynamics.movingSurfaces[0];
    let stage=0,contacts=0,lowest=100,elapsed=0;
    for(let frame=0;frame<hz*30&&g.state==='play';frame++){
      const p=g.ball.body.translation(),v=g.ball.body.linvel();
      const target=id==='conveyor-run'?17:stage===0?0:id==='shuttle-bay'?20:12;
      let brake=0;
      if(id!=='conveyor-run'){
        if(stage===0&&p.x>-.5)stage=1;
        if(stage===1){
          brake=1;
          if(id==='shuttle-bay'&&moving.body.translation().x>8.9)stage=2;
          if(id==='spin-crossing'&&frame/hz>10.9)stage=2;
        }
      }
      const clamp=n=>Math.max(-1,Math.min(1,n));
      const desiredX=Math.max(-5,Math.min(5,(target-p.x)*2));
      const ax=brake?0:clamp((desiredX-v.x)*.5),az=brake?0:clamp((-p.z*3-v.z)*.5);
      r.input.override={x:(ax-az)*Math.SQRT1_2,y:(-ax-az)*Math.SQRT1_2,brake};
      g.update(1/hz);elapsed=(frame+1)/hz;lowest=Math.min(lowest,g.ballPosition.y);
      if(g.physics.groundCollider?.handle===moving.body.collider(0).handle)contacts++;
      assert(!g.resetCount,`${id}/${hz}: fell during traversal`);
    }
    assert(g.state==='win'&&contacts>hz/2&&lowest>.3,`${id}/${hz}: failed board/ride/exit`);
    // Revisit the checkpoint, fall off its dock, and observe the actual death restore.
    g.restart();
    for(let frame=0;frame<hz;frame++){
      r.input.override={x:Math.SQRT1_2,y:-Math.SQRT1_2};g.update(1/hz);
    }
    const checkpoint=structuredClone(g.checkpointSnapshot);
    assert(checkpoint.checkpointId,`${id}: approach did not reach checkpoint`);
    const saved=checkpoint.groups.course.components[moving.id];
    const reset=moving.reset.bind(moving);let restored;
    moving.reset=state=>{restored=structuredClone(state);reset(state)};
    g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));
    r.input.override={x:0,y:0,brake:1};
    for(let frame=0;frame<hz*3;frame++)g.update(1/hz);
    assert(g.resetCount===1&&g.state==='play',`${id}: death did not recover`);
    assert(JSON.stringify(restored)===JSON.stringify(saved),`${id}: checkpoint lost motion state`);
    assert(Math.abs(g.ballPosition.x-checkpoint.spawn.x)<.1&&g.ballPosition.y>.3,`${id}: unsafe checkpoint recovery`);
    moving.reset=reset;
    samples.push({id,hz,completionSeconds:elapsed,contactSeconds:contacts/hz,lowest,checkpoint:checkpoint.checkpointId,restored});
    await r.app.returnToHub();assert(g.physics.disposed,`${id}: physics survived unload`);
  }
  return {samples,description:'Nine complete routes with actual moving-surface contacts, followed by checkpoint revisit, fall, motion-state restoration and disposal'};
})()
