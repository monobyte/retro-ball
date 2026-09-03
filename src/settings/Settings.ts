/**
 * Quality settings the player can change from the control panel.
 * Persisted in localStorage so a choice survives a reload.
 */
export interface QualitySettings {
  /** Upper bound on frames per second. 0 = no cap (render every display refresh). */
  frameCap: number;
  /** Upper bound on the device pixel ratio used for rendering. */
  pixelRatioCap: number;
  /** Multisample antialiasing on the scene render target. */
  antialias: boolean;
  /** Bloom post-processing pass. */
  bloom: boolean;
  /** Nebula backdrop render scale relative to the frame (1 = full size). */
  nebulaScale: number;
}

/** Allowed values for each numeric setting, in display order. */
export const SETTING_OPTIONS = {
  frameCap: [30, 60, 120, 0],
  pixelRatioCap: [1, 1.5, 2],
  nebulaScale: [0.25, 0.5, 1],
} as const;

export const DEFAULT_SETTINGS: QualitySettings = {
  frameCap: 60,
  pixelRatioCap: 2,
  antialias: true,
  bloom: true,
  nebulaScale: 0.25,
};

const STORAGE_KEY = 'retro-ball.settings.v1';

function pick<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'number' && (allowed as readonly number[]).includes(value) ? (value as T) : fallback;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Reads saved settings; any missing or invalid field falls back to its default. */
export function loadSettings(): QualitySettings {
  const d = DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...d };
    const s = JSON.parse(raw) as Partial<Record<keyof QualitySettings, unknown>>;
    return {
      frameCap: pick(s.frameCap, SETTING_OPTIONS.frameCap, d.frameCap),
      pixelRatioCap: pick(s.pixelRatioCap, SETTING_OPTIONS.pixelRatioCap, d.pixelRatioCap),
      antialias: pickBool(s.antialias, d.antialias),
      bloom: pickBool(s.bloom, d.bloom),
      nebulaScale: pick(s.nebulaScale, SETTING_OPTIONS.nebulaScale, d.nebulaScale),
    };
  } catch {
    return { ...d };
  }
}

export function saveSettings(s: QualitySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode, quota). The game still runs.
  }
}
