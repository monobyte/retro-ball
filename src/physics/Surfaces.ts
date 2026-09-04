export const SURFACE_IDS = ['standard', 'ice', 'rubber', 'rough'] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];
export interface SurfaceProfile {
  label: string; friction: number; restitution: number; ballRestitution: number;
  acceleration: number; braking: number; drag: number; pattern: number;
  linearDamping: number; angularDamping: number; speedLimit: number; turnGrip: number;
  fill: [number, number, number]; line: [number, number, number];
  soundPitch: number; soundGain: number;
}
/** Standard values preserve the original course; differences are explicit and shared. */
export const SURFACES: Record<SurfaceId, SurfaceProfile> = {
  standard: { label: 'GRID', friction: 1, restitution: .35, ballRestitution: .42, acceleration: 1, braking: 24, drag: 0, pattern: 0, linearDamping: .25, angularDamping: .35, speedLimit: 16, turnGrip: 0, fill: [.11, .05, .3], line: [.22, .6, 1], soundPitch: 1, soundGain: 1 },
  ice: { label: 'ICE · DRIFT', friction: .008, restitution: .12, ballRestitution: .12, acceleration: .35, braking: 3, drag: 0, pattern: 1, linearDamping: .015, angularDamping: .03, speedLimit: 16, turnGrip: 0, fill: [.12, .38, .48], line: [.4, .85, 1], soundPitch: 1.7, soundGain: .75 },
  rubber: { label: 'RUBBER · GRIP', friction: 1.8, restitution: .82, ballRestitution: .82, acceleration: 1.5, braking: 42, drag: 1.2, pattern: 2, linearDamping: .25, angularDamping: .5, speedLimit: 14, turnGrip: 9, fill: [.16, .035, .018], line: [1, .23, .045], soundPitch: .65, soundGain: .8 },
  rough: { label: 'GRIT · HEAVY', friction: 2, restitution: .1, ballRestitution: .1, acceleration: .6, braking: 30, drag: 2.4, pattern: 3, linearDamping: .55, angularDamping: 1.2, speedLimit: 6, turnGrip: 3, fill: [.2, .13, .035], line: [.85, .58, .16], soundPitch: .65, soundGain: 1.8 },
};
