import test from 'node:test';
import assert from 'node:assert/strict';
import { shuttleFraction } from '../src/game/mechanics/Motion.ts';
import { movingBounds, sweepOverlaps } from '../src/content/MovingBounds.ts';
import { loadLevelDocument } from '../src/content/Catalogue.ts';
import { resolveInstance } from '../src/content/LevelDocument.ts';
import { validateLevel } from '../src/content/validateLevel.ts';

test('shuttle has stationary docks, smooth reversible travel and stable cycle wrapping', () => {
  for (const t of [0, 1, 3, 12, 25]) assert.equal(shuttleFraction(t, 12, 3), 0);
  for (const t of [6, 7, 9, 18]) assert.equal(shuttleFraction(t, 12, 3), 1);
  assert.equal(shuttleFraction(4.5, 12, 3), .5);
  assert.equal(shuttleFraction(10.5, 12, 3), .5);
  assert.equal(shuttleFraction(-1.5, 12, 3), .5);
  for (let t=0; t<24; t+=.01) {
    const x=shuttleFraction(t,12,3);
    assert.ok(x>=0&&x<=1);
    assert.ok(Math.abs(x-shuttleFraction(t+12,12,3))<1e-12);
  }
  assert.ok(shuttleFraction(3.001,12,3)<1e-6);
  assert.ok(1-shuttleFraction(6-.001,12,3)<1e-6);
});

test('moving footprints rotate with local directions and cover both shuttle docks', () => {
  const doc=loadLevelDocument('shuttle-bay'), i=doc.instances.find(i=>i.type==='bridge');
  i.transform.yaw=90;
  const p=resolveInstance(i), b=movingBounds(p);
  assert.deepEqual([p.dir,p.w,p.d],['-z',8,6]);
  assert.deepEqual([b.minX,b.maxX,b.minZ,b.maxZ],[-3,5,-11,3]);
  const rotor=resolveInstance(loadLevelDocument('spin-crossing').instances.find(i=>i.type==='rotator'));
  assert.ok(sweepOverlaps(rotor,{x:0,z:6,w:1,d:1}));
  assert.equal(sweepOverlaps(rotor,{x:7.1,z:7.1,w:.2,d:.2}),false,'outside actual swept disk, inside its bounding square');
});

test('moving parts reject impossible timing, excessive speed and obstructed sweeps', () => {
  const reject=(id,edit,pattern)=>{
    const d=loadLevelDocument(id);edit(d);
    const result=validateLevel(d);
    assert.equal(result.document,null);
    assert.ok(result.issues.some(i=>i.severity==='error'&&pattern.test(i.message)),JSON.stringify(result.issues));
  };
  reject('shuttle-bay',d=>{d.instances[1].parameters.dwell=6},/Waiting/);
  reject('shuttle-bay',d=>{Object.assign(d.instances[1].parameters,{distance:100,period:7,dwell:3})},/speed/);
  reject('spin-crossing',d=>{d.instances[1].parameters.angularSpeed=0},/nonzero/);
  reject('spin-crossing',d=>{Object.assign(d.instances[1].parameters,{angularSpeed:90,w:100})},/corner speed/);
  reject('shuttle-bay',d=>{d.instances.push({id:'blocked-dock',type:'wall',transform:{position:{x:9,y:0,z:0},yaw:0},parameters:{w:1,d:1,h:2},resetGroup:'course',links:[]})},/clearance from wall/);
  reject('shuttle-bay',d=>{d.instances[2].transform.position.x=16},/coplanar floor/);
  for(const id of ['conveyor-run','shuttle-bay','spin-crossing']) assert.ok(validateLevel(loadLevelDocument(id)).document);
});
