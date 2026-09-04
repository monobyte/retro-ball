import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const session=process.env.BROWSER_SESSION??'retro-editor-check', output=process.env.EVIDENCE_DIR??'/tmp/retro-editor-checks';
mkdirSync(output,{recursive:true});
function browser(args,input){const r=spawnSync('agent-browser',['--session',session,...args],{input,encoding:'utf8',timeout:120000});if(r.error||r.status!==0)throw new Error(r.error?.message??r.stderr+r.stdout);return r.stdout;}
const evaluate=script=>JSON.parse(browser(['eval','--stdin'],script));
const click=label=>evaluate(`(async()=>{const b=[...document.querySelectorAll('.editor button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b)throw Error('Missing button');for(let a=b.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;b.scrollIntoView({block:'nearest'});b.click();await new Promise(requestAnimationFrame);return true})()`);
const change=(label,value)=>evaluate(`(async()=>{const e=document.querySelector('.editor [aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!e)throw Error('Missing field');for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'nearest'});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(requestAnimationFrame);return true})()`);
const selectPart=(id,shift=false)=>evaluate(`(async()=>{const p=document.querySelector('[data-instance="${id}"]');p.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:${shift},bubbles:true}));await new Promise(requestAnimationFrame);return true})()`);
const assert=(script,message)=>evaluate(`(()=>{if(!(${script}))throw Error(${JSON.stringify(message)});return true})()`);
function point(x,z){return evaluate(`(()=>{const s=document.querySelector('.editor-canvas');const p=new DOMPoint(${x},${z}).matrixTransform(s.getScreenCTM());return {x:Math.round(p.x),y:Math.round(p.y)}})()`);}
function pointer(x,z){const p=point(x,z);browser(['mouse','move',String(p.x),String(p.y)]);browser(['mouse','down']);browser(['mouse','up']);}
console.log(browser(['open',process.env.GAME_URL??'http://127.0.0.1:5173/retro-ball/']));
browser(['set','viewport','1280','800','1']);browser(['wait','--fn','!!window.__retro']);
evaluate("(()=>{localStorage.removeItem('retro-ball.editor-draft.v1');localStorage.removeItem('retro-ball.editor-prefabs.v1');return true})()");
browser(['scrollintoview','[data-editor-open]']);browser(['click','[data-editor-open]']);browser(['wait','--fn',"__retro.app.state==='editor'"]);
assert("__retro.app.state==='editor'&&!__retro.app.session",'Editor retained a running simulation');
click('New');
// Enlarge the starting floor through the typed inspector, then add a second floor.
selectPart('slab-001');change('w',18);
browser(['click','[data-part=slab]']);pointer(12,0);click('Select');
const second=evaluate('__retro.app.editor.model.selection[0]');
change('w',6);change('d',12);click('Fit course');
assert("__retro.app.editor.model.issues.every(i=>i.severity!=='error')",'Authored floor join failed validation');
click('Undo');click('Redo');
assert(`__retro.app.editor.model.document.instances.find(i=>i.id==='${second}').parameters.d===12`,'Redo lost dimensions');
// Make a reusable floor section and expose its width.
change('Prefab name','Landing tile');
evaluate(`(()=>{const c=document.querySelector('[data-expose-id="${second}"][data-expose-key="w"]');c.checked=true;return true})()`);
click('Save prefab');change(`${second}.w`,8);click('Place prefab');pointer(19,0);click('Select');
const third=evaluate('__retro.app.editor.model.selection[0]');click('Fit course');
assert(`'${second}'!=='${third}'`,'Prefab reused an instance ID');
assert(`__retro.app.editor.model.document.instances.find(i=>i.id==='${third}').parameters.w===8`,'Exposed prefab width was ignored');
change('Position x',17);
evaluate(`(()=>{const b=[...document.querySelectorAll('.editor-issue')].find(b=>b.textContent.includes('Coplanar floor overlap'));if(!b)throw Error('Missing overlap report');b.click();return true})()`);
assert(`__retro.app.editor.model.selection.length===2&&__retro.app.editor.model.selection.includes('${second}')&&__retro.app.editor.model.selection.includes('${third}')`,'Overlap report did not select the offending pair');
assert(`document.querySelector('[data-instance="${third}"] rect').getAttribute('stroke')==='#ff557c'`,'Overlap not highlighted on canvas');
click('Undo');
// Move the goal to the end of the authored course and add a checkpoint.
selectPart('goal-002');change('Position x',19);change('Position z',0);change('Spawn z',0);
browser(['click','[data-part=checkpoint]']);pointer(12,0);click('Select');
const checkpoint=evaluate('__retro.app.editor.model.selection[0]');
assert('__retro.app.editor.model.document.checkpoints.length===1','Checkpoint policy missing');
// Exercise a genuine pointer drag and its one-command undo.
selectPart(third);const from=point(18,2),to=point(18,4);
browser(['mouse','move',String(from.x),String(from.y)]);browser(['mouse','down']);browser(['mouse','move',String(to.x),String(to.y)]);browser(['mouse','up']);
click('Undo');assert(`__retro.app.editor.model.document.instances.find(i=>i.id==='${third}').transform.position.z===0`,'Pointer move undo did not restore floor');
// Group transform commands include elevation and retain their exact undo state.
selectPart('slab-001');selectPart(second,true);click('Rotate 90°');
assert(`__retro.app.editor.model.document.instances.find(i=>i.id==='${second}').transform.position.z===-12`,'Group rotation did not rotate selected positions');
selectPart('slab-001');selectPart(second,true);change('Position y',1);
assert(`__retro.app.editor.model.document.instances.find(i=>i.id==='${second}').transform.position.y===1`,'Group elevation failed');
click('Undo');click('Undo');
selectPart(checkpoint);click('Add camera zone');
assert('__retro.app.editor.model.document.cameraZones.length===1','Camera authoring failed');
// Export is triggered via the same UI as a player; read the prepared Blob as evidence.
click('Export');
const exported=await evaluate('(async()=>await(await fetch(__retro.app.editor.downloadUrl)).text())()');
writeFileSync(`${output}/authored-course.json`,exported);
const stable=evaluate('JSON.stringify(__retro.app.editor.model.document)');
// Invalid import invokes the File input handler and leaves saved and unsaved state intact.
evaluate(`(()=>{const f=new File(['{"schemaVersion":999}'],'invalid.json',{type:'application/json'});const dt=new DataTransfer();dt.items.add(f);const input=document.querySelector('[data-editor-import]');input.files=dt.files;input.dispatchEvent(new Event('change'));return true})()`);
browser(['wait','--fn',"document.querySelector('.editor [role=status]').textContent.includes('schema version')"]);
assert(`JSON.stringify(__retro.app.editor.model.document)===${JSON.stringify(stable)}`,'Invalid import replaced the document');
// Failed play from a moved unsupported checkpoint does not unload the draft.
selectPart(checkpoint);change('Checkpoint spawn x',500);change('Play start',evaluate('__retro.app.editor.model.document.checkpoints[0].id'));click('Play test');
assert("__retro.app.state==='editor'&&!__retro.app.session&&__retro.app.editor.model.dirty",'Failed play discarded unsaved editor state');
click('Undo');change('Play start','spawn');
const beforePlay=evaluate('JSON.stringify(__retro.app.editor.model.document)');
click('Play test');browser(['wait','--fn',"__retro.app.state==='intro'"]);browser(['press','Space']);
// Drive the course with existing game input at fixed physics cadence.
const completion=evaluate(`(()=>{const r=__retro,g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();r.input.override={x:Math.SQRT1_2,y:-Math.SQRT1_2};for(let i=0;i<3600&&g.state!=='win';i++)g.update(1/120);if(g.state!=='win'||g.resetCount!==0)throw Error('Authored course is not playable');return {state:g.state,resets:g.resetCount,time:g.runTime}})()`);
browser(['click','.runtime-toolbar button:last-child']);browser(['wait','--fn',"__retro.app.state==='editor'"]);
assert(`JSON.stringify(__retro.app.editor.model.document)===${JSON.stringify(beforePlay)}`,'Play changed the editor document');
assert('__retro.app.session===null','Return to editing retained physics/audio session');
// Checkpoint and selection start flows.
for(const start of [evaluate('__retro.app.editor.model.document.checkpoints[0].id'),'selection']){
  selectPart(second);change('Play start',start);click('Play test');browser(['wait','--fn',"__retro.app.state==='intro'"]);
  assert('__retro.game.ballPosition.x===12','Custom play start ignored selected/checkpoint position');
  browser(['click','.runtime-toolbar button:last-child']);browser(['wait','--fn',"__retro.app.state==='editor'"]);
}
// Reload the actual page and recover the same draft and prefab library.
browser(['reload']);browser(['wait','--fn','!!window.__retro']);browser(['scrollintoview','[data-editor-open]']);browser(['click','[data-editor-open]']);browser(['wait','--fn',"__retro.app.state==='editor'"]);
assert(`JSON.stringify(__retro.app.editor.model.document)===${JSON.stringify(beforePlay)}`,'Reload recovery changed the authored course');
assert('__retro.app.editor.prefabs.length>=1','Prefab library did not persist');
// Valid import replaces the draft through the file handler; undo restores the previous one.
click('New');
evaluate(`(()=>{const f=new File([${JSON.stringify(exported)}],'course.json',{type:'application/json'});const dt=new DataTransfer();dt.items.add(f);const input=document.querySelector('[data-editor-import]');input.files=dt.files;input.dispatchEvent(new Event('change'));return true})()`);
browser(['wait','--fn',"document.querySelector('.editor [role=status]').textContent.includes('Course imported')"]);
assert(`JSON.stringify(__retro.app.editor.model.document)===${JSON.stringify(stable)}`,'Valid import did not restore exported course');
click('Fit course');browser(['screenshot',`${output}/workshop.png`]);
browser(['set','viewport','960','640','1']);browser(['screenshot',`${output}/workshop-small.png`]);
assert('document.querySelector(".editor").scrollWidth<=innerWidth','Editor overflows smaller window');
browser(['set','viewport','1280','800','1']);
const result={completion,overlap:'offending pair selected and highlighted',groupTransforms:'rotate and elevate with undo',exposedParameters:'width override applied',parts:JSON.parse(stable).instances.length,prefab:'saved, placed and recovered',commands:'resize, pointer drag, undo, redo',import:'valid replacement and invalid preservation',recovery:'page reload',play:'spawn/checkpoint/selection and unchanged return',scope:'UI events with real pointer placement/drag; no direct model edits'};
writeFileSync(`${output}/editor.json`,JSON.stringify(result,null,2));console.log(result);
