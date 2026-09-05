import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderedSequence, PressureAction, combineInputs } from '../src/signals/PuzzleLogic.ts';
import { loadLevelDocument, validateCatalogue, CATALOGUE } from '../src/content/Catalogue.ts';
import { validateLevel } from '../src/content/validateLevel.ts';

test('AND / OR require distinct inputs and implement the complete truth table',()=>{
 for(const a of [false,true])for(const b of [false,true]){
  assert.equal(combineInputs('and',a,b),Number(a)+Number(b)===2);
  assert.equal(combineInputs('or',a,b),Number(a)+Number(b)>0);
 }
});
test('sequence handles wrong order, restart, timeout, latched completion and silent checkpoint restore',()=>{
 const s=new OrderedSequence(2),press=n=>s.receive(`step${n}`,null);
 press(2);assert.equal(s.progress,0);
 press(1);press(3);assert.equal(s.progress,0);
 press(1);press(2);press(1);assert.equal(s.progress,1);
 s.update(2);assert.equal(s.progress,0);
 press(1);s.update(.5);const saved=s.capture();
 s.reset();s.reset(saved);assert.deepEqual(s.capture(),saved);assert.equal(s.takeCompleted(),false);
 press(2);press(3);assert.equal(s.active,true);assert.equal(s.takeCompleted(),true);assert.equal(s.takeCompleted(),false);
 press(1);s.update(90);assert.equal(s.active,true);assert.equal(s.takeCompleted(),false);
 const complete=s.capture();s.reset();s.reset(complete);assert.equal(s.active,true);assert.equal(s.takeCompleted(),false);
 s.receive('reset',null);assert.equal(s.active,false);
});
test('physical pressure actions debounce contact chatter and never retrigger a held toggle/timer',()=>{
 for(const mode of ['hold','toggle','timed']){
  const p=new PressureAction(mode,1);
  p.update(true,.01);assert.equal(p.active,true);assert.equal(p.takeActivated(),true);
  p.update(false,.01);p.update(true,.01);assert.equal(p.takeActivated(),false);assert.equal(p.active,true);
  for(let i=0;i<150;i++)p.update(true,.01);
  assert.equal(p.active,mode!=='timed');assert.equal(p.takeActivated(),false);
  const saved=p.capture();p.reset();p.reset(saved);assert.deepEqual(p.capture(),saved);assert.equal(p.takeActivated(),false);
  p.update(false,.1);if(mode==='hold')assert.equal(p.active,false);
  p.update(true,.01);assert.equal(p.active,mode!=='toggle');assert.equal(p.takeActivated(),true);
 }
});
test('authored puzzle rooms validate; doors reject unsupported travel, blocked lifts and unsafe checkpoint spawns',()=>{
 assert.deepEqual(validateCatalogue(CATALOGUE),[]);
 for(const id of ['two-factor','ordered-garden'])assert.ok(validateLevel(loadLevelDocument(id)).document);
 const d=loadLevelDocument('two-factor'),door=d.instances.find(i=>i.type==='door');
 d.checkpoints[0].spawn={x:0,y:.6,z:door.transform.position.z};
 assert.ok(validateLevel(d).issues.some(i=>i.message.includes('complete travel')));
 d.checkpoints[0].spawn={x:0,y:.6,z:8};
 const ceiling=structuredClone(d.instances[0]);ceiling.id='ceiling';ceiling.transform.position.y=4;d.instances.push(ceiling);
 assert.ok(validateLevel(d).issues.some(i=>i.message.includes('Door travel intersects')));
 d.instances.pop();door.transform.position.x=12;
 assert.ok(validateLevel(d).issues.some(i=>i.message.includes('full circuit footprint')));
});
