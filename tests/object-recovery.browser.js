(async()=>{
 const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)},probes=[];
 const {documentFromLegacy}=await import(new URL('src/content/LevelDocument.ts',location.href).href),{loadLevelDocument}=await import(new URL('src/content/Catalogue.ts',location.href).href);
 const prepare=async source=>{await(typeof source==='string'?r.app.loadLevel(source):r.app.loadDocument(source));const g=r.game;assert(g,'Fixture load failed: '+document.querySelector('[aria-label="Course selection"]')?.textContent);r.debug.fixedDt=0;g.audio=null;g.restart();r.input.override={x:0,y:0,brake:1};return g};
 const advance=(g,hz,seconds)=>{for(let i=0;i<Math.ceil(seconds*hz);i++)g.update(1/hz)};
 const teleport=(g,body,x,y,z)=>g.physics.resetBall(body,g.ballPosition.clone().set(x,y,z));
 const interact=(g,hz)=>{const code=r.input.settings.bindings.interact[0];window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));g.update(1/hz);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}))};
 for(const hz of [30,60,120]){
  const g=await prepare('symbol-yard'),object=g.dynamics.pushObjects[0],wrong=g.dynamics.pushObjects[1],plate=g.dynamics.components.find(c=>c.def?.kind==='pressure');advance(g,hz,.5);
  // Matching uses identity attached to the physical body, never its colour alone.
  teleport(g,g.ball,-3,.6,0);advance(g,hz,.3);assert(!plate.stateOutputs().active,'Marble impersonated a triangle token');
  teleport(g,g.ball,0,.6,10);teleport(g,wrong,-3,.7,0);advance(g,hz,.3);assert(!plate.stateOutputs().active,'Wrong symbol activated a matching plate');
  wrong.reset(null);teleport(g,object,-3,.7,0);advance(g,hz,.3);assert(plate.stateOutputs().active,'Matching object did not hold its plate');
  // A real fall, independently of player death, must bring the required object back.
  teleport(g,object,30,.8,30);let recovering=false,disabled=false;
  for(let i=0;i<hz*4;i++){g.update(1/hz);if(object.capture().phase==='recovering'){recovering=true;disabled ||= !object.body.isEnabled()}}
  assert(recovering&&disabled&&object.capture().phase==='live'&&object.body.translation().z>4.8,'Lost object did not automatically recover');
  assert(g.resetCount===0,'Object loss killed the player');
  // Recall a stranded object with the actual Interact action. The occupied home waits.
  teleport(g,object,6,.7,6);teleport(g,g.ball,-3,.6,5);g.update(1/hz);interact(g,hz);advance(g,hz,2.5);
  assert(object.capture().phase==='recovering'&&object.capture().remaining===0&&!object.body.isEnabled(),'Recall spawned an object through the waiting marble');
  const pending=structuredClone(object.capture());object.reset(null);object.reset(pending);assert(object.capture().phase==='recovering'&&!object.body.isEnabled(),'Pending recovery snapshot drift');
  teleport(g,g.ball,0,.6,10);advance(g,hz,.4);assert(object.capture().phase==='live','Clear recall volume did not resume');
  // Moving and static geometry also count; exclusion only removes the recalled body.
  teleport(g,object,6,.7,6);object.requestRecovery();
  const blocker=g.physics.createKinematicBox(object.home.clone(),g.ballPosition.clone().set(1.5,1.5,1.5));advance(g,hz,2.5);
  assert(object.capture().phase==='recovering','Recall ignored a kinematic obstruction');
  g.physics.removeBody(blocker);advance(g,hz,.4);assert(object.capture().phase==='live','Unblocked home failed to recover');
  // Doors share the dynamic-volume query and cannot close through a resonator.
  const door=g.dynamics.components.find(c=>c.def?.kind==='door');door.receiveSignal('enable',true);advance(g,hz,1.2);
  teleport(g,object,0,.67,-6);advance(g,hz,.2);door.receiveSignal('enable',false);advance(g,hz,2);
  assert(door.capture().amount>.8&&object.body.translation().y>.5,'Door crushed the puzzle object');
  object.reset(null);advance(g,hz,1.2);assert(door.capture().amount===0,'Door did not close after object cleared');
  probes.push({kind:'recovery',hz,matching:true,lostFall:true,keyboardRecall:true,occupiedHomeWaits:true,pendingSnapshot:true,kinematicClearance:true,doorSafe:true});
  await r.app.returnToHub();assert(g.physics.puzzleTokens.size===0,'Object identities survived disposal');
 }
 for(const hz of [30,60,120]){
  const g=await prepare('impulse-vault'),object=g.dynamics.pushObjects[0],receiver=g.dynamics.components.find(c=>c.def?.kind==='momentum');advance(g,hz,.2);
  // The marble has the speed, but not the required triangle identity.
  teleport(g,g.ball,0,.5,1.25);g.ball.body.setLinvel({x:0,y:0,z:-9},true);r.input.override={x:0,y:0};advance(g,hz,.3);
  assert(!receiver.stateOutputs().active,'Wrong actor activated the matched impact receiver');
  teleport(g,g.ball,4,.6,8);r.input.override={x:0,y:0,brake:1};advance(g,hz,.2);
  teleport(g,object,0,.57,1.35);object.body.setLinvel({x:0,y:0,z:-1.5},true);advance(g,hz,.3);
  const weak=receiver.capture().momentum;assert(weak>.1&&weak<receiver.def.threshold&&!receiver.stateOutputs().active,`Weak impact was not measured/rejected: ${weak}`);
  object.reset(null);advance(g,hz,.2);teleport(g,object,0,.57,1.7);object.body.setLinvel({x:0,y:0,z:-9},true);advance(g,hz,.3);
  const strong=receiver.capture().momentum;assert(strong>=receiver.def.threshold&&receiver.stateOutputs().active,`Strong impact failed: ${strong}`);
  const saved=structuredClone(receiver.capture());receiver.reset(null);receiver.reset(saved);assert(receiver.stateOutputs().active&&receiver.takePulses().length===0,'Receiver restore replayed its impact');
  probes.push({kind:'momentum',hz,wrongActorIgnored:true,weak,strong,snapshotNoReplay:true});await r.app.returnToHub();
 }
 const fixture=piece=>{
  const d=documentFromLegacy({name:'Object interactions',start:{x:-8,y:.6,z:2},pieces:[
   {kind:'slab',x:-8,y:0,z:0,w:6,d:8},
   {kind:'pushable',x:-8,y:0,z:-1,shape:'cube',token:'square',size:1.1,mass:1.2,recoveryDelay:1},
   {...piece,x:0,y:piece.kind==='seesaw'?.06:0,z:0},
   {kind:'checkpoint',x:-8,y:0,z:2,id:1},{kind:'goal',x:-9,y:0,z:-3,w:1,d:1},
  ]},'object-interaction');d.resetGroups[0].policy='checkpoint';d.checkpoints[0].resetGroups=['course'];return d;
 };
 for(const hz of [30,60,120]){
  const g=await prepare(fixture({kind:'fragile',w:10,d:8,mode:'drop',dir:'+z',warning:.8,recovery:1})),object=g.dynamics.pushObjects[0],plate=g.dynamics.reactivePlates[0];advance(g,hz,.2);
  teleport(g,object,0,.57,0);advance(g,hz,.2);object.body.setGravityScale(0,true);
  advance(g,hz,3);assert(plate.cycle.state.phase==='returning'&&!plate.body.collider(0).isEnabled(),'Returning floor materialised through an object');
  plate.receiveSignal('reset',null);advance(g,hz,.2);assert(!plate.body.collider(0).isEnabled(),'Signal reset bypassed occupied floor safety');
  object.reset(null);advance(g,hz,.4);assert(plate.cycle.state.phase==='solid','Floor did not recover after object left');
  probes.push({kind:'returning-floor',hz,objectTriggers:true,objectBlocksReturn:true,clearReturn:true});await r.app.returnToHub();
  const sg=await prepare(fixture({kind:'seesaw',w:10,d:8,axis:'z',maxTilt:6,response:3})),weight=sg.dynamics.pushObjects[0],seesaw=sg.dynamics.reactivePlates[0];advance(sg,hz,.2);
  teleport(sg,weight,2,.57,0);advance(sg,hz,3);const angle=seesaw.capture().angle;assert(angle<-.035,'Object weight did not load the seesaw');
  weight.reset(null);advance(sg,hz,4);assert(Math.abs(seesaw.capture().angle)<.002,'Seesaw retained removed object weight');
  probes.push({kind:'seesaw',hz,loadedAngle:angle,settled:true});await r.app.returnToHub();
  const cg=await prepare(fixture({kind:'conveyor',w:10,d:8,dir:'+x',speed:4,acceleration:12})),cargo=cg.dynamics.pushObjects[0];advance(cg,hz,.2);
  teleport(cg,cargo,0,.57,0);advance(cg,hz,.7);assert(cargo.body.translation().x>1,'Conveyor did not transport object cargo');
  probes.push({kind:'conveyor',hz,carriedToX:cargo.body.translation().x});await r.app.returnToHub();
 }
 // Bank an object on the checkpoint marker while the marble triggers from its rim.
 // The saved pose is valid, but the marble's central respawn must take precedence.
 for(const hz of [30,60,120]){
  const d=loadLevelDocument('symbol-yard'),cp=d.checkpoints[0];cp.spawn={x:0,y:.6,z:6};d.instances.find(i=>i.id===cp.instanceId).transform.position={x:0,y:0,z:6};
  const g=await prepare(d),object=g.dynamics.pushObjects[0];advance(g,hz,.2);
  teleport(g,object,0,.67,6);teleport(g,g.ball,1.2,.6,6);g.update(1/hz);
  assert(g.checkpointSnapshot.checkpointId===cp.id,'Unsafe-pose fixture did not bank checkpoint');
  teleport(g,g.ball,0,-15,30);advance(g,hz,3);
  assert(g.state==='play'&&g.resetCount===1&&Math.abs(g.ballPosition.x)<.1&&g.ballPosition.y>.45,'Saved object blocked marble respawn');
  assert(object.capture().phase==='live'&&Math.abs(object.body.translation().x+3)<.1,'Conflicting saved object was not recalled safely');
  probes.push({kind:'spawn-conflict',hz,marbleSafe:true,objectRecovered:true});await r.app.returnToHub();
 }
 const lower=loadLevelDocument('symbol-yard');
 const floor=structuredClone(lower.instances.find(i=>i.type==='slab'));floor.id='lower-floor';floor.transform.position.y=-12;floor.parameters.w=40;floor.parameters.d=40;lower.instances.push(floor);
 const lg=await prepare(lower),cargo=lg.dynamics.pushObjects[0];advance(lg,120,.2);
 teleport(lg,cargo,12,.67,0);advance(lg,120,2);
 assert(cargo.capture().phase==='live'&&cargo.body.translation().y<-10,'Legitimate lower-floor travel was mistaken for object loss');
 cargo.requestRecovery();advance(lg,120,2.5);assert(cargo.capture().phase==='live'&&cargo.body.translation().y>0,'Recall from a lower level failed');
 probes.push({kind:'multi-level',lowerLanding:true,homeRecall:true});await r.app.returnToHub();
 return {probes};
})()
