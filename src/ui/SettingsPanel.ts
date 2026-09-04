import { ACTIONS, ACTION_LABELS, DEFAULT_CONTROLS, loadControls, rebind, saveControls, type Action, type ControlSettings } from '../input/Actions';
import { DEFAULT_SETTINGS, SETTING_OPTIONS, type QualitySettings } from '../settings/Settings';

type NumericKey = 'frameCap' | 'pixelRatioCap' | 'nebulaScale';
type BoolKey = 'antialias' | 'bloom' | 'musicEnabled' | 'soundFxEnabled';

interface NumericRow {
  key: NumericKey;
  label: string;
  hint: string;
  options: readonly number[];
  format: (v: number) => string;
}

interface BoolRow {
  key: BoolKey;
  label: string;
  hint: string;
}

const NUMERIC_ROWS: NumericRow[] = [
  {
    key: 'frameCap',
    label: 'FRAME CAP',
    hint: 'Max frames per second. Lower runs cooler.',
    options: SETTING_OPTIONS.frameCap,
    format: (v) => (v === 0 ? 'OFF' : String(v)),
  },
  {
    key: 'pixelRatioCap',
    label: 'PIXEL RATIO',
    hint: 'Render resolution relative to CSS pixels. Capped at the display’s native ratio.',
    options: SETTING_OPTIONS.pixelRatioCap,
    format: (v) => `${v}×`,
  },
  {
    key: 'nebulaScale',
    label: 'NEBULA',
    hint: 'Backdrop render scale. The nebula is soft, so ¼ size looks the same.',
    options: SETTING_OPTIONS.nebulaScale,
    format: (v) => (v === 1 ? 'FULL' : v === 0.5 ? '½' : '¼'),
  },
];

const BOOL_ROWS: BoolRow[] = [
  { key: 'musicEnabled', label: 'MUSIC', hint: 'Soundtrack. Visual rhythm continues when off.' },
  { key: 'soundFxEnabled', label: 'SOUND FX', hint: 'Rolling, impacts and game cues.' },
  { key: 'antialias', label: 'ANTIALIAS', hint: '4× multisampling on the scene pass.' },
  { key: 'bloom', label: 'BLOOM', hint: 'Neon glow post-processing pass.' },
];

/**
 * In-game quality control panel. Opens with Escape or the gear button.
 * Every change is reported through `onChange` at once.
 */
export class SettingsPanel {
  private readonly listeners = new AbortController();
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly buttons = new Map<string, HTMLButtonElement[]>();
  private settings: QualitySettings;
  onToggle: ((open: boolean) => void) | null = null;
  onControlsChange: ((s: ControlSettings) => void) | null = null;
  private controls = loadControls();
  private bindingAction: Action | null = null;
  onChange: ((s: QualitySettings) => void) | null = null;

