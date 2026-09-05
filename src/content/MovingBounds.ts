import type { MechanicalPiece, ReactivePlatePiece, Piece } from '../game/LevelData.ts';

export type MovingPiece = MechanicalPiece | ReactivePlatePiece;
export function isMovingPiece(piece: Piece): piece is MovingPiece {
  return ['conveyor', 'bridge', 'rotator', 'seesaw', 'fragile'].includes(piece.kind);
}

/** Full swept footprint, shared by authoring checks and danger overlays. */
export function movingBounds(piece: MovingPiece) {
  let minX = piece.x - piece.w / 2, maxX = piece.x + piece.w / 2;
  let minZ = piece.z - piece.d / 2, maxZ = piece.z + piece.d / 2;
  const radius = piece.kind === 'rotator' ? Math.hypot(piece.w, piece.d) / 2 : 0;
  if (radius) {
    minX = piece.x - radius; maxX = piece.x + radius;
    minZ = piece.z - radius; maxZ = piece.z + radius;
  }
  if (piece.kind === 'bridge' || (piece.kind === 'fragile' && piece.mode === 'retract')) {
    const travel = piece.kind === 'bridge' ? piece.distance : (piece.dir.endsWith('x') ? piece.w : piece.d) + 1.5;
    const distance = travel * (piece.dir.startsWith('-') ? -1 : 1);
    if (piece.dir.endsWith('x')) { minX += Math.min(0, distance); maxX += Math.max(0, distance); }
    else { minZ += Math.min(0, distance); maxZ += Math.max(0, distance); }
  }
  let minY = piece.y - (piece.kind === 'seesaw' || piece.kind === 'fragile' ? .4 : .6), maxY = piece.y;
  if (piece.kind === 'fragile' && piece.mode === 'drop') minY -= 3;
  if (piece.kind === 'seesaw') {
    const angle = piece.maxTilt * Math.PI / 180;
    const extent = (piece.axis === 'z' ? piece.w : piece.d) / 2;
    minY -= extent * Math.sin(angle); maxY += extent * Math.sin(angle);
    // Tilting the deck's thickness can sweep just outside its flat footprint.
    if (piece.axis === 'z') { minX -= .2 * Math.sin(angle); maxX += .2 * Math.sin(angle); }
    else { minZ -= .2 * Math.sin(angle); maxZ += .2 * Math.sin(angle); }
  }
  return { minX, maxX, minZ, maxZ, minY, maxY, radius };
}

/** Exact circle/rectangle footprint test for rotators; rectangle test otherwise. */
export function sweepOverlaps(piece: MovingPiece, box: { x: number; z: number; w: number; d: number }, clearance = 0): boolean {
  const bounds = movingBounds(piece);
  if (bounds.radius) {
    const dx = Math.max(0, Math.abs(piece.x - box.x) - box.w / 2);
    const dz = Math.max(0, Math.abs(piece.z - box.z) - box.d / 2);
    return Math.hypot(dx, dz) < bounds.radius + clearance - 1e-6;
  }
  return Math.min(bounds.maxX + clearance, box.x + box.w / 2) - Math.max(bounds.minX - clearance, box.x - box.w / 2) > 1e-6
    && Math.min(bounds.maxZ + clearance, box.z + box.d / 2) - Math.max(bounds.minZ - clearance, box.z - box.d / 2) > 1e-6;
}
