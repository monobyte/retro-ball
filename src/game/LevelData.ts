/**
 * Level data for "The Neon Grid Circuit".
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
 * Contiguous tiles in each row are merged into single slabs; each hole
 * becomes a `void` hazard marker so it renders as a data void.
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
  const isHole = (c: number, r: number) => holes.some(([hc, hr]) => hc === c && hr === r);
  for (let r = 0; r < rows; r++) {
    let runStart = -1;
    for (let c = 0; c <= cols; c++) {
      const solid = c < cols && !isHole(c, r);
      if (solid && runStart < 0) runStart = c;
      if (!solid && runStart >= 0) {
        const w = c - runStart;
        out.push({ kind: 'slab', x: x0 + runStart + w / 2, z: z0 + r + 0.5, w, d: 1, y, tone });
        runStart = -1;
      }
    }
  }
  for (const [c, r] of holes) {
    out.push({ kind: 'void', x: x0 + c + 0.5, z: z0 + r + 0.5, w: 1, d: 1, y });
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* THE NEON GRID CIRCUIT                                                    */
/*                                                                          */
/* A large loop that winds -z, +x, -z, +x, up, -x (speed run), -z, -x, up,  */
/* +z and finally back down towards the start. The full course spans        */
/* roughly 50 x 65 tiles, several screens in every direction.               */
/* ------------------------------------------------------------------------ */

