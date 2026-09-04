/**
 * Level data for "The Retro Ball".
 *
 * Everything here is declarative: pieces are described in world units where
 * 1 unit = 1 grid tile. Level.ts turns these into physics colliders and meshes.
 *
 * Coordinate conventions:
 *   - x/z: horizontal plane, y: up.
 *   - `y` on a slab is the height of its TOP surface.
 *   - The isometric camera looks along (-1, -1, -1), so "screen up" is (-x, -z).
 */

export type Dir = '+x' | '-x' | '+z' | '-z';
export const DIR_VEC: Record<Dir, readonly [number, number]> = {
  '+x': [1, 0],
  '-x': [-1, 0],
  '+z': [0, 1],
  '-z': [0, -1],
};

/** Colour scheme of a piece. Controls grid-line and edge colours. */
export type Tone = 'blue' | 'pink' | 'cyan';

export type SlabPiece = {
  kind: 'slab';
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  thick?: number;
  tone?: Tone;
  label?: string;
  /** Shared tile-grid origin for fragments of one floor surface. */
  gridOrigin?: { x: number; z: number };
};

export type RampPiece = {
  kind: 'ramp';
  /** Centre of the ramp footprint (horizontal). */
  x: number;
  z: number;
  /** Horizontal length along `dir` and width across it. */
  len: number;
  w: number;
  /** Height at the start and at the end of travel along `dir`. */
  y0: number;
  y1: number;
  dir: Dir;
  thick?: number;
  tone?: Tone;
};

export type WallPiece = {
  kind: 'wall';
  x: number;
  z: number;
  w: number;
  d: number;
  /** Floor height the wall stands on. */
  y: number;
  h: number;
  tone?: Tone;
};

export type JumpPadPiece = {
  kind: 'jumppad';
  x: number;
  z: number;
  y: number;
  /** Where the marble should land (centre of the marble). */
  targetX: number;
  targetZ: number;
  targetY: number;
  /** Extra apex height above the higher of the two ends. */
  arc?: number;
};

export type ElevatorPiece = {
  kind: 'elevator';
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  y1: number;
  /** Full cycle duration in seconds (dwell, rise, dwell, descend). */
  period: number;
  phase?: number;
};

export type LaserPiece = {
  kind: 'laser';
  x: number;
  z: number;
  /** Floor height. The beam hovers slightly above it. */
  y: number;
  /** Axis the beam runs along; it sweeps along the perpendicular axis. */
  axis: 'x' | 'z';
  length: number;
  /** Sweep amplitude (0 = static beam). */
  sweep: number;
  /** Sweep cycles per second. */
  speed: number;
  /**
   * Seconds the beam parks, switched OFF, at each end of its sweep. This is
   * the safe window for crossing a sweeping beam. Ignored when sweep is 0.
   */
  dwell?: number;
  phase?: number;
  /** Optional on/off gating: period in seconds and fraction of time ON. */
  gatePeriod?: number;
  gateDuty?: number;
};

export type VoidPiece = {
  kind: 'void';
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
};

export type CheckpointPiece = {
  kind: 'checkpoint';
  x: number;
  z: number;
  y: number;
  id: number;
};

export type GoalPiece = {
  kind: 'goal';
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
};

export type Piece =
  | SlabPiece
  | RampPiece
  | WallPiece
  | JumpPadPiece
  | ElevatorPiece
  | LaserPiece
  | VoidPiece
  | CheckpointPiece
  | GoalPiece;

