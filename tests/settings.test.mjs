import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/settings/Settings.ts';

test('audio settings migrate old saves and persist all four combinations', () => {
  let stored = JSON.stringify({ frameCap: 30, antialias: true });
  globalThis.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  assert.deepEqual(loadSettings(), { ...DEFAULT_SETTINGS, frameCap: 30, antialias: true });
  for (const musicEnabled of [false, true]) for (const soundFxEnabled of [false, true]) {
    const settings = { ...loadSettings(), musicEnabled, soundFxEnabled };
    saveSettings(settings);
    assert.deepEqual(loadSettings(), settings);
  }
  for (const value of ['null', '{', '{"musicEnabled":0,"soundFxEnabled":"false"}']) {
    stored = value;
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  }
});

test('unavailable storage does not prevent play or changing preferences', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('unavailable'); },
    setItem() { throw new Error('quota'); },
  };
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(DEFAULT_SETTINGS));
});
