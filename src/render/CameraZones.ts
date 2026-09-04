import type { Vec3 } from '../content/LevelDocument';

export type CameraMode = 'speed' | 'puzzle' | 'vertical' | 'arena';
export interface CameraZone {
  id: string;
  center: Vec3;
  size: Vec3;
  viewHeight: number;
  mode?: CameraMode;
  priority?: number;
}
export interface CameraTuning { zoneId: string | null; mode: CameraMode | 'follow'; viewHeight: number; lookAhead: number; response: number }
const MODES: Record<CameraMode, { lookAhead: number; response: number }> = {
  speed: { lookAhead: .5, response: 5 },
  puzzle: { lookAhead: .08, response: 4 },
  vertical: { lookAhead: .12, response: 5 },
  arena: { lookAhead: .24, response: 4 },
};

/** Stable priority and boundary hysteresis avoid flickering between overlapping zones. */
export function cameraTuning(zones: readonly CameraZone[], position: Vec3, speed: number, previous: string | null): CameraTuning {
  const contains = (zone: CameraZone, margin: number) => ['x', 'y', 'z'].every(axis => {
    const k = axis as keyof Vec3;
    return Math.abs(position[k] - zone.center[k]) <= zone.size[k] / 2 + margin;
  });
  const ordered = zones.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const entered = ordered.find(zone => contains(zone, 0));
  const current = zones.find(zone => zone.id === previous && contains(zone, .75));
  const zone = current && (!entered || (current.priority ?? 0) >= (entered.priority ?? 0)) ? current : entered;
  if (!zone) return { zoneId: null, mode: 'follow', viewHeight: 23 + Math.min(5, speed * .2), lookAhead: .28, response: 6 };
  const mode = zone.mode ?? 'arena';
  return { zoneId: zone.id, mode, viewHeight: zone.viewHeight + (mode === 'speed' ? Math.min(6, speed * .2) : 0), ...MODES[mode] };
}
