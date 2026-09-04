import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVEL } from '../src/game/LevelData.ts';
import { TUNING } from '../src/physics/Physics.ts';

const slabs = LEVEL.pieces.filter(p => p.kind === 'slab');
const bounds = p => [p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2];

test('void openings have ball clearance and exactly partition the field with its floor', () => {
  const holes = LEVEL.pieces.filter(p => p.kind === 'void');
  const floor = slabs.filter(p => p.y === 4 && p.x >= -5 && p.x <= 9 && p.z >= -42 && p.z <= -34);
  assert.equal(holes.length, 9);
  for (const hole of holes) {
    assert.ok(Math.min(hole.w, hole.d) >= TUNING.radius * 2 + 0.2, 'Opening needs clearance beyond the ball diameter');
  }
  const pieces = [...holes, ...floor];
  for (let i = 0; i < pieces.length; i++) {
    const a = bounds(pieces[i]);
    assert.ok(a[0] >= -5 && a[1] <= 9 && a[2] >= -42 && a[3] <= -34, 'Field boundary changed');
    for (const piece of pieces.slice(i + 1)) {
      const b = bounds(piece);
      assert.ok(Math.min(a[1], b[1]) <= Math.max(a[0], b[0]) || Math.min(a[3], b[3]) <= Math.max(a[2], b[2]), 'Floor obstructs a void, or pieces overlap');
    }
  }
  assert.equal(pieces.reduce((area, p) => area + p.w * p.d, 0), 14 * 8, 'Unexpected gaps in field coverage');
  const middle = floor.find(p => p.x - p.w / 2 === -5 && p.x + p.w / 2 === 9 && p.z - p.d / 2 <= -39.5 && p.z + p.d / 2 >= -36.5);
  assert.ok(middle, 'Keep a clear central braking lane at least three tiles deep');
});

test('slab tops never overlap at the same height', () => {
  for (let i = 0; i < slabs.length; i++) {
    const a = slabs[i];
    const [ax0, ax1, az0, az1] = bounds(a);
    for (const b of slabs.slice(i + 1)) {
      if (a.y !== b.y) continue;
      const [bx0, bx1, bz0, bz1] = bounds(b);
      const overlapX = Math.min(ax1, bx1) - Math.max(ax0, bx0);
      const overlapZ = Math.min(az1, bz1) - Math.max(az0, bz0);
      assert.ok(overlapX < 1e-8 || overlapZ < 1e-8, `Overlapping slabs: ${JSON.stringify({ a, b })}`);
    }
  }
});

// Compare every rectangle in the subdivision induced by the old and new
// boundaries. This checks the whole footprint, including gaps and outer edges.
function assertFootprint(original, current) {
  const rects = [...original, ...current];
  const xs = [...new Set(rects.flatMap(p => bounds(p).slice(0, 2)))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap(p => bounds(p).slice(2)))].sort((a, b) => a - b);
  const contains = (pieces, x, z) => pieces.some(p => {
    const [x0, x1, z0, z1] = bounds(p);
    return x > x0 && x < x1 && z > z0 && z < z1;
  });
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] < 1e-8) continue;
    for (let j = 1; j < zs.length; j++) {
      if (zs[j] - zs[j - 1] < 1e-8) continue;
      const x = (xs[i] + xs[i - 1]) / 2;
      const z = (zs[j] + zs[j - 1]) / 2;
      assert.equal(contains(current, x, z), contains(original, x, z), `Track changed at ${x}, ${z}`);
    }
  }
}

test('first ledge keeps its original playable footprint', () => {
  assertFootprint([
    { x: 8, z: -22, w: 7, d: 3 },
    { x: 11.5, z: -20.5, w: 3, d: 6 },
    { x: 15.5, z: -19, w: 7, d: 3 },
  ], slabs.filter(p => p.y === 3 && p.tone === 'pink' && p.x > 0));
});

test('final S-bend keeps its original playable footprint', () => {
  const landing = { x: -20, z: -4.5, w: 4, d: 4 };
  const plateau = { x: -9.5, z: 3.5, w: 7, d: 7 };
  assertFootprint([
    landing, plateau,
    { x: -16, z: -4.5, w: 5, d: 4 },
    { x: -13.8, z: -2.5, w: 3, d: 8 },
    { x: -11, z: 0, w: 4.2, d: 3 },
  ], slabs.filter(p => p.y === 3 && p.x < 0 && p.z < 7));
});