  constructor(initial: QualitySettings) {
    this.settings = { ...initial };
    this.root = document.getElementById('settings')!;

    this.fullscreenButton = document.createElement('button');
    this.fullscreenButton.className = 'fullscreen-toggle';
    this.fullscreenButton.type = 'button';
    this.fullscreenButton.addEventListener('click', () => void this.toggleFullscreen());
    this.root.appendChild(this.fullscreenButton);

    const toggle = document.createElement('button');
    toggle.className = 'settings-toggle';
    toggle.type = 'button';
    toggle.title = 'Settings (Esc)';
    toggle.setAttribute('aria-label', 'Settings');
    toggle.textContent = '⚙';
    toggle.addEventListener('click', () => this.toggle());
    this.root.appendChild(toggle);

    this.panel = document.createElement('div');
    this.panel.className = 'settings-panel';
    this.panel.hidden = true;
    this.root.appendChild(this.panel);

    const head = document.createElement('div');
    head.className = 'settings-head';
    head.innerHTML = '<span class="eyebrow">// SETTINGS</span><span class="settings-close">ESC TO CLOSE</span>';
    this.panel.appendChild(head);

    for (const row of NUMERIC_ROWS) {
      this.addRow(row.label, row.hint, row.key, row.options.map((v) => ({ text: row.format(v), value: v })), (v) => {
        this.settings[row.key] = v as number;
      });
    }
    for (const row of BOOL_ROWS) {
      this.addRow(row.label, row.hint, row.key, [{ text: 'ON', value: 1 }, { text: 'OFF', value: 0 }], (v) => {
        this.settings[row.key] = v === 1;
      });
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'settings-reset';
    reset.textContent = 'RESTORE DEFAULTS';
    reset.addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS };
      this.refresh();
      this.onChange?.({ ...this.settings });
    });
    this.panel.appendChild(reset);
    this.addControls();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) {
        e.preventDefault();
        void this.toggleFullscreen();
      }
      if ((e.code === 'Escape' || e.key === 'Escape') && !document.fullscreenElement) this.toggle();
    }, { signal: this.listeners.signal });
    document.addEventListener('fullscreenchange', () => this.refreshFullscreen(), { signal: this.listeners.signal });

    this.refresh();
    this.refreshFullscreen();
  }

  private addControls(): void {
    const details = document.createElement('details'); details.className = 'control-settings';
    const summary = document.createElement('summary'); summary.textContent = 'CONTROLS'; details.append(summary);
    const hint = document.createElement('p'); hint.textContent = 'Choose an action, then press a key. Esc cancels. Space boots; F is fullscreen. Standard controller: left stick / D-pad to roll, LB or LT to brake, A to interact, Start to pause, Y to retry.'; details.append(hint);
    const message = document.createElement('p'); message.setAttribute('role', 'status');
    const buttons = new Map<Action, HTMLButtonElement>();
    const refresh = () => { for (const [action, button] of buttons) button.textContent = `${ACTION_LABELS[action]}: ${this.controls.bindings[action].join(' / ')}`; };
    const publish = () => { saveControls(this.controls); this.onControlsChange?.(structuredClone(this.controls)); refresh(); };
    for (const action of ACTIONS) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset['bindAction'] = action;
      button.addEventListener('click', () => { this.bindingAction = action; this.panel.dataset['rebinding'] = 'true'; message.textContent = `Press a key for ${ACTION_LABELS[action]}.`; });
      buttons.set(action, button); details.append(button);
    }
    for (const [key, label, values] of [['deadZone', 'Controller dead zone', [.05, .1, .18, .25, .35, .5]], ['sensitivity', 'Controller sensitivity', [.5, .75, 1, 1.25, 1.5, 2]]] as const) {
      const row = document.createElement('label'); row.textContent = label;
      const select = document.createElement('select'); select.setAttribute('aria-label', label);
      for (const value of values) { const option = document.createElement('option'); option.value = String(value); option.textContent = key === 'deadZone' ? `${Math.round(value * 100)}%` : `${value}×`; select.append(option); }
      select.value = String(this.controls[key]);
      select.addEventListener('change', () => { this.controls[key] = Number(select.value); publish(); });
      row.append(select); details.append(row);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Restore controls';
    reset.addEventListener('click', () => { this.controls = structuredClone(DEFAULT_CONTROLS); publish(); details.querySelectorAll('select').forEach((select, index) => select.value = String(index === 0 ? this.controls.deadZone : this.controls.sensitivity)); });
    details.append(reset, message); this.panel.append(details); refresh();
    window.addEventListener('keydown', event => {
      if (!this.bindingAction) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') message.textContent = 'Binding cancelled.';
      else {
        try { this.controls = rebind(this.controls, this.bindingAction, event.code); publish(); message.textContent = 'Binding saved.'; }
        catch (error) { message.textContent = (error as Error).message; return; }
      }
      this.bindingAction = null; delete this.panel.dataset['rebinding'];
    }, { capture: true, signal: this.listeners.signal });
  }

  dispose(): void { this.listeners.abort(); this.root.replaceChildren(); this.onChange = null; }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  toggle(): void {
    this.panel.hidden = !this.panel.hidden;
    this.onToggle?.(!this.panel.hidden);
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled) {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('Unable to change fullscreen mode.', error);
    }
  }

  private refreshFullscreen(): void {
    const active = document.fullscreenElement !== null;
    this.fullscreenButton.textContent = active ? '✕' : '⛶';
    this.fullscreenButton.title = active ? 'Exit fullscreen (Esc)' : 'Enter fullscreen (F)';
    this.fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    this.fullscreenButton.setAttribute('aria-pressed', String(active));
    this.fullscreenButton.disabled = !document.fullscreenEnabled;
  }

  private addRow(
    label: string,
    hint: string,
    key: string,
    options: Array<{ text: string; value: number }>,
    apply: (value: number) => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.dataset['setting'] = key;
    const lab = document.createElement('div');
    lab.className = 'settings-label';
    lab.textContent = label;
    lab.title = hint;
    row.appendChild(lab);
    const seg = document.createElement('div');
    seg.className = 'settings-seg';
    const list: HTMLButtonElement[] = [];
    for (const opt of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.text;
      b.setAttribute('aria-label', `${label} ${opt.text}`);
      b.dataset['value'] = String(opt.value);
      b.addEventListener('click', () => {
        apply(opt.value);
        this.refresh();
        this.onChange?.({ ...this.settings });
      });
      seg.appendChild(b);
      list.push(b);
    }
    row.appendChild(seg);
    const h = document.createElement('div');
    h.className = 'settings-hint';
    h.textContent = hint;
    row.appendChild(h);
    this.panel.appendChild(row);
    this.buttons.set(key, list);
  }

  /** Highlights the active option in every row. */
  private refresh(): void {
    for (const [key, list] of this.buttons) {
      const raw = this.settings[key as keyof QualitySettings];
      const current = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
      for (const b of list) {
        const active = Number(b.dataset['value']) === current;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      }
    }
  }
}
