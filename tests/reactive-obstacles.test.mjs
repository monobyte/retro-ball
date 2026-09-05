import test from 'node:test';
import assert from 'node:assert/strict';
import { FloorCycle } from '../src/game/mechanics/FloorCycle.ts';
import { movingBounds } from '../src/content/MovingBounds.ts';
import { loadLevelDocument } from '../src/content/Catalogue.ts';
import { resolveInstance } from '../src/content/LevelDocument.ts';
import { validateLevel } from '../src/content/validateLevel.ts';

test('recovering floor warns before withdrawing and cannot solidify through an occupied volume', () => {
  const floor=new FloorCycle(1.2,2.5);
  floor.tick(10,true);assert.equal(floor.state.phase,'solid');
  floor.touch();
  for(let i=0;i<143;i++){floor.tick(1/120,true);floor.touch()}
  assert.equal(floor.state.phase,'warning','continued contact must not restart countdown');
  floor.tick(1/120,true);assert.equal(floor.state.phase,'absent');
  for(let i=0;i<300;i++)floor.tick(1/120,true);
  assert.equal(floor.state.phase,'returning');
  for(let i=0;i<1200;i++)floor.tick(1/120,false);
  assert.equal(floor.state.phase,'returning','blocked return remains non-solid even after its timer');
  floor.tick(1/120,true);assert.equal(floor.state.phase,'solid');
  floor.touch();assert.equal(floor.state.phase,'warning','floor can be used again');
});

test('floor snapshots resume each phase and restarting clears an unfinished countdown', () => {
  for(const phase of ['solid','warning','absent','returning']){
    const a=new FloorCycle(1,2),b=new FloorCycle(1,2);
    a.reset({phase,elapsed:.4});b.reset(structuredClone(a.state));
    for(let i=0;i<50;i++){a.tick(1/120,true);b.tick(1/120,true)}
    assert.deepEqual(a.state,b.state);
  }
  const floor=new FloorCycle(1,2);floor.touch();floor.tick(.8,true);floor.reset();
  assert.deepEqual(floor.state,{phase:'solid',elapsed:0});
});

test('reactive sweeps include vertical tip/drop travel and transformed retract direction', () => {
  const seesaw=resolveInstance(loadLevelDocument('balance-act').instances.find(i=>i.type==='seesaw'));
  const b=movingBounds(seesaw);
  assert.ok(b.maxY>.58&&b.minY<-.85);
  const d=loadLevelDocument('borrowed-time'),retract=d.instances.find(i=>i.type==='fragile'&&i.parameters.mode==='retract');
  retract.transform.yaw=90;const p=resolveInstance(retract),s=movingBounds(p);
  assert.deepEqual([p.dir,p.w,p.d],['+x',8,4]);assert.equal(s.maxX,19.5);
  const drop=resolveInstance(d.instances.find(i=>i.type==='fragile'&&i.parameters.mode==='drop'));
  assert.equal(movingBounds(drop).minY,-3.4);
});

test('reactive validation rejects unsafe warnings, off-floor springs and obstructed travel', () => {
  const reject=(id,change,pattern)=>{const d=loadLevelDocument(id);change(d);const v=validateLevel(d);assert.equal(v.document,null);assert.ok(v.issues.some(i=>i.severity==='error'&&pattern.test(i.message)),JSON.stringify(v.issues))};
  reject('borrowed-time',d=>{d.instances[1].parameters.warning=.1},/finite number/);
  reject('spring-yard',d=>{d.instances.find(i=>i.type==='bumper').transform.position.x=40},/supported floor/);
  reject('spring-yard',d=>{d.spawn={x:0,y:.6,z:0}},/spring-contact clearance/);
  reject('balance-act',d=>{d.instances.push({id:'ceiling',type:'wall',transform:{position:{x:3,y:1.1,z:0},yaw:0},parameters:{w:1,d:1,h:1},resetGroup:'course',links:[]})},/sweep lacks/);
  reject('borrowed-time',d=>{d.instances.push({id:'retract-block',type:'wall',transform:{position:{x:6,y:0,z:9},yaw:0},parameters:{w:1,d:1,h:1},resetGroup:'course',links:[]})},/sweep lacks/);
});
