(async()=>{
 const r=window.__retro,assert=(ok,message)=>{if(!ok)throw Error(message)},routes=[];
 for(const hz of [30,60,120]){
  await r.app.loadLevel('relay-works');const g=r.game;assert(g,'Mixed room load failed');r.debug.fixedDt=0;g.audio=null;g.restart();
  const bridge=g.dynamics.movingSurfaces.find(c=>c.def.kind==='bridge'),rotator=g.dynamics.movingSurfaces.find(c=>c.def.kind==='rotator');
  const contacts=new Map(),transfers=[],phases=new Set();let stage=0,lastSupport=null;
  for(let frame=0;frame<hz*50&&g.state==='play';frame++){
   const p=g.ball.body.translation(),v=g.ball.body.linvel();let tx=0,brake=0;
   if(stage===0&&p.x>-.5)stage=1;
   if(stage===1){brake=1;if(bridge.body.translation().x>7.95&&g.elapsed>11.8)stage=2}
   if(stage===2){tx=16;if(p.x>15.5&&g.physics.groundCollider?.handle===rotator.body.collider(0).handle)stage=3}
   if(stage===3){brake=1;if(g.elapsed>22.8)stage=4}
   if(stage===4)tx=33;
   const cap=x=>Math.max(-1,Math.min(1,x)),vel=x=>Math.max(-5,Math.min(5,x*2));
   const ax=brake?0:cap((vel(tx-p.x)-v.x)*.6),az=brake?0:cap((vel(-p.z)-v.z)*.6);
   r.input.override={x:(ax-az)*Math.SQRT1_2,y:(-ax-az)*Math.SQRT1_2,brake};g.update(1/hz);
   const component=[...g.dynamics.movingSurfaces,...g.dynamics.reactivePlates].find(c=>c.body.collider(0).handle===g.physics.groundCollider?.handle);
   const support=component?.def.kind??null;
   if(support){contacts.set(support,(contacts.get(support)??0)+1/hz);if(support!==lastSupport){transfers.push(support);lastSupport=support}}
   phases.add(g.dynamics.reactivePlates[0].capture().phase);
   assert(!g.resetCount,`Mixed/${hz}: fell at stage ${stage}, t=${g.elapsed}, pos=${JSON.stringify(p)}, contacts=${JSON.stringify([...contacts])}`);
  }
  assert(g.state==='win',`Mixed/${hz}: stalled at stage ${stage}, pos=${JSON.stringify(g.ball.body.translation())}`);
  for(const kind of ['conveyor','bridge','rotator','fragile'])assert(contacts.get(kind)>.1,`Mixed/${hz}: bypassed ${kind}`);
  assert(phases.has('warning'),'Mixed room did not load the retracting floor');
  const saved=structuredClone(g.checkpointSnapshot),restored={};assert(saved.checkpointId==='checkpoint-2','Far checkpoint missed');
  for(const c of g.dynamics.components){const reset=c.reset.bind(c);c.reset=s=>{restored[c.id]=structuredClone(s);reset(s)}}
  const completion=g.runTime;
  // Revisiting an already logged checkpoint must not downgrade the current
  // spawn or overwrite a later snapshot with unrelated mechanism state.
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-15,.6,0));g.ball.body.setGravityScale(1,true);g.setState('play');r.input.override={x:0,y:0,brake:1};
  for(let i=0;i<hz/3;i++)g.update(1/hz);
  assert(JSON.stringify(g.checkpointSnapshot)===JSON.stringify(saved),'Revisiting an earlier checkpoint downgraded the saved state');
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(0,-30,30));g.ball.body.setGravityScale(1,true);g.setState('play');r.input.override={x:0,y:0,brake:1};
  for(let i=0;i<hz*3;i++)g.update(1/hz);
  assert(g.state==='play'&&g.resetCount===1,'Mixed room death did not recover');
  for(const [id,state]of Object.entries(saved.groups.course.components))assert(JSON.stringify(restored[id])===JSON.stringify(state),`Mixed/${hz}: checkpoint lost ${id}`);
  assert(Math.abs(g.ballPosition.x-saved.spawn.x)<.1,'Mixed checkpoint unsafe');
  routes.push({hz,completionSeconds:completion,contacts:Object.fromEntries(contacts),transfers,phases:[...phases],checkpointRevisitPreserved:true,checkpointRestored:true});
  await r.app.returnToHub();assert(g.physics.disposed,'Mixed room leaked physics');
 }
 // Dynamic cargo must ride translated and rotating supports without the
 // marble-specific braking assistance. Its saved body state restores together
 // with the support clock through the actual checkpoint death path.
 const {documentFromLegacy}=await import(new URL('src/content/LevelDocument.ts',location.href).href),cargo=[];
 for(const kind of ['bridge','rotator'])for(const shape of ['cube','orb'])for(const hz of [30,60,120]){
  const d=documentFromLegacy({name:'Cargo transport audit',start:{x:-15,y:.6,z:2},pieces:[
   {kind:'slab',x:-15,y:0,z:0,w:8,d:10},
   {kind:'pushable',x:-15,y:0,z:-2,shape,token:'square',size:1.1,mass:1.2,recoveryDelay:1},
   {kind,x:0,y:0,z:0,w:12,d:12,...(kind==='bridge'?{dir:'+x',distance:4,period:14,dwell:3}:{angularSpeed:10})},
   {kind:'checkpoint',x:-15,y:0,z:2,id:1},{kind:'checkpoint',x:-12,y:0,z:2,id:2},{kind:'goal',x:-17,y:0,z:-3,w:1,d:1},
  ]},'cargo-transport');d.resetGroups[0].policy='checkpoint';for(const cp of d.checkpoints)cp.resetGroups=['course'];
  await r.app.loadDocument(d);const g=r.game;assert(g,'Cargo fixture rejected: '+document.querySelector('[aria-label="Course selection"]')?.textContent);r.debug.fixedDt=0;g.audio=null;g.restart();r.input.override={x:0,y:0,brake:1};g.update(1/hz);
  const object=g.dynamics.pushObjects[0],support=g.dynamics.movingSurfaces[0];
  g.physics.resetBall(object,g.ballPosition.clone().set(kind==='rotator'?2:0,.68,0));
  let touch=0,lowest=100;
  for(let i=0;i<hz*6;i++){g.update(1/hz);lowest=Math.min(lowest,object.body.translation().y);if(g.physics.touching(object.collider,support.body.collider(0)))touch++}
  const point=object.body.translation();
  assert(object.capture().phase==='live'&&lowest>.45&&touch>hz*5,`${kind}/${shape}/${hz}: lost supported cargo`);
  // An orb rolls relative to the deck; require transport, not glued contact.
  assert(kind==='bridge'?point.x>.5:Math.abs(point.z)>.25,`${kind}/${shape}/${hz}: support moved underneath stationary cargo`);
  // Enter a second checkpoint after cargo is in motion and bank the mixed state.
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-12,.6,2));g.update(1/hz);assert(g.checkpointSnapshot.checkpointId==='checkpoint-2','Cargo checkpoint not banked');const snapshot=structuredClone(g.checkpointSnapshot),restored={};
  for(const c of [object,support]){const reset=c.reset.bind(c);c.reset=state=>{restored[c.id]=structuredClone(state);reset(state)}}
  g.physics.resetBall(g.ball,g.ballPosition.clone().set(-30,-30,30));
  for(let i=0;i<hz*3;i++)g.update(1/hz);
  assert(g.resetCount===1&&g.state==='play','Mixed cargo checkpoint death failed');
  for(const c of [object,support])assert(JSON.stringify(restored[c.id])===JSON.stringify(snapshot.groups.course.components[c.id]),'Cargo and carrier did not restore the same checkpoint');
  cargo.push({kind,shape,hz,carriedTo:{...point},contactSeconds:touch/hz,lowest,checkpointRestored:true});await r.app.returnToHub();
 }
 return {routes,cargo};
})()