export interface LevelDefinition {
  name: string;
  start: { x: number; y: number; z: number };
  pieces: Piece[];
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Emits a rectangular field of tiles (cols x rows) with holes punched out.
 * Openings have clearance around the one-tile-diameter marble. Split the
 * floor into horizontal bands around the openings, using the same bounds
 * for the solid slabs and their void markers.
 */
function tileField(
  x0: number,
  z0: number,
  cols: number,
  rows: number,
  y: number,
  holes: ReadonlyArray<readonly [number, number]>,
  tone: Tone = 'blue',
): Piece[] {
  const out: Piece[] = [];
  const clearance = 0.25;
  const openings = holes.map(([c, r]) => ({
    xMin: Math.max(x0, x0 + c - clearance),
    xMax: Math.min(x0 + cols, x0 + c + 1 + clearance),
    zMin: Math.max(z0, z0 + r - clearance),
    zMax: Math.min(z0 + rows, z0 + r + 1 + clearance),
  }));
  const bands = [...new Set([z0, z0 + rows, ...openings.flatMap(h => [h.zMin, h.zMax])])].sort((a, b) => a - b);
  const gridOrigin = { x: x0, z: z0 };
  for (let i = 1; i < bands.length; i++) {
    const zMin = bands[i - 1]!;
    const zMax = bands[i]!;
    const cuts = openings.filter(h => h.zMin < zMax && h.zMax > zMin).sort((a, b) => a.xMin - b.xMin);
    let start = x0;
    const addSlab = (end: number): void => {
      if (end <= start) return;
      out.push({ kind: 'slab', x: (start + end) / 2, z: (zMin + zMax) / 2, w: end - start, d: zMax - zMin, y, tone, gridOrigin });
    };
    for (const cut of cuts) {
      addSlab(cut.xMin);
      start = Math.max(start, cut.xMax);
    }
    addSlab(x0 + cols);
  }
  for (const h of openings) {
    out.push({ kind: 'void', x: (h.xMin + h.xMax) / 2, z: (h.zMin + h.zMax) / 2, w: h.xMax - h.xMin, d: h.zMax - h.zMin, y });
  }
  return out;
}

/** Height of a bumper rail. The marble centre sits at 0.5, so a rail always catches it. */
const RAIL_HEIGHT = 0.6;

/** Low bumper rail along the open edge of a ledge: a drift becomes a bounce, not a fall. */
function rail(x: number, z: number, w: number, d: number, y: number): WallPiece {
  return { kind: 'wall', x, z, w, d, y, h: RAIL_HEIGHT, tone: 'pink' };
}

/* ------------------------------------------------------------------------ */
/* THE NEON GRID CIRCUIT                                                    */
/*                                                                          */
/* A large loop that winds -z, +x, -z, +x, up, -x (speed run), -z, -x, up,  */
/* +z and finally back down towards the start. The full course spans        */
/* roughly 50 x 65 tiles, several screens in every direction.               */
/*                                                                          */
/* Fairness rules: every ledge is at least 3 tiles wide and railed on its   */
/* open edges; every sweeping laser parks safe (blue) at each end of its    */
/* sweep; every gated laser flickers before it goes live; five checkpoints. */
/* ------------------------------------------------------------------------ */

export const LEVEL: LevelDefinition = {
  name: 'NEON GRID CIRCUIT',
  start: { x: 0, y: 0.6, z: 1 },
  pieces: [
    // ---------------------------------------------------------------- 01
    // BOOT SECTOR: start pad with a bumper chicane.
    { kind: 'slab', x: 0, z: 0, w: 7, d: 7, y: 0, label: 'START' },
    { kind: 'slab', x: 0, z: -7.5, w: 4, d: 8, y: 0 },
    { kind: 'wall', x: -1, z: -5.5, w: 2, d: 0.5, y: 0, h: 1, tone: 'pink' },
    { kind: 'wall', x: 1, z: -8.5, w: 2, d: 0.5, y: 0, h: 1, tone: 'pink' },

    // ---------------------------------------------------------------- 02
    // Ramp up onto the laser plateau.
    { kind: 'ramp', x: 0, z: -14.5, len: 6, w: 3, y0: 0, y1: 3, dir: '-z' },

    // ---------------------------------------------------------------- 03
    // LASER PLATEAU: one sweeping beam that parks safe at each end of its sweep.
    { kind: 'slab', x: 0, z: -22, w: 9, d: 9, y: 3 },
    { kind: 'wall', x: -4.75, z: -22, w: 0.5, d: 9, y: 3, h: 1.2 },
    { kind: 'wall', x: 0, z: -26.75, w: 9, d: 0.5, y: 3, h: 1.2 },
    // Sweep -24.4..-19.6: the ramp top (z -17.5) stays out of reach, so you can wait there.
    { kind: 'laser', x: 0, z: -22, y: 3, axis: 'x', length: 9, sweep: 2.4, speed: 0.16, dwell: 2.5 },

    // ---------------------------------------------------------------- 04
    // LEDGE heading +x over the void, with a jog in the middle. Railed.
    // Slabs meet at the jog edges; overlapping coplanar tops cause z-fighting.
    { kind: 'slab', x: 7.25, z: -22, w: 5.5, d: 3, y: 3, tone: 'pink' },
    { kind: 'slab', x: 11.5, z: -20.5, w: 3, d: 6, y: 3, tone: 'pink' },
    { kind: 'slab', x: 16, z: -19, w: 6, d: 3, y: 3, tone: 'pink' },
    rail(8.75, -23.75, 8.5, 0.5, 3), // ledge 1 + jog, -z edge (x 4.5..13)
    rail(7.25, -20.25, 5.5, 0.5, 3), // ledge 1, +z edge up to the jog (x 4.5..10)
    rail(13.25, -22, 0.5, 3, 3), // jog, +x edge (z -23.5..-20.5)
    rail(9.75, -19, 0.5, 3, 3), // jog, -x edge (z -20.5..-17.5)
    rail(14.5, -17.25, 9, 0.5, 3), // jog + ledge 3, +z edge (x 10..19)
    rail(16, -20.75, 6, 0.5, 3), // ledge 3, -z edge (x 13..19)

    // Checkpoint pad A.
    { kind: 'slab', x: 21, z: -19, w: 4, d: 4, y: 3, tone: 'cyan' },
    { kind: 'checkpoint', x: 21, z: -19, y: 3, id: 1 },
    rail(21, -16.75, 4.5, 0.5, 3), // pad A, +z edge

    // ---------------------------------------------------------------- 05
    // JUMP PAD over a gap toward -z, landing on a raised platform.
    { kind: 'slab', x: 21, z: -23, w: 4, d: 4, y: 3, tone: 'cyan' },
    rail(18.75, -23, 0.5, 4, 3), // approach, -x edge
    rail(23.25, -21, 0.5, 8, 3), // approach + pad A, +x edge (z -25..-17)
    { kind: 'jumppad', x: 21, z: -24.6, y: 3, targetX: 21, targetZ: -32.5, targetY: 4.6 },
    { kind: 'slab', x: 21, z: -34, w: 6, d: 7, y: 4 },
    { kind: 'wall', x: 21, z: -37.25, w: 6, d: 0.5, y: 4, h: 1.2 },
    { kind: 'wall', x: 18.25, z: -34, w: 0.5, d: 7, y: 4, h: 1.2 },

    // ---------------------------------------------------------------- 06
    // Corridor +x to the first light-elevator.
    { kind: 'slab', x: 27, z: -34, w: 6, d: 7, y: 4 },
    { kind: 'wall', x: 30.25, z: -36.25, w: 0.5, d: 2.5, y: 4, h: 1.2 },
    { kind: 'wall', x: 30.25, z: -31.25, w: 0.5, d: 1.5, y: 4, h: 1.2 },
    rail(27, -37.75, 6, 0.5, 4), // corridor, -z edge
    rail(24, -30.25, 12, 0.5, 4), // landing + corridor, +z edge (x 18..30)
    { kind: 'elevator', x: 31.5, z: -33.5, w: 3, d: 3, y0: 4, y1: 10, period: 9 },

    // ---------------------------------------------------------------- 07
    // HIGH PLATFORM (checkpoint B) and the long high-speed downhill ramp toward -x.
    { kind: 'slab', x: 31.5, z: -38, w: 5, d: 6, y: 10 },
    { kind: 'checkpoint', x: 31.5, z: -38, y: 10, id: 2 },
    { kind: 'wall', x: 33.75, z: -38, w: 0.5, d: 6, y: 10, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: 31.5, z: -40.75, w: 5, d: 0.5, y: 10, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: 29.25, z: -36, w: 0.5, d: 2, y: 10, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: 29.25, z: -40.5, w: 0.5, d: 1, y: 10, h: 1.2, tone: 'pink' },
    { kind: 'ramp', x: 19, z: -38.5, len: 20, w: 3, y0: 10, y1: 4, dir: '-x' },

    // ---------------------------------------------------------------- 08
    // VOID FIELD: a wide slab with data voids on its outer lanes. The centre
    // braking lane stays 3.5 tiles deep after adding clearance to the holes.
    // Rails on three sides; the ramp mouth and the ledge to checkpoint C stay open.
    ...tileField(-5, -42, 14, 8, 4, [
      [0, 1], [6, 1], [9, 1], [12, 1],
      [1, 6], [4, 6], [7, 6], [10, 6], [13, 6],
    ]),
    { kind: 'wall', x: -5.25, z: -38, w: 0.5, d: 8, y: 4, h: 1.2 },
    rail(2, -33.75, 14, 0.5, 4), // +z edge (x -5..9)
    rail(-4.25, -42.25, 1.5, 0.5, 4), // -z edge, left of the ledge (x -5..-3.5)
    rail(4.25, -42.25, 9.5, 0.5, 4), // -z edge, right of the ledge (x -0.5..9)
    rail(9.25, -41, 0.5, 2, 4), // +x edge above the ramp mouth (z -42..-40)
    rail(9.25, -35.5, 0.5, 3, 4), // +x edge below the ramp mouth (z -37..-34)

    // ---------------------------------------------------------------- 09
    // Railed ledge -z to checkpoint C.
    { kind: 'slab', x: -2, z: -46, w: 3, d: 8, y: 4, tone: 'pink' },
    rail(-3.75, -46, 0.5, 8, 4),
    rail(-0.25, -46, 0.5, 8, 4),
    { kind: 'slab', x: -2, z: -52, w: 4, d: 4, y: 4, tone: 'cyan' },
    { kind: 'checkpoint', x: -2, z: -52, y: 4, id: 3 },
    rail(0.25, -52, 0.5, 4, 4), // pad C, +x edge
    rail(-2, -54.25, 4, 0.5, 4), // pad C, -z edge

    // ---------------------------------------------------------------- 10
    // Corridor -x with a laser gate, then the second light-elevator.
    { kind: 'slab', x: -8, z: -52, w: 8, d: 3, y: 4 },
    rail(-8, -50.25, 8, 0.5, 4),
    rail(-8, -53.75, 8, 0.5, 4),
    { kind: 'laser', x: -8, z: -52, y: 4, axis: 'z', length: 3, sweep: 0, speed: 0, gatePeriod: 4, gateDuty: 0.3 },
    { kind: 'elevator', x: -13.5, z: -52, w: 3, d: 3, y0: 4, y1: 9, period: 8, phase: 0.5 },

    // ---------------------------------------------------------------- 11
    // SKYWAY: a long elevated corridor heading +z (back toward the start)
    // through three timed laser gates. Each gate is off for 2.8 s of every
    // 4 s and they open in travel order 0.6 s apart, so you can ride the
    // wave or stop between gates and wait.
    { kind: 'slab', x: -13.5, z: -47.5, w: 5, d: 6, y: 9 },
    { kind: 'checkpoint', x: -13.5, z: -47.5, y: 9, id: 4 },
    { kind: 'wall', x: -15.75, z: -47.5, w: 0.5, d: 6, y: 9, h: 1.2, tone: 'pink' },
    { kind: 'slab', x: -13.5, z: -35, w: 4, d: 19, y: 9 },
    rail(-15.75, -35, 0.5, 19, 9), // skyway, -x edge
    rail(-11.25, -38, 0.5, 25, 9), // skyway start + skyway, +x edge (z -50.5..-25.5)
    { kind: 'laser', x: -13.5, z: -42, y: 9, axis: 'x', length: 4, sweep: 0, speed: 0, gatePeriod: 4, gateDuty: 0.3, phase: 0.0 },
    { kind: 'laser', x: -13.5, z: -37, y: 9, axis: 'x', length: 4, sweep: 0, speed: 0, gatePeriod: 4, gateDuty: 0.3, phase: 0.85 },
    { kind: 'laser', x: -13.5, z: -32, y: 9, axis: 'x', length: 4, sweep: 0, speed: 0, gatePeriod: 4, gateDuty: 0.3, phase: 0.7 },

    // ---------------------------------------------------------------- 12
    // SPIRAL DROP: jump pad off the skyway onto a floating island, then a
    // steep ramp down to the final approach.
    { kind: 'slab', x: -13.5, z: -24, w: 5, d: 3, y: 9, tone: 'cyan' },
    rail(-16.25, -24, 0.5, 3, 9),
    rail(-10.75, -24, 0.5, 3, 9),
    { kind: 'jumppad', x: -13.5, z: -23.2, y: 9, targetX: -19.5, targetZ: -16.5, targetY: 7.6 },
    { kind: 'slab', x: -20, z: -15.5, w: 7, d: 7, y: 7 },
    { kind: 'checkpoint', x: -20, z: -15.5, y: 7, id: 5 },
    { kind: 'wall', x: -23.25, z: -15.5, w: 0.5, d: 7, y: 7, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: -20, z: -18.75, w: 7, d: 0.5, y: 7, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: -22.5, z: -12.25, w: 2, d: 0.5, y: 7, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: -17.5, z: -12.25, w: 2, d: 0.5, y: 7, h: 1.2, tone: 'pink' },
    rail(-16.25, -15.5, 0.5, 7, 7), // island, +x edge
    { kind: 'ramp', x: -20, z: -8.5, len: 7, w: 3, y0: 7, y1: 3, dir: '+z' },

    // ---------------------------------------------------------------- 13
    // FINAL APPROACH: a railed S-bend of ledges toward +x with one last
    // sweeping laser (parks safe at each end), then the GOAL plateau.
    { kind: 'slab', x: -20, z: -4.5, w: 4, d: 4, y: 3 },
    { kind: 'wall', x: -18.65, z: -2.25, w: 6.7, d: 0.5, y: 3, h: 1.2, tone: 'pink' }, // +z edge (x -22..-15.3)
    { kind: 'wall', x: -22.25, z: -4.5, w: 0.5, d: 4, y: 3, h: 1.2, tone: 'pink' },
    // Partition the bend at the landing, jog and goal boundaries so each
    // floor point is drawn once, with the same overall track footprint.
    { kind: 'slab', x: -16.65, z: -4.5, w: 2.7, d: 4, y: 3, tone: 'pink' },
    { kind: 'slab', x: -13.8, z: -3.25, w: 3, d: 6.5, y: 3, tone: 'pink' },
    { kind: 'slab', x: -14.15, z: 0.75, w: 2.3, d: 1.5, y: 3, tone: 'pink' },
    { kind: 'slab', x: -10.6, z: -0.75, w: 3.4, d: 1.5, y: 3, tone: 'pink' },
    rail(-15.4, -6.75, 6.2, 0.5, 3), // ledge 1 + jog, -z edge (x -18.5..-12.3)
    rail(-15.55, -0.5, 0.5, 4, 3), // jog, -x edge (z -2.5..1.5)
    rail(-14.2, 1.75, 2.2, 0.5, 3), // jog, +z edge (x -15.3..-13.1)
    rail(-12.05, -4, 0.5, 5, 3), // jog, +x edge (z -6.5..-1.5)
    rail(-10.6, -1.75, 3.4, 0.5, 3), // ledge 3, -z edge (x -12.3..-8.9)
    rail(-7.45, -0.25, 2.9, 0.5, 3), // goal plateau, -z edge (x -8.9..-6)
    { kind: 'slab', x: -9.5, z: 3.5, w: 7, d: 7, y: 3 },
    // Sweep 2.4..5.6: the plateau entrance (z 0..1.5) stays out of reach, so you can wait there.
    { kind: 'laser', x: -9.5, z: 4, y: 3, axis: 'x', length: 7, sweep: 1.6, speed: 0.18, dwell: 2.5 },
    { kind: 'slab', x: -9.5, z: 9.5, w: 7, d: 5, y: 3, label: 'GOAL' },
    rail(-13.25, 6.75, 0.5, 10.5, 3), // plateau + goal, -x edge (z 1.5..12)
    rail(-5.75, 6, 0.5, 12, 3), // plateau + goal, +x edge (z 0..12)
    { kind: 'wall', x: -9.5, z: 12.25, w: 7, d: 0.5, y: 3, h: 1.4, tone: 'pink' },
    { kind: 'goal', x: -9.5, z: 10, w: 3, d: 2.4, y: 3 },
  ],
};
