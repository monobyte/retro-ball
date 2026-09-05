import { PARTS } from '../src/content/PartRegistry.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorModel, starterDocument } from '../src/editor/EditorModel.ts';
import { validateLevel } from '../src/content/validateLevel.ts';

const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), data }; };

test('editor edits are atomic, bounded by schemas, undoable and detached from play state', () => {
  const model = new EditorModel();
  const original = model.document;
  model.select(['slab-001']); model.move({x:1.4,y:0,z:0});
  assert.equal(model.document.instances[0].transform.position.x, 1);
  assert.equal(model.dirty, true);
  model.undo(); assert.deepEqual(model.document, original); assert.equal(model.dirty, false);
  model.redo(); assert.equal(model.document.instances[0].transform.position.x, 1);
  const beforeInvalid = model.document;
  assert.throws(()=>model.parameter('w',-1), /finite number/);
  assert.deepEqual(model.document,beforeInvalid);
  model.undo(); model.parameter('w',14); assert.equal(model.redoLabel,null);
  const play = model.playDocument(); play.spawn.x=999; play.instances.length=0;
  assert.equal(model.document.instances.length,2); assert.equal(model.document.spawn.x,0);
  model.move({x:30,y:0,z:0});
  const unsafe = model.document;
  assert.ok(model.issues.some(i=>i.path==='spawn'));
  assert.throws(()=>model.playDocument(), /floor/); assert.deepEqual(model.document,unsafe);
});

test('all registry parts can be authored and incomplete drafts never become playable', () => {
  const model = new EditorModel();
  model.select(model.document.instances.map(i=>i.id)); model.remove();
  assert.equal(model.document.instances.length,0);
  assert.ok(validateLevel(model.document,{draft:true}).document);
  assert.equal(validateLevel(model.document).document,null);
  for (const type of Object.keys(PARTS)) model.place(type,{x:0,y:0,z:0});
  assert.equal(model.document.instances.length,Object.keys(PARTS).length);
  model.select(model.document.instances.map(i=>i.id)); model.remove(); model.undo();
  assert.equal(model.document.instances.length,Object.keys(PARTS).length);
  assert.equal(model.document.checkpoints.length,1); assert.equal(model.document.objectives.length,1);
});

test('prefabs remap owned identities, checkpoint numbers, reset groups and route nodes', () => {
  const model = new EditorModel(); model.place('checkpoint',{x:0,y:0,z:1});
  const checkpointId = model.selection[0];
  model.edit('Author route', d => {
    d.resetGroups[0].policy='checkpoint'; d.checkpoints[0].resetGroups=['course'];
    d.navigation.nodes=[{id:'node-a',instanceId:'slab-001',position:{x:0,y:0,z:0}},{id:'node-b',instanceId:'slab-001',position:{x:0,y:0,z:1}}];
    d.navigation.links=[{from:'node-a',to:'node-b',traversal:'roll',bidirectional:true}];
  });
  model.select(['slab-001',checkpointId]);
  const prefab=model.createPrefab('Checkpoint island',{width:{instanceId:'slab-001',parameter:'w'}});
  const originalPrefab=structuredClone(prefab);
  model.insertPrefab(prefab,{x:20,y:2,z:0},{width:16});
  const d=model.document,copiedIds=model.selection;
  assert.equal(new Set(d.instances.map(i=>i.id)).size,d.instances.length);
  assert.equal(d.instances.find(i=>i.id===copiedIds[0]).parameters.w,16);
  assert.equal(d.checkpoints[1].spawn.x,20); assert.equal(d.checkpoints[1].spawn.y,2.6);
  assert.equal(d.instances.find(i=>i.id===d.checkpoints[1].instanceId).parameters.id,2);
  assert.notEqual(d.checkpoints[1].resetGroups[0],'course');
  assert.equal(d.navigation.nodes[2].instanceId,copiedIds[0]);
  assert.equal(d.navigation.links[1].from,d.navigation.nodes[2].id);
  assert.equal(d.navigation.links[1].to,d.navigation.nodes[3].id);
  assert.deepEqual(prefab,originalPrefab);
  model.undo(); model.redo(); assert.deepEqual(model.document,d);
  const before=model.document; assert.throws(()=>model.insertPrefab(prefab,{x:40,y:0,z:0},{width:-1})); assert.deepEqual(model.document,before);
  model.remove(); assert.equal(model.document.checkpoints.length,1); assert.equal(model.document.navigation.nodes.length,2);
});

test('group rotation moves checkpoint spawns and leaves local jump offsets local', () => {
  const model = new EditorModel(); model.place('checkpoint',{x:2,y:0,z:0});const cp=model.selection[0];
  model.place('jumppad',{x:0,y:0,z:2});const jump=model.selection[0];
  model.select(['slab-001',cp,jump]);model.rotate();
  const d=model.document;
  assert.deepEqual(d.checkpoints[0].spawn,{x:0,y:.6,z:-2});
  const j=d.instances.find(i=>i.id===jump);assert.equal(j.transform.yaw,90);
  assert.equal(j.parameters.targetZ,-10);assert.deepEqual(j.transform.position,{x:2,y:0,z:0});
});

