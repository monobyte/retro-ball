import * as THREE from 'three';
import { Renderer } from './render/Renderer';
import { PostFX } from './render/PostFX';
import { Background } from './render/Background';
import { Physics } from './physics/Physics';
import { Input } from './input/Input';
import { Hud } from './ui/Hud';
import { Game } from './game/Game';
import { AudioSystem } from './audio/AudioSystem';
import { LEVEL } from './game/LevelData';
import { Autopilot } from './debug/Autopilot';
import { loadSettings, saveSettings, type QualitySettings } from './settings/Settings';
import { SettingsPanel } from './ui/SettingsPanel';

async function main(): Promise<void> {
  let settings: QualitySettings = loadSettings();

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, settings.pixelRatioCap);
  const physics = await Physics.create();
  const input = new Input();
  const hud = new Hud();
  const audio = new AudioSystem();
  audio.applySettings(settings);

  const game = new Game(LEVEL, renderer, physics, input, hud);
  game.audio = audio;

  // The nebula plane is parented to the camera, so the camera must be in the scene graph.
  renderer.scene.add(renderer.camera);
  const background = new Background(renderer.camera, game.level.bounds, renderer.renderer.getPixelRatio());
  renderer.scene.add(background.group);

  let postfx = new PostFX(renderer, settings);
  const bufferSize = new THREE.Vector2();

  /** Sizes every screen-space buffer to the window and the current pixel ratio. */
  const applySize = (): void => {
    postfx.setSize(window.innerWidth, window.innerHeight);
    renderer.renderer.getDrawingBufferSize(bufferSize);
    background.setSize(bufferSize.x, bufferSize.y);
  };

  /** Pushes a settings change into the renderer, post-processing and backdrop. */
  const applySettings = (next: QualitySettings): void => {
    const prev = settings;
    settings = next;
    saveSettings(next);
    audio.applySettings(next);
    if (next.pixelRatioCap !== prev.pixelRatioCap) {
      renderer.setPixelRatioCap(next.pixelRatioCap);
      background.setPixelRatio(renderer.renderer.getPixelRatio());
    }
    if (next.antialias !== prev.antialias) {
      // MSAA lives on the composer's render target, so the stack is rebuilt.
      postfx.dispose();
      postfx = new PostFX(renderer, next);
    }
    postfx.setBloomEnabled(next.bloom);
    renderer.renderer.getDrawingBufferSize(bufferSize);
    background.setNebulaScale(next.nebulaScale, bufferSize.x, bufferSize.y);
    applySize();
  };

  renderer.renderer.getDrawingBufferSize(bufferSize);
  background.setNebulaScale(settings.nebulaScale, bufferSize.x, bufferSize.y);
  window.addEventListener('resize', applySize);
  applySize();

  const panel = new SettingsPanel(settings);
  panel.onChange = applySettings;

  // Dev hooks (autopilot + time control) for automated play-testing.
  const debug = { stepsPerFrame: 1, fixedDt: null as number | null };
  const autopilot = new Autopilot(game, input);
  if (import.meta.env.DEV) {
    (window as unknown as { __retro: unknown }).__retro = { game, input, autopilot, debug, applySettings, readyAtMs: performance.now() };
  }

  let last = performance.now();
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    // Frame cap: skip display refreshes until the target interval has passed.
    // The 15% slack absorbs timestamp jitter so a 60 cap on a 120 Hz display
    // renders every second refresh instead of every third.
    const elapsedMs = now - last;
    if (settings.frameCap > 0) {
      const interval = 1000 / settings.frameCap;
      if (elapsedMs < interval * 0.85) return;
    }
    last = now;
    const wallDt = Math.max(0, Math.min(0.05, elapsedMs / 1000));
    const steps = Math.max(1, debug.stepsPerFrame | 0);
    for (let i = 0; i < steps; i++) {
      const dt = debug.fixedDt ?? wallDt;
      autopilot.update(dt);
      game.update(dt);
    }
    background.update(game.elapsed, game.fx.beat, renderer.target, renderer.viewHeight, renderer.aspect);
    background.render(renderer.renderer);
    postfx.render(game.elapsed, game.fx);
  };
  requestAnimationFrame(frame);
}

main().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('overlay');
  if (el) el.textContent = `BOOT FAILURE: ${String(err)}`;
});
