export const ACTIONS = ['up', 'down', 'left', 'right', 'brake', 'interact', 'pause', 'retry', 'mute', 'confirm', 'back', 'menuUp', 'menuDown'] as const;
export type Action = (typeof ACTIONS)[number];
export interface ControlSettings {
  bindings: Record<Action, string[]>;
  deadZone: number;
  sensitivity: number;
}
export const ACTION_LABELS: Record<Action, string> = { up: 'Roll up', down: 'Roll down', left: 'Roll left', right: 'Roll right', brake: 'Brake', interact: 'Interact', pause: 'Pause', retry: 'Retry checkpoint', mute: 'Master mute', confirm: 'Menu confirm', back: 'Menu back', menuUp: 'Menu up', menuDown: 'Menu down' };
export const DEFAULT_CONTROLS: ControlSettings = {
  bindings: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], brake: ['ShiftLeft', 'ShiftRight'], interact: ['KeyE'], pause: ['KeyP'], retry: ['KeyR'], mute: ['KeyM'], confirm: ['Enter'], back: ['Backspace'], menuUp: ['ArrowUp'], menuDown: ['ArrowDown'] },
  deadZone: .18, sensitivity: 1,
};
const KEY = 'retro-ball.controls.v1';
const menu = new Set<Action>(['confirm', 'back', 'menuUp', 'menuDown']);
const validCode = (code: unknown): code is string => typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Enter|Backspace|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(code) && code !== 'KeyF';
export function bindingConflict(settings: ControlSettings, action: Action, code: string): Action | null {
  return ACTIONS.find(other => other !== action && menu.has(other) === menu.has(action) && settings.bindings[other].includes(code)) ?? null;
}
export function rebind(settings: ControlSettings, action: Action, code: string): ControlSettings {
  if (!validCode(code)) throw new Error('Use a letter, number, arrow or modifier key. Space, F, Esc and Tab stay reserved.');
  const conflict = bindingConflict(settings, action, code);
  if (conflict) throw new Error(`Already used by ${ACTION_LABELS[conflict]}. Rebind that action first.`);
  return { ...settings, bindings: { ...settings.bindings, [action]: [code] } };
}
export function loadControls(): ControlSettings {
  const defaults = structuredClone(DEFAULT_CONTROLS);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    if (Number.isFinite(raw.deadZone) && raw.deadZone >= .05 && raw.deadZone <= .5) defaults.deadZone = raw.deadZone;
    if (Number.isFinite(raw.sensitivity) && raw.sensitivity >= .5 && raw.sensitivity <= 2) defaults.sensitivity = raw.sensitivity;
    if (raw.bindings && ACTIONS.every(action => Array.isArray(raw.bindings[action]) && raw.bindings[action].length >= 1 && raw.bindings[action].length <= 2 && raw.bindings[action].every(validCode))) {
      const candidate = { ...defaults, bindings: raw.bindings } as ControlSettings;
      if (ACTIONS.every(action => candidate.bindings[action].every(code => !bindingConflict(candidate, action, code)))) defaults.bindings = structuredClone(raw.bindings);
    }
  } catch { /* Missing/corrupt/unavailable storage retains defaults. */ }
  return defaults;
}
export function saveControls(settings: ControlSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Current session still works. */ }
}

export interface PadSnapshot { index: number; id: string; connected: boolean; mapping: string; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] }
export function radialAxis(x: number, y: number, deadZone: number, sensitivity: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (Math.min(1, length) - deadZone) / (1 - deadZone) * sensitivity);
  return { x: x / length * magnitude, y: y / length * magnitude };
}
export const PAD_BUTTONS: Partial<Record<Action, number[]>> = {
  brake: [4, 6], interact: [0], pause: [9], retry: [3], confirm: [0], back: [1], menuUp: [12], menuDown: [13],
};
