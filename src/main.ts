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

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  const physics = await Physics.create();
  const input = new Input();
  const hud = new Hud();
  const audio = new AudioSystem();

  const game = new Game(LEVEL, renderer, physics, input, hud);
  game.audio = audio;

  // The nebula plane is parented to the camera, so the camera must be in the scene graph.
  renderer.scene.add(renderer.camera);
  const background = new Background(renderer.camera, game.level.bounds, renderer.renderer.getPixelRatio());
  renderer.scene.add(background.group);

  const postfx = new PostFX(renderer);
  const onResize = (): void => postfx.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);
  onResize();

  // Dev hooks (autopilot + time control) for automated play-testing.
  const debug = { stepsPerFrame: 1, fixedDt: null as number | null };
  const autopilot = new Autopilot(game, input);
  if (import.meta.env.DEV) {
    (window as unknown as { __retro: unknown }).__retro = { game, input, autopilot, debug };
  }

  let last = performance.now();
  const frame = (now: number): void => {
    const wallDt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    const steps = Math.max(1, debug.stepsPerFrame | 0);
    for (let i = 0; i < steps; i++) {
      const dt = debug.fixedDt ?? wallDt;
      autopilot.update(dt);
      game.update(dt);
    }
    background.update(game.elapsed, game.fx.beat, renderer.target, renderer.viewHeight, renderer.aspect);
    postfx.render(game.elapsed, game.fx);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('overlay');
  if (el) el.textContent = `BOOT FAILURE: ${String(err)}`;
});
