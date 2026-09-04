import { Input } from '../input/Input';
import { loadControls } from '../input/Actions';
import { Renderer } from '../render/Renderer';
import { PostFX } from '../render/PostFX';
import { loadSettings, saveSettings, type QualitySettings } from '../settings/Settings';
import { SettingsPanel } from '../ui/SettingsPanel';
import { CATALOGUE, loadLevelDocument, validateCatalogue } from '../content/Catalogue';
import { parseLevel } from '../content/validateLevel';
import { LevelSession } from './LevelSession';

export type ApplicationState = 'boot' | 'hub' | 'loading' | 'intro' | 'playing' | 'paused' | 'resetting' | 'results' | 'transition' | 'error' | 'disposed';

/** One renderer and frame loop; one explicitly owned course session at a time. */
export class Application {
  state: ApplicationState = 'boot';
  session: LevelSession | null = null;
  readonly renderer: Renderer;
  readonly debug = { stepsPerFrame: 1, fixedDt: null as number | null };
  readyAtMs = 0;
  private settings = loadSettings();
  private postfx: PostFX;
  private readonly panel: SettingsPanel;
  private readonly menu = document.createElement('section');
  private readonly toolbar = document.createElement('nav');
  private readonly listeners = new AbortController();
  private readonly menuInput = new Input();
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;
  private masterMuted = false;
  private settingsPaused = false;
  private frameId = 0;
  private last = performance.now();
  private pausedState: ApplicationState = 'playing';
  private readonly pauseButton: HTMLButtonElement;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, this.settings.pixelRatioCap);
    this.renderer.scene.add(this.renderer.camera);
    this.postfx = new PostFX(this.renderer, this.settings);
    this.panel = new SettingsPanel(this.settings);
    this.panel.onChange = next => this.applySettings(next);
    this.panel.onToggle = open => {
      if (open && ['playing', 'resetting', 'results'].includes(this.state)) { this.settingsPaused = true; this.togglePause(); }
      else if (!open && this.settingsPaused) { this.settingsPaused = false; if (this.state === 'paused') this.togglePause(); }
    };
    this.panel.onControlsChange = controls => { this.menuInput.configure(controls); this.session?.input.configure(controls); };
    this.menuInput.onControllerDisconnected = () => { if (this.session && ['playing', 'resetting'].includes(this.state)) this.togglePause(); };
    this.menu.className = 'runtime-menu';
    this.menu.setAttribute('aria-label', 'Course selection');
    this.toolbar.className = 'runtime-toolbar';
    this.toolbar.setAttribute('aria-label', 'Course actions');
    this.pauseButton = this.button('Pause', () => this.togglePause());
    const retryButton = this.button('Retry course', () => this.retry()); retryButton.dataset['action'] = 'retry';
    this.toolbar.append(this.pauseButton, retryButton, this.button('Return to relay', () => void this.returnToHub()));
    document.body.append(this.menu, this.toolbar);
    window.addEventListener('resize', () => this.resize(), { signal: this.listeners.signal });
    window.addEventListener('blur', () => { if (this.session && ['playing', 'resetting'].includes(this.state)) this.togglePause(); }, { signal: this.listeners.signal });
    const errors = validateCatalogue(CATALOGUE);
    if (errors.length) this.showError(new Error(errors.join('\n')));
    else this.showHub();
    this.frameId = requestAnimationFrame(now => this.frame(now));
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action); return button;
  }

  private heading(title: string, subtitle: string): void {
    this.menu.replaceChildren();
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = '// RETRO BALL';
    const heading = document.createElement('h1'); heading.textContent = title;
    const description = document.createElement('p'); description.textContent = subtitle;
    this.menu.append(eyebrow, heading, description); this.menu.hidden = false;
  }

  private showHub(): void {
    this.state = 'hub'; this.toolbar.hidden = true;
    this.heading('THE RELAY', 'Choose a signal. Find your way through.');
    for (const entry of CATALOGUE.levels) {
      const button = this.button(entry.name, () => void this.loadLevel(entry.id));
      button.dataset['levelId'] = entry.id;
      const description = document.createElement('span'); description.textContent = entry.description;
      button.append(description); this.menu.append(button);
    }
    this.menu.querySelector('button')?.focus();
  }

  private showError(error: unknown): void {
    this.state = 'error'; this.toolbar.hidden = true;
    this.heading('SIGNAL INTERRUPTED', error instanceof Error ? error.message : String(error));
    this.menu.append(this.button('Return to relay', () => void this.returnToHub()));
    this.menu.querySelector('button')?.focus();
  }

  /** Queue transitions outside simulation iteration and close audio before replacement. */
  private transition(action: () => Promise<void>): Promise<void> {
    this.pending = this.pending.then(async () => {
      if (this.disposed) return;
      this.state = 'transition';
      this.session?.input.clear(); this.menuInput.clear();
      const previous = this.session;
      if (previous) this.masterMuted = previous.audio.isMuted;
      this.session = null;
      try { await previous?.dispose(); await action(); }
      catch (error) { this.showError(error); }
    });
    return this.pending;
  }

  loadLevel(id: string): Promise<void> {
    return this.loadDocument(() => loadLevelDocument(id));
  }

  /** The same validation boundary will serve editor play-tests and imported files. */
  loadDocument(source: unknown | (() => unknown)): Promise<void> {
    return this.transition(async () => {
      this.state = 'loading'; this.toolbar.hidden = true;
      this.heading('TUNING IN', 'Preparing the course…');
      const document = parseLevel(typeof source === 'function' ? source() : source);
      this.session = await LevelSession.create(document, this.renderer, this.settings);
      this.session.audio.setMuted(this.masterMuted);
      this.session.input.configure(loadControls());
      this.session.input.onControllerDisconnected = this.menuInput.onControllerDisconnected;
      this.state = 'intro'; this.menu.hidden = true; this.toolbar.hidden = false;
      this.pauseButton.textContent = 'Pause';
      this.debug.fixedDt = null; this.debug.stepsPerFrame = 1;
      this.readyAtMs = performance.now(); this.last = performance.now();
      this.resize();
    });
  }

  returnToHub(): Promise<void> { return this.transition(async () => this.showHub()); }

  retry(): void {
    if (!this.session || !['playing', 'paused', 'resetting', 'results'].includes(this.state)) return;
    this.session.input.clear(); this.session.physics.clearAccumulator();
    this.session.game.restart(); this.state = 'playing'; this.menu.hidden = true;
    this.pauseButton.textContent = 'Pause'; void this.session.audio.resume();
  }

  togglePause(): void {
    const session = this.session;
    if (!session) return;
    if (this.state === 'paused') {
      this.state = this.pausedState; this.menu.hidden = true; this.pauseButton.textContent = 'Pause';
      session.input.clear(); this.last = performance.now(); void session.audio.resume();
    } else if (['playing', 'resetting', 'results'].includes(this.state)) {
      this.pausedState = this.state; this.state = 'paused'; session.input.clear();
      this.heading('SIGNAL HELD', 'Take your time. The course will wait.');
      this.menu.append(this.button('Resume', () => this.togglePause()), this.button('Return to relay', () => void this.returnToHub()));
      this.pauseButton.textContent = 'Resume'; void session.audio.suspend();
      this.menu.querySelector('button')?.focus();
    }
  }

  applySettings(next: QualitySettings): void {
    const previous = this.settings; this.settings = next; saveSettings(next);
    this.renderer.setPixelRatioCap(next.pixelRatioCap);
    if (next.antialias !== previous.antialias) { this.postfx.dispose(); this.postfx = new PostFX(this.renderer, next); }
    this.postfx.setBloomEnabled(next.bloom); this.session?.applySettings(next); this.resize();
  }

  private resize(): void {
    this.postfx.setSize(innerWidth, innerHeight); this.session?.resize();
  }

  private processMenuInput(): void {
    const input = this.menuInput;
    if (this.panel.isOpen) return;
    if (input.actionPressed('pause')) { this.togglePause(); return; }
    if (this.menu.hidden) return;
    const buttons = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (input.actionPressed('menuDown')) buttons[(index + 1) % buttons.length]?.focus();
    if (input.actionPressed('menuUp')) buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    if (input.actionPressed('confirm')) buttons[Math.max(0, index)]?.click();
    if (input.actionPressed('back')) {
      if (this.state === 'paused') this.togglePause();
      else if (this.state === 'error') void this.returnToHub();
    }
  }

  private frame(now: number): void {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(time => this.frame(time));
    const elapsed = now - this.last;
    if (this.settings.frameCap > 0 && elapsed < 1000 / this.settings.frameCap * .85) return;
    this.last = now;
    this.menuInput.poll();
    this.session?.input.poll();
    this.processMenuInput();
    this.menuInput.endFrame();
    this.pauseButton.disabled = !['playing', 'paused', 'resetting', 'results'].includes(this.state);
    this.toolbar.querySelector<HTMLButtonElement>('[data-action=retry]')!.disabled = this.pauseButton.disabled;
    const session = this.session;
    if (!session) { this.renderer.renderer.clear(); return; }
    const dt = this.debug.fixedDt ?? Math.min(.05, Math.max(0, elapsed / 1000));
    if (this.state !== 'paused') {
      for (let i = 0; i < Math.max(1, this.debug.stepsPerFrame | 0); i++) {
        session.autopilot.update(dt); session.game.update(dt);
      }
      this.state = ({ intro: 'intro', play: 'playing', reset: 'resetting', win: 'results' } as const)[session.game.state];
    }
    session.background.update(session.game.elapsed, session.game.fx.beat, this.renderer.target, this.renderer.viewHeight, this.renderer.aspect);
    session.background.render(this.renderer.renderer);
    this.postfx.render(session.game.elapsed, session.game.fx);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.returnToHub(); this.disposed = true; this.state = 'disposed';
    cancelAnimationFrame(this.frameId); this.listeners.abort(); this.panel.dispose();
    this.menuInput.dispose(); this.menu.remove(); this.toolbar.remove(); this.postfx.dispose(); this.renderer.dispose();
  }
}