test('autosave recovers geometric drafts; invalid imports and corrupt storage preserve unsaved work', () => {
  const local=storage(); const model=new EditorModel(starterDocument(),local);
  model.select(['slab-001']);model.move({x:40,y:0,z:0});const edited=model.document;
  const recovered=new EditorModel(starterDocument(),local);assert.equal(recovered.recover(),true);assert.deepEqual(recovered.document,edited);
  assert.throws(()=>model.importFile('{'),/valid JSON/);assert.deepEqual(model.document,edited);
  assert.throws(()=>model.importFile(JSON.stringify({...starterDocument(),schemaVersion:99})),/schema version/);
  assert.deepEqual(model.document,edited);
  local.setItem('retro-ball.editor-draft.v1','{"version":1,"document":{"instances":[]}}');
  assert.throws(()=>model.recover());assert.deepEqual(model.document,edited);
  const broken=new EditorModel(starterDocument(),{getItem:()=>null,setItem:()=>{throw new Error('Quota')}});
  broken.select(['slab-001']);broken.parameter('w',14);
  assert.equal(broken.document.instances[0].parameters.w,14);assert.match(broken.storageMessage,/Export/);
  const exported=broken.exportFile();assert.ok(validateLevel(JSON.parse(exported)).document);
  assert.equal(broken.dirty,true);broken.markExported();assert.equal(broken.dirty,false);
});

test('authoring validation identifies both overlapping floors and blocked void openings', () => {
  const model=new EditorModel();model.select(['slab-001']);model.duplicate({x:2,y:0,z:0});
  const copy=model.selection[0];
  assert.deepEqual(model.issues.find(i=>i.message.includes('Coplanar')).instanceIds,['slab-001',copy]);
  model.undo();model.place('void',{x:3,y:0,z:0});
  const issue=model.issues.find(i=>i.message.includes('do not cut holes'));
  assert.ok(issue);assert.ok(issue.instanceIds.includes('slab-001'));
  assert.throws(()=>model.playDocument(),/Partition/);
  model.undo();assert.ok(validateLevel(model.document).document);
});

test('signal authoring validates atomically, renames inline wires and restores them with undo',()=>{
  const model=new EditorModel();
  model.place('switch',{x:-3,y:0,z:2});const a=model.selection[0];
  model.place('logic',{x:3,y:0,z:2});const b=model.selection[0];
  model.place('logic',{x:3,y:0,z:-2});const c=model.selection[0];
  model.connectSignal({instanceId:a,port:'active'},{instanceId:b,port:'inputA'},'power');
  model.connectSignal({instanceId:b,port:'active'},{instanceId:c,port:'inputA'});
  const good=model.document;
  assert.throws(()=>model.connectSignal({instanceId:c,port:'active'},{instanceId:b,port:'inputB'}),/feedback/);
  assert.throws(()=>model.connectSignal({instanceId:a,port:'activated'},{instanceId:b,port:'inputB'}),/mismatch/);
  assert.throws(()=>model.renameSignal('power',good.signals[1].id),/Duplicate/);
  assert.deepEqual(model.document,good);
  model.disconnectSignal('power');assert.equal(model.document.signals.length,1);model.undo();assert.deepEqual(model.document,good);
  model.edit('Local wire',d=>{d.instances.find(i=>i.id===a).links.push({output:'active',target:{instanceId:c,input:'inputB'}})});
  const local=model.document,inline=`inline/${a}/0`;
  model.renameSignal(inline,'reset-pulse');assert.equal(model.document.instances.find(i=>i.id===a).links.length,0);
  assert.equal(model.document.signals.find(s=>s.id==='reset-pulse').target.port,'inputB');
  model.undo();assert.deepEqual(model.document,local);model.disconnectSignal(inline);
  assert.equal(model.document.instances.find(i=>i.id===a).links.length,0);model.undo();assert.deepEqual(model.document,local);
});

test('reset group edits preserve references, checkpoints, prefab remapping and undo',()=>{
  const model=new EditorModel();model.place('checkpoint',{x:0,y:0,z:1});const checkpoint=model.document.checkpoints[0];
  model.addResetGroup('puzzle');model.place('switch',{x:3,y:0,z:1});const control=model.selection[0];
  model.assignResetGroup('puzzle');model.setCheckpointGroup(checkpoint.id,'puzzle',true);
  const before=model.document;model.renameResetGroup('puzzle','circuit');
  assert.equal(model.document.instances.find(i=>i.id===control).resetGroup,'circuit');
  assert.deepEqual(model.document.checkpoints[0].resetGroups,['circuit']);
  const renamed=model.document;
  assert.throws(()=>model.renameResetGroup('circuit','course'),/Duplicate/);assert.deepEqual(model.document,renamed);
  assert.throws(()=>model.assignResetGroup('missing'),/reset group/i);assert.deepEqual(model.document,renamed);
  model.undo();assert.deepEqual(model.document,before);model.redo();
  model.select([checkpoint.instanceId,control]);const prefab=model.createPrefab('Puzzle',{});
  model.insertPrefab(prefab,{x:20,y:0,z:0});
  const pasted=model.document.instances.find(i=>model.selection.includes(i.id)&&i.type==='switch');
  assert.notEqual(pasted.resetGroup,'circuit');
  assert.ok(model.document.checkpoints.some(cp=>cp.resetGroups.includes(pasted.resetGroup)));
  model.undo();model.mergeResetGroup('circuit','course');
  assert.equal(model.document.instances.find(i=>i.id===control).resetGroup,'course');
  assert.deepEqual(model.document.checkpoints[0].resetGroups,['course']);
  assert.equal(model.document.resetGroups.length,1);model.undo();assert.deepEqual(model.document,renamed);
  model.setCheckpointGroup(checkpoint.id,'circuit',false);assert.deepEqual(model.document.checkpoints[0].resetGroups,[]);
});
