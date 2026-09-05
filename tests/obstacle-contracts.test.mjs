import test from 'node:test';
import assert from 'node:assert/strict';
import { obstacleBounds } from '../src/content/ObstacleBounds.ts';
import { loadLevelDocument } from '../src/content/Catalogue.ts';
import { resolveInstance } from '../src/content/LevelDocument.ts';
import { validateLevel } from '../src/content/validateLevel.ts';
import { EditorModel } from '../src/editor/EditorModel.ts';

test('legacy obstacle diagnostics cover sweeps, elevator column and authored jump landing',()=>{
  const doc=loadLevelDocument('legacy');
  for(const instance of doc.instances){
    const p=resolveInstance(instance),b=obstacleBounds(p);
    if(['slab','wall','ramp'].includes(p.kind)){assert.equal(b,null);continue}
    assert.ok(b&&Object.values(b).every(Number.isFinite),instance.id);
    assert.ok(b.minX<=b.maxX&&b.minY<=b.maxY&&b.minZ<=b.maxZ);
    if(p.kind==='jumppad')assert.ok(b.minX<=p.targetX-.5&&b.maxX>=p.targetX+.5&&b.minZ<=p.targetZ-.5&&b.maxZ>=p.targetZ+.5);
    if(p.kind==='elevator')assert.equal(b.minY,2*p.y0-p.y1-1);
  }
  const laser={kind:'laser',x:0,y:2,z:0,axis:'x',length:10,sweep:-3,speed:.1};
  assert.deepEqual(obstacleBounds(laser),{minX:-5.12,maxX:5.12,minZ:-3.12,maxZ:3.12,minY:2.38,maxY:2.62});
});

test('newly authored native obstacles use resettable clocks without rewriting the legacy document',()=>{
  const model=new EditorModel();
  for(const type of ['elevator','laser']){
    model.place(type,{x:20,y:0,z:0});
    assert.equal(model.document.instances.find(i=>i.id===model.selection[0]).parameters.clock,'resettable');
  }
  for(const i of loadLevelDocument('legacy').instances.filter(i=>['elevator','laser'].includes(i.type)))assert.equal(i.parameters.clock,undefined);
});

test('native timing bounds reject unsafe authored speeds before creating a world',()=>{
  for(const type of ['elevator','laser']){
    const d=loadLevelDocument('legacy'),part=d.instances.find(i=>i.type===type);
    if(type==='elevator'){part.parameters.period=.5;part.parameters.y1=20}
    else {part.parameters.sweep=20;part.parameters.speed=10}
    const result=validateLevel(d);assert.equal(result.document,null);
    assert.ok(result.issues.some(i=>i.message.includes('peak travel speed')));
  }
});
