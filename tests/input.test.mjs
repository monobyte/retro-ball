import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONTROLS, loadControls, saveControls, radialAxis, rebind } from '../src/input/Actions.ts';
import { Input } from '../src/input/Input.ts';
globalThis.HTMLElement = class {};
const key = (target, type, code) => { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'code', { value: code }); target.dispatchEvent(event); };
const pad = () => ({ index: 0, id: 'test-standard', connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });

test('bindings validate conflicts, reserve browser/boot keys and persist safely', () => {
  let data = null;
  globalThis.localStorage = { getItem: () => data, setItem: (_, v) => { data = v; } };
  assert.deepEqual(loadControls(), DEFAULT_CONTROLS);
  const controls = rebind(DEFAULT_CONTROLS, 'brake', 'KeyB'); saveControls(controls);
  assert.deepEqual(loadControls(), controls);
  assert.throws(() => rebind(controls, 'brake', 'KeyW'), /Already used/);
  for (const code of ['Space', 'Escape', 'KeyF', 'Tab', 'Unidentified']) assert.throws(() => rebind(controls, 'brake', code), /reserved/);
  data = JSON.stringify({ ...controls, bindings: { ...controls.bindings, right: ['KeyW'] } });
  assert.deepEqual(loadControls().bindings, DEFAULT_CONTROLS.bindings);
  data = '{'; assert.deepEqual(loadControls(), DEFAULT_CONTROLS);
});

test('radial dead zone retains analogue magnitude without diagonal boost', () => {
  assert.deepEqual(radialAxis(.1, .1, .18, 1), { x: 0, y: 0 });
  assert.ok(Math.abs(radialAxis(.59, 0, .18, 1).x - .5) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...Object.values(radialAxis(1, 1, .18, 1))) - 1) < 1e-9);
  assert.deepEqual(radialAxis(NaN, 1, .18, 1), { x: 0, y: 0 });
});

test('input handles rebinding, key edges, controller neutral gating and disconnect', () => {
  const target = new EventTarget(); let activePad = pad(); let pads = [activePad];
  const input = new Input(target, () => pads); let disconnects = 0;
  input.onControllerDisconnected = () => disconnects++;
  input.configure(rebind(DEFAULT_CONTROLS, 'brake', 'KeyB'));
  key(target, 'keydown', 'KeyB'); assert.equal(input.brake(), 1);
  assert.equal(input.actionPressed('brake'), true); input.endFrame(); assert.equal(input.actionPressed('brake'), false);
  key(target, 'keyup', 'KeyB'); assert.equal(input.brake(), 0);
  activePad.axes[0] = 1; input.poll(); assert.deepEqual(input.axis(), { x: 0, y: 0 });
  activePad.axes[0] = 0; input.poll(); activePad.axes[0] = .59; input.poll(); assert.ok(Math.abs(input.axis().x - .5) < 1e-9);
  activePad.buttons[4].pressed = true; input.poll(); assert.equal(input.brake(), 1);
  input.clear(); input.poll(); assert.equal(input.brake(), 0); assert.deepEqual(input.axis(), { x: 0, y: 0 });
  activePad.axes[0] = 0; activePad.buttons[4].pressed = false; input.poll();
  pads = []; input.poll(); assert.equal(disconnects, 1); assert.equal(input.controllerName, null);
  key(target, 'keydown', 'KeyW'); assert.equal(input.axis().y, 1);
  target.dispatchEvent(new Event('blur')); assert.deepEqual(input.axis(), { x: 0, y: 0 });
  input.dispose(); key(target, 'keydown', 'KeyW'); assert.equal(input.isDown('KeyW'), false);
});
