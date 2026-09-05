import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalNetwork } from '../src/signals/SignalNetwork.ts';
import { validateSignalGraph } from '../src/signals/SignalGraph.ts';
const stateNode=id=>({id,inputs:{enable:'boolean',reset:'pulse'},outputs:{active:'boolean',activated:'pulse'}});
const link=(id,from,to,pulse=false)=>({id,source:{instanceId:from,port:pulse?'activated':'active'},target:{instanceId:to,port:pulse?'reset':'enable'}});

test('state propagation is queued, ordered and nonrecursive; pulses are never deduplicated',()=>{
  const bus=new SignalNetwork(['a','b','c'].map(stateNode),[link('second','a','c'),link('first','a','b'),link('pulse','b','c',true)]);
  const delivered=[];let inB=false;
  bus.register('b',(port,value)=>{inB=true;delivered.push(['b',port,value]);bus.emit('b','activated',null);bus.flush();inB=false});
  bus.register('c',(port,value)=>{assert.equal(inB,false);delivered.push(['c',port,value])});
  bus.emit('a','active',false);bus.emit('a','active',false);assert.equal(delivered.length,0);bus.flush();
  assert.deepEqual(delivered,[['b','enable',false],['c','enable',false],['c','reset',null]]);
  assert.equal(bus.trace[2].cause,bus.trace[0].sequence);
  bus.emit('b','activated',null);bus.emit('b','activated',null);bus.flush();
  assert.equal(delivered.filter(d=>d[1]==='reset').length,3);
  assert.throws(()=>bus.emit('a','active',null),/Invalid/);
  assert.throws(()=>bus.emit('a','activated',true),/Invalid/);
});

test('graphs reject unknown/mismatched ports, duplicate deliveries, ambiguous state writers and feedback',()=>{
  const nodes=['a','b','c'].map(stateNode);
  const rejected=(links,pattern)=>assert.ok(validateSignalGraph(nodes,links).some(i=>pattern.test(i.message)));
  rejected([{...link('x','a','b'),target:{instanceId:'b',port:'reset'}}],/mismatch/);
  rejected([link('x','missing','b')],/existing/);
  rejected([link('x','a','b'),link('y','a','b')],/Duplicate signal connection/);
  rejected([link('x','a','b'),link('y','c','b')],/one writer/);
  rejected([link('x','a','b'),link('y','b','a')],/feedback loop/);
  rejected([link('x','a','a',true)],/feedback loop/);
  assert.throws(()=>new SignalNetwork(nodes,[link('x','a','a')]),/feedback/);
});

test('checkpoint resynchronisation drops stale pulses and republishes even unchanged state',()=>{
  const bus=new SignalNetwork(['a','b'].map(stateNode),[link('state','a','b'),link('event','a','b',true)]);
  const values=[];bus.register('b',(port,value)=>values.push([port,value]));
  bus.emit('a','active',true);bus.flush();bus.emit('a','activated',null);
  bus.reset();bus.emit('a','active',true);bus.flush();
  assert.deepEqual(values,[['enable',true],['enable',true]]);
  assert.equal(bus.trace.length,1);
  bus.dispose();bus.emit('a','active',false);bus.flush();assert.equal(values.length,2);
});

test('excess pulse work stops at a bounded budget and can be cleared for retry',()=>{
  const bus=new SignalNetwork(['a','b'].map(stateNode),[link('event','a','b',true)]);
  let calls=0;bus.register('b',()=>calls++);
  for(let i=0;i<5000;i++)bus.emit('a','activated',null);
  bus.flush();assert.equal(calls,4096);assert.match(bus.fault,/per-step budget/);assert.ok(bus.trace.length<=128);
  bus.reset();bus.emit('a','activated',null);bus.flush();assert.equal(calls,4097);assert.equal(bus.fault,null);
  for(let i=0;i<9000;i++)bus.emit('a','activated',null);
  assert.match(bus.fault,/capacity/);bus.flush();assert.equal(calls,4097);
});

test('level loading validates both named and instance-local circuits before runtime creation',async()=>{
  const {loadLevelDocument}=await import('../src/content/Catalogue.ts');
  const {validateLevel}=await import('../src/content/validateLevel.ts');
  const d=loadLevelDocument('signal-crossing');
  assert.ok(validateLevel(d).document);
  d.signals[0].source.port='activated';
  assert.ok(validateLevel(d).issues.some(i=>i.message.includes('type mismatch')));
  d.signals=[];
  const control=d.instances.find(i=>i.type==='switch');
  control.links=[{output:'activated',target:{instanceId:control.id,input:'reset'}}];
  assert.ok(validateLevel(d).issues.some(i=>i.message.includes('feedback loop')));
  control.links=[{output:'active',target:{instanceId:'laser-005',input:'enable'}}];
  d.signals=[{id:'duplicate-power',source:{instanceId:control.id,port:'active'},target:{instanceId:'laser-005',port:'enable'}}];
  assert.ok(validateLevel(d).issues.some(i=>i.message.includes('Duplicate signal connection')));
});

test('inspection retains current input reasons after history eviction and owns detached data',()=>{
  const bus=new SignalNetwork(['a','b','c'].map(stateNode),[link('state','a','b'),link('event','a','c',true)]);
  bus.register('b',()=>{});bus.register('c',()=>{});
  bus.emit('a','active',true);bus.flush();
  for(let i=0;i<140;i++){bus.emit('a','activated',null);bus.flush()}
  const view=bus.inspect();
  assert.equal(view.trace.length,128);assert.equal(view.trace.some(e=>e.channel==='state'),false);
  assert.equal(view.inputs.find(e=>e.channel==='state').value,true);
  assert.equal(view.outputs.find(e=>e.source.instanceId==='a').value,true);
  view.inputs[0].source.instanceId='corrupt';view.outputs[0].value=false;view.trace.length=0;
  assert.equal(bus.inspect().inputs.find(e=>e.channel==='state').source.instanceId,'a');
  assert.equal(bus.inspect().outputs[0].value,true);assert.equal(bus.inspect().trace.length,128);
  bus.reset();assert.deepEqual(bus.inspect(),{outputs:[],inputs:[],trace:[],fault:null});
});
