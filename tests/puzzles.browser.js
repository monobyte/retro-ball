(async()=>{
 const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)},routes=[],probes=[];
 const {documentFromLegacy}=await import(new URL('src/content/LevelDocument.ts',location.href).href);
 const prepare=async source=>{await(typeof source==='string'?r.app.loadLevel(source):r.app.loadDocument(source));const g=r.game;assert(g,'Puzzle fixture failed to load');r.debug.fixedDt=0;g.audio=null;g.restart();return g};
 const advance=(g,hz,seconds)=>{for(let i=0;i<Math.ceil(hz*seconds);i++)g.update(1/hz)};
 const interact=(g,hz)=>{const code=r.input.settings.bindings.interact[0];window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));g.update(1/hz);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}))};
 for(const id of ['two-factor','ordered-garden'])for(const hz of [30,60,120]){
  const g=await prepare(id),door=g.dynamics.components.find(c=>c.def?.kind==='door'),logic=g.dynamics.components.find(c=>['logic','sequence'].includes(c.def?.kind));
  const targets=id==='two-factor'?[[-3,6,true],[0,3,false],[0,-9,false]]:[[3,5,true],[-3,5,true],[0,0,true],[0,-9,false]];
  let stage=0,presses=0,opened=false;
  for(let frame=0;frame<hz*45&&g.state==='play';frame++){
   const p=g.ball.body.translation(),v=g.ball.body.linvel(),[tx,tz,press]=targets[stage];
   const cap=x=>Math.max(-1,Math.min(1,x)),vel=x=>Math.max(-5,Math.min(5,x*2.2));
   const ax=cap((vel(tx-p.x)-v.x)*.6),az=cap((vel(tz-p.z)-v.z)*.6);
   r.input.override={x:(ax-az)*Math.SQRT1_2,y:(-ax-az)*Math.SQRT1_2};
   if(stage<targets.length-1&&Math.hypot(tx-p.x,tz-p.z)<.65){
    if(press){interact(g,hz);presses++}
    stage++;
   }
   g.update(1/hz);if(door.capture().amount>.99)opened=true;
   assert(!g.resetCount,`${id}/${hz}: route died`);
  }
  assert(g.state==='win'&&opened,`${id}/${hz}: no complete route; stage ${stage}, ball ${JSON.stringify(g.ball.body.translation())}, logic ${JSON.stringify(logic.capture())}, door ${JSON.stringify(door.capture())}`);
  const completion=g.runTime,trace=structuredClone(g.dynamics.signals.trace),checkpoint=structuredClone(g.checkpointSnapshot);
  assert(checkpoint.checkpointId==='checkpoint-2','Final puzzle checkpoint missing');
  const restored={},original=new Map();
  for(const c of g.dynamics.components){original.set(c,c.reset.bind(c));c.reset=state=>{restored[c.id]=structuredClone(state);original.get(c)(state)}}
  // Leave the goal before resuming play, then deliberately lose the marble.
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));g.ball.body.setGravityScale(1,true);r.input.override={x:0,y:0,brake:1};g.setState('play');advance(g,hz,3);
  assert(g.resetCount===1&&g.state==='play',`${id}/${hz}: checkpoint death recovery failed`);
  for(const [key,value]of Object.entries(checkpoint.groups.course.components))assert(JSON.stringify(restored[key])===JSON.stringify(value),`${id}/${hz}: logical checkpoint drift at ${key}`);
  assert(Math.abs(g.ballPosition.z-checkpoint.spawn.z)<.1,'Recovered inside a blocked doorway');
  for(const c of g.dynamics.components)c.reset=original.get(c);
  g.restart();assert(!logic.stateOutputs().active&&door.capture().amount===0,'Retry retained puzzle solution');
  routes.push({id,hz,completionSeconds:completion,keyboardPresses:presses,trace,checkpointRestored:true,retryCleared:true});
  await r.app.returnToHub();assert(g.physics.disposed,'Puzzle world survived unload');
 }
 const fixture=(mode='hold')=>{
  const d=documentFromLegacy({name:'Pressure and door probe',start:{x:-5,y:.6,z:5},pieces:[
   {kind:'slab',x:0,y:0,z:0,w:18,d:18},
   {kind:'pressure',x:-3,y:0,z:0,w:3,d:3,mode,duration:1},
   {kind:'door',x:3,y:0,z:0,w:4,d:.6,h:2.4,travelTime:.8,initial:'closed'},
   {kind:'checkpoint',x:-5,y:0,z:5,id:1},
   {kind:'goal',x:6,y:0,z:-6,w:2,d:2},
  ]},'pressure-probe');d.resetGroups[0].policy='checkpoint';d.checkpoints[0].resetGroups=['course'];
  d.signals=[{id:'weight',source:{instanceId:d.instances[1].id,port:'active'},target:{instanceId:d.instances[2].id,port:'enable'}}];return d;
 };
 for(const mode of ['hold','toggle','timed'])for(const hz of [30,60,120]){
  const g=await prepare(fixture(mode)),plate=g.dynamics.components.find(c=>c.def?.kind==='pressure'),door=g.dynamics.components.find(c=>c.def?.kind==='door');
  r.input.override={x:0,y:0,brake:1};advance(g,hz,.5);
  assert(!plate.stateOutputs().active,'Unoccupied plate activated');
  // Hovering inside the horizontal footprint is not contact.
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-3,2,0));g.ball.body.setGravityScale(0,true);advance(g,hz,.2);
  assert(!plate.stateOutputs().active,'Airborne marble counted as weight');
  g.ball.body.setGravityScale(1,true);advance(g,hz,2);
  assert(plate.action.held,`Pressure ${mode}/${hz}: actual solver contact missing`);
  assert(plate.stateOutputs().active===(mode!=='timed'),`Pressure ${mode}/${hz}: held action retriggered or wrong state`);
  const saved=structuredClone(plate.capture());plate.reset(null);plate.reset(saved);assert(JSON.stringify(saved)===JSON.stringify(plate.capture()),'Pressure snapshot drift');
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-5,.6,5));advance(g,hz,.3);
  if(mode==='hold')assert(!plate.stateOutputs().active,'Hold plate did not release');
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-3,.6,0));advance(g,hz,.3);
  assert(plate.stateOutputs().active===(mode!=='toggle'),'Second contact did not re-arm action');
  probes.push({kind:'pressure',mode,hz,airborneIgnored:true,realContact:true,snapshot:true,heldNoRetrigger:true,secondEntry:true});
  await r.app.returnToHub();
 }
 for(const hz of [30,60,120]){
  const d=fixture();d.signals=[];const g=await prepare(d),door=g.dynamics.components.find(c=>c.def?.kind==='door');
  r.input.override={x:0,y:0,brake:1};advance(g,hz,.2);
  // Push against the closed front: opening must still work.
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(3,.5,.81));advance(g,hz,.2);
  door.receiveSignal('enable',true);advance(g,hz,1.2);assert(door.capture().amount===1,`Door/${hz}: side contact blocked opening`);
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(3,.5,0));advance(g,hz,.2);
  door.receiveSignal('enable',false);advance(g,hz,2);
  const held=door.capture().amount;assert(held>.65&&held<1,`Door/${hz}: failed safe closing stop: ${held}`);
  assert(g.ballPosition.y>.45&&!g.resetCount,'Closing door crushed the marble');
  const saved=structuredClone(door.capture());door.reset(null);door.reset(saved);assert(JSON.stringify(saved)===JSON.stringify(door.capture()),'Door checkpoint pose drift');
  // Reset signal requests closure through the same clearance path.
  door.receiveSignal('reset',null);advance(g,hz,.5);assert(Math.abs(door.capture().amount-held)<.02,'Reset bypassed door safety');
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-5,.6,5));advance(g,hz,1.2);assert(door.capture().amount===0,'Door did not resume closing after clearance');
  probes.push({kind:'door',hz,sideContactOpening:true,stoppedAt:held,marbleSafe:true,snapshot:true,resetSafe:true,resumed:true});
  await r.app.returnToHub();assert(g.physics.disposed,'Door body survived unload');
 }
 // OR gate uses the same authored ports; either input can keep the door open.
 const {loadLevelDocument}=await import(new URL('src/content/Catalogue.ts',location.href).href);
 const or=loadLevelDocument('two-factor');or.instances.find(i=>i.type==='logic').parameters.operation='or';
 const og=await prepare(or),gate=og.dynamics.components.find(c=>c.def?.kind==='logic'),od=og.dynamics.components.find(c=>c.def?.kind==='door');
 const source=og.dynamics.switches[0];source.interact();advance(og,120,1);
 assert(gate.stateOutputs().active&&od.capture().amount===1,'OR first input did not open door');
 source.interact();advance(og,120,1);assert(!gate.stateOutputs().active&&od.capture().amount===0,'OR released input stayed latched');
 og.physics.resetBall(og.ball,og.ballPosition.clone().set(0,.6,3));r.input.override={x:0,y:0,brake:1};advance(og,120,1.2);
 assert(gate.stateOutputs().active&&od.capture().amount===1,'OR second input did not open door');
 await r.app.returnToHub();
 // A checkpoint between answers 2 and 3 must preserve a partial sequence, not
 // accidentally replay its completion pulse or bank a later solved state.
 for(const hz of [30,60,120]){
  const d=loadLevelDocument('ordered-garden'),cp=d.checkpoints[0];
  cp.spawn={x:-2,y:.6,z:3};d.instances.find(i=>i.id===cp.instanceId).transform.position={x:-2,y:0,z:3};
  const g=await prepare(d),sequence=g.dynamics.components.find(c=>c.def?.kind==='sequence');
  r.input.override={x:0,y:0,brake:1};
  const pressAt=(x,z)=>{g.physics.resetBall(g.ball,g.ballPosition.clone().set(x,.6,z));g.update(1/hz);interact(g,hz)};
  pressAt(-3,5);assert(sequence.sequence.progress===0,'Wrong first answer advanced sequence');
  pressAt(3,5);pressAt(0,0);assert(sequence.sequence.progress===0,'Wrong third answer did not clear progress');
  pressAt(3,5);pressAt(-3,5);assert(sequence.sequence.progress===2,'Correct partial sequence missing');
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-2,.6,3));g.update(1/hz);
  const snapshot=structuredClone(g.checkpointSnapshot);assert(snapshot.groups.course.components[sequence.id].progress===2,'Checkpoint did not bank partial sequence');
  pressAt(0,0);assert(sequence.stateOutputs().active,'Third answer did not solve');
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-15,30));advance(g,hz,3);
  assert(g.state==='play'&&g.resetCount===1&&sequence.sequence.progress===2,'Death did not restore partial sequence');
  assert(!g.dynamics.signals.trace.some(e=>e.source.port==='completed'),'Restore fabricated a completion event');
  pressAt(0,0);assert(sequence.stateOutputs().active,'Restored sequence could not be finished');
  sequence.receiveSignal('reset',null);pressAt(3,5);advance(g,hz,20.1);assert(sequence.sequence.progress===0,'Runtime timeout failed');
  probes.push({kind:'sequence',hz,wrongOrderCleared:true,partialCheckpointRestored:true,restoredSolutionCompletes:true,timeout:true});
  await r.app.returnToHub();
 }
 return {routes,probes,or:'Each input independently opens and releases the physical door'};
})()
