import * as THREE from 'three';
import { Game } from '../game/Game';
import { Physics } from '../physics/Physics';
import { Input } from '../input/Input';
import { Hud } from '../ui/Hud';
import { AudioSystem } from '../audio/AudioSystem';
import { Background } from '../render/Background';
import type { Renderer } from '../render/Renderer';
import type { QualitySettings } from '../settings/Settings';
import { resolveLevel, type LevelDocument } from '../content/LevelDocument';
import { Autopilot } from '../debug/Autopilot';
import { disposeObjects } from './disposeObjects';

/** Owns everything that must disappear when leaving a course. */
export class LevelSession {
  readonly document: LevelDocument;
  readonly game: Game;
  readonly input: Input;
  readonly audio: AudioSystem;
  readonly background: Background;
  readonly physics: Physics;
  readonly hud: Hud;
  readonly autopilot: Autopilot;
  private disposed = false;
  private readonly renderer: Renderer;
  private readonly buffer = new THREE.Vector2();

  static async create(document: LevelDocument, renderer: Renderer, settings: QualitySettings): Promise<LevelSession> {
    const physics = await Physics.create();
    const before = new Set([...renderer.scene.children, ...renderer.camera.children]);
    const input = new Input(), hud = new Hud(), audio = new AudioSystem();
    let game: Game | undefined;
    let background: Background | undefined;
    try {
      audio.applySettings(settings);
      game = new Game(resolveLevel(document), renderer, physics, input, hud, document);
      game.audio = audio;
      background = new Background(renderer.camera, game.level.bounds, renderer.renderer.getPixelRatio());
      renderer.scene.add(background.group);
      return new LevelSession(document, renderer, physics, input, hud, audio, game, background, settings);
    } catch (error) {
      background?.dispose(); game?.dispose(); input.dispose(); hud.dispose();
      await audio.dispose(); physics.dispose();
      disposeObjects(...[...renderer.scene.children, ...renderer.camera.children].filter(o => !before.has(o)));
      throw error;
    }
  }

  private constructor(document: LevelDocument, renderer: Renderer, physics: Physics, input: Input, hud: Hud, audio: AudioSystem, game: Game, background: Background, settings: QualitySettings) {
    this.document = document; this.renderer = renderer; this.physics = physics; this.input = input;
    this.hud = hud; this.audio = audio; this.game = game; this.background = background;
    this.autopilot = new Autopilot(game, input);
    this.applySettings(settings);
  }

  applySettings(settings: QualitySettings): void {
    this.audio.applySettings(settings);
    this.background.setPixelRatio(this.renderer.renderer.getPixelRatio());
    this.renderer.renderer.getDrawingBufferSize(this.buffer);
    this.background.setNebulaScale(settings.nebulaScale, this.buffer.x, this.buffer.y);
  }

  resize(): void {
    this.renderer.renderer.getDrawingBufferSize(this.buffer);
    this.background.setSize(this.buffer.x, this.buffer.y);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.autopilot.stop(); this.input.dispose(); this.game.dispose(); this.background.dispose();
    this.hud.dispose(); this.physics.dispose(); this.renderer.renderer.renderLists.dispose();
    await this.audio.dispose();
  }
}
