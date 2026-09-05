import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics } from '../src/physics/Physics.ts';
import { loadLevelDocument } from '../src/content/Catalogue.ts';
import { validateLevel } from '../src/content/validateLevel.ts';

test('puzzle bodies have authored mass, tokens, actual contacts and collision-safe occupancy queries',async()=>{
 const physics=await Physics.create();
 try{
  physics.addStaticBox({center:new THREE.Vector3(0,-.5,0),size:new THREE.Vector3(20,1,20),quat:new THREE.Quaternion(),kind:'slab',surface:'standard',tone:'blue'});
  const plate=physics.createKinematicBox(new THREE.Vector3(0,.035,0),new THREE.Vector3(3,.07,3));
  const object=physics.createPushable(new THREE.Vector3(0,2,0),1.1,1.2,'cube','triangle');
  assert.equal(physics.token(object.body),'triangle');assert.ok(Math.abs(object.body.mass()-1.2)<1e-6);
  for(let i=0;i<240;i++)physics.update(1/120,()=>{});
  assert.ok(physics.contactBodies(plate.collider(0)).some(b=>b.handle===object.body.handle));
  const p=object.body.translation();
  assert.ok(physics.dynamicOverlap(new THREE.Vector3(p.x,p.y,p.z),new THREE.Vector3(1.2,1.2,1.2)));
  assert.equal(physics.occupied(new THREE.Vector3(5,.67,5),new THREE.Vector3(1.22,1.22,1.22)),false);
  assert.equal(physics.occupied(new THREE.Vector3(0,-.5,0),new THREE.Vector3(.2,.2,.2)),true,'Bodyless static colliders must count');
  object.body.setLinvel({x:8,y:0,z:0},true);physics.update(1/120,()=>{});
  assert.equal(physics.incomingVelocity(object.body).x,8,'Incoming velocity must precede collision/damping');
  object.body.setEnabled(false);physics.update(1/120,()=>{});
  assert.equal(physics.dynamicOverlap(new THREE.Vector3(p.x,p.y,p.z),new THREE.Vector3(2,2,2)),false);
  physics.removeBody(object.body);assert.equal(physics.puzzleTokens.size,0);assert.equal(physics.beforeStep.size,0);
 }finally{physics.dispose()}
});

test('object homes and symbol circuits validate before play and reject unrecoverable layouts',()=>{
 for(const id of ['symbol-yard','impulse-vault'])assert.ok(validateLevel(loadLevelDocument(id)).document);
 const d=loadLevelDocument('symbol-yard'),object=d.instances.find(i=>i.type==='pushable'),plate=d.instances.find(i=>i.type==='pressure');
 plate.parameters.match='square';assert.ok(validateLevel(d).issues.some(i=>i.message.includes('same symbol')));plate.parameters.match='triangle';
 object.transform.position={x:0,y:0,z:9};assert.ok(validateLevel(d).issues.some(i=>i.message.includes('clear of object home')));
 object.transform.position={x:0,y:0,z:-6};assert.ok(validateLevel(d).issues.some(i=>i.message.includes('recall must have')));
 object.transform.position={x:9,y:0,z:5};assert.ok(validateLevel(d).issues.some(i=>i.message.includes('full floor support')));
});
