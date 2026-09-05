(async()=>{
 const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)},routes=[];
 for(const id of ['symbol-yard','impulse-vault'])for(const hz of [30,60,120]){
  await r.app.loadLevel(id);const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();
  const objects=g.dynamics.pushObjects,plates=g.dynamics.components.filter(c=>c.def?.kind==='pressure'),receiver=g.dynamics.components.find(c=>c.def?.kind==='momentum');
  // Lose every required object before solving. Recovery must return usable
  // cargo without retrying the course or killing the marble.
  g.update(1/hz);
  for(const [index,object]of objects.entries())g.physics.resetBall(object,g.ballPosition.clone().set(30+index*3,.8,30));
  const lost=new Set();r.input.override={x:0,y:0,brake:1};
  for(let frame=0;frame<hz*4.5;frame++){
   g.update(1/hz);for(const object of objects)if(object.capture().phase==='recovering')lost.add(object.id);
  }
  assert(!g.resetCount&&objects.every(o=>lost.has(o.id)&&o.capture().phase==='live'&&Math.hypot(o.body.translation().x-o.home.x,o.body.translation().z-o.home.z)<.1),`${id}/${hz}: lost cargo was not returned ready to use`);
  let stage=0,pushed=false,impact=0;
  const targets=id==='symbol-yard'?[[-3,7.5],[-3,-1],[0,6.8],[3,7.5],[3,-1],[0,3],[0,-12]]:[[0,-2],[3,2],[3,-3],[0,-12]];
  for(let frame=0;frame<hz*70&&g.state==='play';frame++){
   const p=g.ball.body.translation(),v=g.ball.body.linvel(),[tx,tz]=targets[stage];
   const cap=n=>Math.max(-1,Math.min(1,n)),vel=n=>Math.max(-5,Math.min(5,n*2));
   const ax=cap((vel(tx-p.x)-v.x)*.6),az=cap((vel(tz-p.z)-v.z)*.6);
   r.input.override={x:(ax-az)*Math.SQRT1_2,y:(-ax-az)*Math.SQRT1_2};g.update(1/hz);
   if(objects.some(o=>g.physics.touching(g.ball.collider,o.collider)))pushed=true;
   if(id==='symbol-yard'){
    if(stage===1){if(plates[0].stateOutputs().active&&objects[0].body.translation().z<.5)stage++}
    else if(stage===4){if(plates[1].stateOutputs().active&&objects[1].body.translation().z<.5)stage++}
    else if(stage<targets.length-1&&Math.hypot(tx-p.x,tz-p.z)<.4)stage++;
   }else{
    impact=Math.max(impact,receiver.capture().momentum);
    if(stage===0){if(receiver.stateOutputs().active)stage++}
    else if(stage<targets.length-1&&Math.hypot(tx-p.x,tz-p.z)<.4)stage++;
   }
   assert(!g.resetCount,`${id}/${hz}: route died`);
  }
  assert(g.state==='win'&&pushed,`${id}/${hz}: failed stage ${stage}, ball ${JSON.stringify(g.ballPosition)}, objects ${JSON.stringify(objects.map(o=>o.capture()))}, plates ${JSON.stringify(plates.map(p=>p.capture()))}, receiver ${JSON.stringify(receiver?.capture())}`);
  if(id==='symbol-yard')assert(plates.every(p=>p.stateOutputs().active),'Both objects must remain parked');
  else assert(impact>=receiver.def.threshold,'No physical momentum threshold crossing');
  const saved=structuredClone(g.checkpointSnapshot),restored={};
  assert(saved.checkpointId==='checkpoint-2','Object route did not reach final checkpoint');
  for(const c of g.dynamics.components){const reset=c.reset.bind(c);c.reset=s=>{restored[c.id]=structuredClone(s);reset(s)}}
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));g.ball.body.setGravityScale(1,true);r.input.override={x:0,y:0,brake:1};g.setState('play');
  for(let i=0;i<hz*3;i++)g.update(1/hz);
  assert(g.state==='play'&&g.resetCount===1,'Solved object puzzle failed to recover after death');
  for(const [key,value]of Object.entries(saved.groups.course.components))assert(JSON.stringify(value)===JSON.stringify(restored[key]),`Object checkpoint drift at ${key}`);
  routes.push({id,hz,lostObjectsRecovered:[...lost],solvedAfterRecovery:true,physicalPush:true,impact,objects:objects.map(o=>({token:o.def.token,position:o.body.translation()})),checkpointRestored:true});
  await r.app.returnToHub();assert(g.physics.disposed,'Object route retained its physics world');
 }
 return {routes};
})()
