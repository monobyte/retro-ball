export const SURFACE_IDS = ['standard', 'ice', 'rubber', 'rough'] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];
export interface SurfaceProfile {
  label: string; friction: number; restitution: number; ballRestitution: number;
  acceleration: number; braking: number; drag: number; pattern: number;
  soundPitch: number; soundGain: number;
}
/** Standard values preserve the original course; differences are explicit and shared. */
export const SURFACES: Record<SurfaceId, SurfaceProfile> = {
  standard: { label: 'GRID', friction: 1, restitution: .35, ballRestitution: .42, acceleration: 1, braking: 24, drag: 0, pattern: 0, soundPitch: 1, soundGain: 1 },
  ice: { label: 'ICE', friction: .025, restitution: .12, ballRestitution: .12, acceleration: .65, braking: 5, drag: 0, pattern: 1, soundPitch: 1.7, soundGain: .4 },
  rubber: { label: 'RUBBER', friction: 1.8, restitution: .82, ballRestitution: .82, acceleration: 1.1, braking: 32, drag: .3, pattern: 2, soundPitch: .65, soundGain: .8 },
  rough: { label: 'ROUGH', friction: 2, restitution: .1, ballRestitution: .1, acceleration: .8, braking: 30, drag: .9, pattern: 3, soundPitch: .8, soundGain: 1.65 },
};
