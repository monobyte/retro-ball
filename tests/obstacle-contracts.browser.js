(async()=>{
  const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)};
  const {loadLevelDocument}=await import(new URL('src/content/Catalogue.ts',location.href).href);
  const doc=loadLevelDocument('legacy');doc.resetGroups[0].policy='checkpoint';doc.checkpoints[0].resetGroups=['course'];
  await r.app.loadDocument(doc);const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();
  for(let i=0;i<270;i++)g.update(1/120);
  const kinds=['jumppad','elevator','laser','void','checkpoint','goal'];
  const samples=[];
  for(const kind of kinds){
    const instance=doc.instances.find(i=>i.type===kind),component=g.dynamics.components.find(c=>c.id===instance.id),native=component.native;
    if(kind==='jumppad'){
      const p=g.ballPosition.clone().set(native.def.x,native.def.y+.5,native.def.z);
      assert(native.test(p,component.elapsed),'Jump pad did not arm');
    }
    const saved=structuredClone(component.capture());
    component.fixedUpdate(100,.25);component.reset(saved);
    assert(JSON.stringify(component.capture())===JSON.stringify(saved),`${kind}: state changed across snapshot`);
    if(kind==='jumppad'){
      const p=g.ballPosition.clone().set(native.def.x,native.def.y+.5,native.def.z);
      assert(!native.test(p,component.elapsed),'Jump cooldown vanished across checkpoint snapshot');
      component.receiveSignal('enable',false);
      assert(!g.dynamics.checkTriggers(p,.5,0).some(e=>e.type==='jump'),'Disabled jump pad still triggers');
      component.reset(saved);
    }
    if(kind==='elevator'){
      const y=native.body.translation().y+native.columnHeight/2;
      assert(Math.abs(y-native.heightAt(saved.elapsed))<1e-5,'Elevator collider did not rewind with clock');
      component.receiveSignal('enable',false);const clock=component.elapsed;component.fixedUpdate(100,.25);
      assert(component.elapsed===clock,'Disabled elevator clock advanced');component.reset(saved);
    }
    if(kind==='laser'){
      component.receiveSignal('enable',false);const p=g.ballPosition.clone().set(native.def.x,native.def.y+.5,native.def.z);
      assert(!native.test(p,.5,component.elapsed),'Disabled laser remains lethal');component.reset(saved);
    }
    samples.push({kind,id:instance.id,snapshot:saved});
  }
  // Bank real native state at checkpoint 1, then observe the actual death restore.
  const cp=g.dynamics.checkpoints[0];cp.active=false;g.physics.resetBall(g.ball,cp.spawn);
  g.update(1/120);assert(g.checkpointSnapshot.checkpointId==='checkpoint-1','Native fixture checkpoint did not activate');
  const saved=structuredClone(g.checkpointSnapshot),restored=[];
  for(const component of g.dynamics.components){const reset=component.reset.bind(component);component.reset=state=>{restored.push({id:component.id,state:structuredClone(state)});reset(state)}}
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-50,100));
  for(let i=0;i<360;i++)g.update(1/120);
  assert(g.resetCount===1&&g.state==='play','Native fixture did not recover from its fall');
  for(const item of restored)assert(JSON.stringify(item.state)===JSON.stringify(saved.groups.course.components[item.id]),`${item.id}: actual death restored different state`);
  assert(restored.length===g.dynamics.components.length,'Not every native component joined checkpoint restoration');
  const elevator=g.dynamics.components.find(c=>c.native?.def.kind==='elevator'),before=g.physics.world.bodies.len();
  elevator.dispose();elevator.dispose();assert(g.physics.world.bodies.len()===before-1,'Elevator collider disposal was missing or not idempotent');
  await r.app.returnToHub();assert(g.physics.disposed,'Native world survived unload');
  return {samples,checkpointRestored:restored.length,elevatorDisposal:'owned and idempotent'};
})()
