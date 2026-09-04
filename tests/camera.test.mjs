import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraTuning } from '../src/render/CameraZones.ts';
import { loadLevelDocument } from '../src/content/Catalogue.ts';

test('camera modes resolve stable overlaps and hysteresis while preserving ordinary follow', () => {
  const zones = loadLevelDocument('sightlines').cameraZones;
  assert.equal(cameraTuning(zones, {x:0,y:1,z:0}, 0, null).mode, 'puzzle');
  assert.equal(cameraTuning(zones, {x:0,y:3,z:-12}, 0, null).mode, 'vertical');
  assert.equal(cameraTuning(zones, {x:0,y:9,z:-34}, 12, null).mode, 'speed');
  assert.equal(cameraTuning(zones, {x:0,y:9,z:-40}, 0, 'speed').mode, 'arena');
  assert.equal(cameraTuning(zones, {x:0,y:1,z:-6.4}, 0, 'puzzle').zoneId, 'puzzle');
  assert.equal(cameraTuning(zones, {x:0,y:1,z:-6.9}, 0, 'puzzle').zoneId, 'vertical');
  assert.deepEqual(cameraTuning([], {x:0,y:0,z:0}, 10, null), {zoneId:null,mode:'follow',viewHeight:25,lookAhead:.28,response:6});
});
