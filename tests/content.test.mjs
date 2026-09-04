import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL } from '../src/game/LevelData.ts';
import { resolveLevel, resolveInstance, documentFromLegacy } from '../src/content/LevelDocument.ts';
import { validateLevel, parseLevel, InvalidLevelError } from '../src/content/validateLevel.ts';
import { CATALOGUE, loadLevelDocument, validateCatalogue } from '../src/content/Catalogue.ts';
const legacy = JSON.parse(readFileSync(new URL('../src/content/levels/legacy.json', import.meta.url)));
const relay = () => loadLevelDocument('relay');
const reject = (change, pattern) => {
  const document = relay(); change(document);
  const result = validateLevel(document);
  assert.equal(result.document, null);
  assert.ok(result.issues.some(i => i.severity === 'error' && pattern.test(`${i.path}: ${i.message}`)), JSON.stringify(result.issues));
};

test('stored legacy document resolves to the exact regression fixture', () => {
  assert.deepEqual(resolveLevel(parseLevel(legacy)), LEVEL);
  assert.deepEqual(documentFromLegacy(LEVEL, 'legacy'), legacy);
  const copy = loadLevelDocument('legacy'); copy.instances[0].parameters.w = 200;
  assert.notEqual(loadLevelDocument('legacy').instances[0].parameters.w, 200);
  const reversed = structuredClone(legacy); reversed.instances.reverse();
  assert.deepEqual(new Set(reversed.instances.map(i => i.id)), new Set(legacy.instances.map(i => i.id)));
});

test('all catalogue courses validate and expose resolvable region references', () => {
  assert.deepEqual(validateCatalogue(CATALOGUE), []);
  for (const entry of CATALOGUE.levels) assert.equal(loadLevelDocument(entry.id).id, entry.id);
  assert.throws(() => loadLevelDocument('__proto__'), /Unknown course/);
  const bad = structuredClone(CATALOGUE); bad.regions[0].levelIds.push('missing');
  assert.match(validateCatalogue(bad).join(), /unknown level missing/);
});

test('validator reports actionable paths for malformed data and references', () => {
  reject(d => { d.schemaVersion = 2; }, /schemaVersion/);
  reject(d => { d.instances[0].parameters.w = NaN; }, /JSON/);
  reject(d => { d.instances[0].parameters.w = -1; }, /parameters.w/);
  reject(d => { d.instances[1].id = d.instances[0].id; }, /Duplicate instance/);
  reject(d => { d.instances[0].type = 'script'; }, /Unknown part/);
  reject(d => { d.instances[0].parameters.script = 'alert(1)'; }, /Unknown parameter/);
  reject(d => { d.instances[0].resetGroup = 'missing'; }, /resetGroup/);
  reject(d => { d.objectives[0].target = 'slab-001'; }, /existing goal/);
  reject(d => { d.checkpoints = []; }, /Missing checkpoint policy/);
  reject(d => { d.navigation.links[0].to = 'missing'; }, /navigation.links/);
  reject(d => { d.instances[0].links = [{ output: 'activated', target: { instanceId: 'goal-011', input: 'enable' } }]; }, /port/);
  reject(d => { d.transform = { script: () => 1 }; }, /JSON/);
  for (const data of [null, [], 'text', JSON.parse('{"__proto__":{}}')]) assert.equal(validateLevel(data).document, null);
  const cyclic = relay(); cyclic.metadata.parent = cyclic;
  assert.equal(validateLevel(cyclic).document, null);
  assert.throws(() => parseLevel({}), InvalidLevelError);
});

test('geometry validation prevents bad spawns and coplanar floor flicker', () => {
  reject(d => { d.spawn = { x: 500, y: .6, z: 0 }; }, /floor/);
  reject(d => { d.spawn.x = 4.8; }, /clearance|wall/);
  reject(d => { const p = structuredClone(d.instances[0]); p.id = 'overlap'; d.instances.push(p); }, /Coplanar/);
  reject(d => { d.checkpoints[0].spawn.y = -1; }, /support/);
  reject(d => { d.instances.find(i => i.type === 'ramp').transform.position.x = 50; }, /Route parts do not connect/);
  const result = validateLevel(legacy);
  assert.ok(result.document);
  assert.ok(result.issues.some(i => i.severity === 'warning' && /route/.test(i.message)));
});

test('quarter-turn transforms rotate footprints, ramps, jump targets and laser sweeps', () => {
  const document = documentFromLegacy({ name: 'test', start: { x: 0, y: .6, z: 0 }, pieces: [
    { kind: 'slab', x: 10, y: 2, z: 20, w: 4, d: 8 },
    { kind: 'ramp', x: 10, z: 20, y0: 2, y1: 6, w: 4, len: 8, dir: '+x' },
    { kind: 'jumppad', x: 10, y: 2, z: 20, targetX: 15, targetY: 6, targetZ: 20 },
    { kind: 'laser', x: 10, y: 2, z: 20, axis: 'z', length: 4, sweep: 3, speed: .2, gatePeriod: 4, phase: .2 },
  ] }, 'test');
  document.instances.forEach(i => { i.transform.yaw = 90; });
  const [slab, ramp, jump, laser] = document.instances.map(resolveInstance);
  assert.deepEqual([slab.w, slab.d], [8, 4]);
  assert.deepEqual([ramp.dir, ramp.y0, ramp.y1], ['-z', 2, 6]);
  assert.deepEqual([jump.targetX, jump.targetY, jump.targetZ], [10, 6, 15]);
  assert.deepEqual([laser.axis, laser.sweep, laser.phase], ['x', -3, .2]);
});