export const LEVEL: LevelDefinition = {
  name: 'NEON GRID CIRCUIT',
  start: { x: 0, y: 0.6, z: 1 },
  pieces: [
    // ---------------------------------------------------------------- 01
    // BOOT SECTOR: start pad with a bumper chicane.
    { kind: 'slab', x: 0, z: 0, w: 7, d: 7, y: 0, label: 'START' },
    { kind: 'slab', x: 0, z: -7.5, w: 3, d: 8, y: 0 },
    { kind: 'wall', x: -0.75, z: -5.5, w: 1.5, d: 0.5, y: 0, h: 1, tone: 'pink' },
    { kind: 'wall', x: 0.75, z: -8.5, w: 1.5, d: 0.5, y: 0, h: 1, tone: 'pink' },

    // ---------------------------------------------------------------- 02
    // Ramp up onto the laser plateau.
    { kind: 'ramp', x: 0, z: -14.5, len: 6, w: 3, y0: 0, y1: 3, dir: '-z' },

    // ---------------------------------------------------------------- 03
    // LASER PLATEAU: two sweeping beams and a pair of pylons.
    { kind: 'slab', x: 0, z: -22, w: 9, d: 9, y: 3 },
    { kind: 'wall', x: -4.75, z: -22, w: 0.5, d: 9, y: 3, h: 1.2 },
    { kind: 'wall', x: 0, z: -26.75, w: 9, d: 0.5, y: 3, h: 1.2 },
    { kind: 'laser', x: 0, z: -20, y: 3, axis: 'x', length: 9, sweep: 1.4, speed: 0.35 },
    { kind: 'laser', x: 0, z: -24.5, y: 3, axis: 'x', length: 9, sweep: 1.4, speed: 0.35, phase: 0.5 },

    // ---------------------------------------------------------------- 04
    // NARROW LEDGE heading +x over the void, with a jog in the middle.
    { kind: 'slab', x: 8, z: -22, w: 7, d: 1.4, y: 3, tone: 'pink' },
    { kind: 'slab', x: 11.5, z: -20.5, w: 1.4, d: 4.4, y: 3, tone: 'pink' },
    { kind: 'slab', x: 15.5, z: -19, w: 7, d: 1.4, y: 3, tone: 'pink' },

    // Checkpoint pad A.
    { kind: 'slab', x: 21, z: -19, w: 4, d: 4, y: 3, tone: 'cyan' },
    { kind: 'checkpoint', x: 21, z: -19, y: 3, id: 1 },

    // ---------------------------------------------------------------- 05
    // JUMP PAD over a gap toward -z, landing on a raised platform.
    { kind: 'slab', x: 21, z: -23, w: 2.4, d: 4, y: 3, tone: 'cyan' },
    { kind: 'jumppad', x: 21, z: -24.6, y: 3, targetX: 21, targetZ: -32.5, targetY: 4.6 },
    { kind: 'slab', x: 21, z: -34, w: 6, d: 7, y: 4 },
    { kind: 'wall', x: 21, z: -37.25, w: 6, d: 0.5, y: 4, h: 1.2 },
    { kind: 'wall', x: 18.25, z: -34, w: 0.5, d: 7, y: 4, h: 1.2 },

    // ---------------------------------------------------------------- 06
    // Corridor +x to the first light-elevator.
    { kind: 'slab', x: 27, z: -33.5, w: 6, d: 3, y: 4 },
    { kind: 'elevator', x: 31.5, z: -33.5, w: 3, d: 3, y0: 4, y1: 10, period: 9 },

    // ---------------------------------------------------------------- 07
    // HIGH PLATFORM and the long high-speed downhill ramp toward -x.
    { kind: 'slab', x: 31.5, z: -38, w: 5, d: 6, y: 10 },
    { kind: 'wall', x: 33.75, z: -38, w: 0.5, d: 6, y: 10, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: 31.5, z: -40.75, w: 5, d: 0.5, y: 10, h: 1.2, tone: 'pink' },
    { kind: 'ramp', x: 19, z: -38.5, len: 20, w: 3, y0: 10, y1: 4, dir: '-x' },

    // ---------------------------------------------------------------- 08
    // VOID FIELD: a wide slab riddled with data voids at speed.
    ...tileField(-5, -42, 14, 8, 4, [
      [9, 3], [9, 4],
      [8, 1], [8, 6],
      [6, 3], [6, 4],
      [4, 0], [4, 1], [4, 6], [4, 7],
      [2, 2], [2, 3], [2, 4], [2, 5],
      [0, 0], [0, 7],
    ]),
    { kind: 'wall', x: -5.25, z: -38, w: 0.5, d: 8, y: 4, h: 1.2 },

    // ---------------------------------------------------------------- 09
    // Narrow ledge -z to checkpoint B.
    { kind: 'slab', x: -2, z: -46, w: 2, d: 8, y: 4, tone: 'pink' },
    { kind: 'slab', x: -2, z: -52, w: 4, d: 4, y: 4, tone: 'cyan' },
    { kind: 'checkpoint', x: -2, z: -52, y: 4, id: 2 },

    // ---------------------------------------------------------------- 10
    // Corridor -x with a laser gate, then the second light-elevator.
    { kind: 'slab', x: -8, z: -52, w: 8, d: 3, y: 4 },
    { kind: 'laser', x: -8, z: -52, y: 4, axis: 'z', length: 3, sweep: 0, speed: 0, gatePeriod: 2.4, gateDuty: 0.5 },
    { kind: 'elevator', x: -13.5, z: -52, w: 3, d: 3, y0: 4, y1: 9, period: 8, phase: 0.5 },

    // ---------------------------------------------------------------- 11
    // SKYWAY: a long elevated corridor heading +z (back toward the start)
    // through a series of timed laser gates.
    { kind: 'slab', x: -13.5, z: -47.5, w: 5, d: 6, y: 9 },
    { kind: 'wall', x: -15.75, z: -47.5, w: 0.5, d: 6, y: 9, h: 1.2, tone: 'pink' },
    { kind: 'slab', x: -13.5, z: -35, w: 3, d: 19, y: 9 },
    { kind: 'laser', x: -13.5, z: -42, y: 9, axis: 'x', length: 3, sweep: 0, speed: 0, gatePeriod: 2.0, gateDuty: 0.5, phase: 0.0 },
    { kind: 'laser', x: -13.5, z: -37, y: 9, axis: 'x', length: 3, sweep: 0, speed: 0, gatePeriod: 2.0, gateDuty: 0.5, phase: 0.5 },
    { kind: 'laser', x: -13.5, z: -32, y: 9, axis: 'x', length: 3, sweep: 0, speed: 0, gatePeriod: 2.0, gateDuty: 0.5, phase: 0.0 },

    // ---------------------------------------------------------------- 12
    // SPIRAL DROP: jump pad off the skyway onto a floating island, then a
    // steep ramp down to the final approach.
    { kind: 'slab', x: -13.5, z: -24, w: 5, d: 3, y: 9, tone: 'cyan' },
    { kind: 'jumppad', x: -13.5, z: -23.2, y: 9, targetX: -19.5, targetZ: -16.5, targetY: 7.6 },
    { kind: 'slab', x: -20, z: -15.5, w: 7, d: 7, y: 7 },
    { kind: 'wall', x: -23.25, z: -15.5, w: 0.5, d: 7, y: 7, h: 1.2, tone: 'pink' },
    { kind: 'wall', x: -20, z: -18.75, w: 7, d: 0.5, y: 7, h: 1.2, tone: 'pink' },
    { kind: 'ramp', x: -20, z: -8.5, len: 7, w: 3, y0: 7, y1: 3, dir: '+z' },

    // ---------------------------------------------------------------- 13
    // FINAL APPROACH: a narrow S-bend of ledges toward +x with one last
    // sweeping laser, then the GOAL plateau.
    { kind: 'slab', x: -20, z: -5, w: 3, d: 3, y: 3 },
    { kind: 'slab', x: -16, z: -5, w: 5, d: 1.4, y: 3, tone: 'pink' },
    { kind: 'slab', x: -13.8, z: -2.5, w: 1.4, d: 6.4, y: 3, tone: 'pink' },
    { kind: 'slab', x: -11, z: 0, w: 4.2, d: 1.4, y: 3, tone: 'pink' },
    { kind: 'slab', x: -9.5, z: 3.5, w: 7, d: 7, y: 3 },
    { kind: 'laser', x: -9.5, z: 3.5, y: 3, axis: 'z', length: 7, sweep: 2.4, speed: 0.3 },
    { kind: 'slab', x: -9.5, z: 9.5, w: 7, d: 5, y: 3, label: 'GOAL' },
    { kind: 'wall', x: -9.5, z: 12.25, w: 7, d: 0.5, y: 3, h: 1.4, tone: 'pink' },
    { kind: 'goal', x: -9.5, z: 10, w: 3, d: 2.4, y: 3 },
  ],
};
