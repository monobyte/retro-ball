import type { Piece, LevelDefinition, Dir } from '../game/LevelData';

export const LEVEL_SCHEMA_VERSION = 1;
export type Vec3 = { x: number; y: number; z: number };
export type QuarterTurn = 0 | 90 | 180 | 270;
export type PieceKind = Piece['kind'];
export type InstanceId = string;
export type ResetGroupId = string;
export type Port = 'activated' | 'completed' | 'enable' | 'reset';
export interface InstanceLink {
  output: Port;
  target: { instanceId: InstanceId; input: Port };
}

/** Dimensions are local to the transform; y1 and jump targets are local offsets. */
export type Parameters<K extends PieceKind> = Omit<Extract<Piece, { kind: K }>, 'kind' | 'x' | 'y' | 'z' | 'y0'>;
export type LevelInstance<K extends PieceKind = PieceKind> = K extends PieceKind ? {
  id: InstanceId;
  type: K;
  transform: { position: Vec3; yaw: QuarterTurn };
  parameters: Parameters<K>;
  resetGroup: ResetGroupId;
  links: InstanceLink[];
} : never;

export interface LevelDocument {
  schemaVersion: 1;
  contentVersion: number;
  id: string;
  metadata: { name: string; description: string; difficulty: 'test' | 'easy' | 'normal' | 'hard' };
  themeId: string;
  musicId: string;
  spawn: Vec3;
  instances: LevelInstance[];
  resetGroups: Array<{ id: ResetGroupId; policy: 'attempt' | 'checkpoint' | 'course' }>;
  checkpoints: Array<{
    id: string;
    instanceId: InstanceId;
    spawn: Vec3;
    resetGroups: ResetGroupId[];
  }>;
  objectives: Array<{ id: string; type: 'reach-goal'; target: InstanceId; required: boolean }>;
  signals: Array<{ id: string; source: { instanceId: InstanceId; port: Port }; target: { instanceId: InstanceId; port: Port } }>;
  navigation: {
    nodes: Array<{ id: string; instanceId: InstanceId; position: Vec3 }>;
    links: Array<{ from: string; to: string; traversal: 'roll' | 'jump' | 'elevator'; bidirectional: boolean }>;
  };
  cameraZones: Array<{ id: string; center: Vec3; size: Vec3; viewHeight: number }>;
  validation: { intendedRoute: InstanceId[]; notes: string[] };
}

function rotate(x: number, z: number, yaw: QuarterTurn): [number, number] {
  switch (yaw) {
    case 0: return [x, z];
    case 90: return [z, -x];
    case 180: return [-x, -z];
    case 270: return [-z, x];
  }
}

/** Compile a validated instance to the existing render/physics dimensions. */
export function resolveInstance(instance: LevelInstance): Piece {
  const { position, yaw } = instance.transform;
  const p = { ...structuredClone(instance.parameters), kind: instance.type, x: position.x, z: position.z } as Piece;
  if (p.kind === 'ramp' || p.kind === 'elevator') {
    p.y0 = position.y;
    p.y1 += position.y;
  } else p.y = position.y;
  if ('w' in p && 'd' in p && (yaw === 90 || yaw === 270)) [p.w, p.d] = [p.d, p.w];
  if (p.kind === 'ramp') {
    const dirs: Dir[] = ['+x', '-z', '-x', '+z'];
    p.dir = dirs[(dirs.indexOf(p.dir) + yaw / 90) % 4]!;
  }
  if (p.kind === 'laser') {
    const [x, z] = rotate(p.axis === 'z' ? 1 : 0, p.axis === 'x' ? 1 : 0, yaw);
    if (yaw === 90 || yaw === 270) p.axis = p.axis === 'x' ? 'z' : 'x';
    p.sweep *= p.axis === 'x' ? z : x;
  }
  if (p.kind === 'jumppad') {
    const [x, z] = rotate(p.targetX, p.targetZ, yaw);
    p.targetX = position.x + x; p.targetY += position.y; p.targetZ = position.z + z;
  }
  if (p.kind === 'slab' && p.gridOrigin) {
    const [x, z] = rotate(p.gridOrigin.x, p.gridOrigin.z, yaw);
    p.gridOrigin = { x: position.x + x, z: position.z + z };
  }
  return p;
}

export function resolveLevel(document: LevelDocument): LevelDefinition {
  return { name: document.metadata.name, start: { ...document.spawn }, pieces: document.instances.map(resolveInstance) };
}

/** One-time adapter; authored IDs are stored in JSON and never recomputed at load. */
export function documentFromLegacy(level: LevelDefinition, id: string): LevelDocument {
  const instances: LevelInstance[] = level.pieces.map((piece, index) => {
    const parameters = structuredClone(piece) as unknown as Record<string, unknown>;
    const y = 'y' in piece ? piece.y : piece.y0;
    for (const key of ['kind', 'x', 'y', 'z', 'y0']) delete parameters[key];
    if ('y1' in piece) parameters['y1'] = piece.y1 - y;
    if (piece.kind === 'jumppad') { parameters['targetX'] = piece.targetX - piece.x; parameters['targetY'] = piece.targetY - y; parameters['targetZ'] = piece.targetZ - piece.z; }
    if (piece.kind === 'slab' && piece.gridOrigin) parameters['gridOrigin'] = { x: piece.gridOrigin.x - piece.x, z: piece.gridOrigin.z - piece.z };
    return {
      id: `${piece.kind}-${String(index + 1).padStart(3, '0')}`,
      type: piece.kind, transform: { position: { x: piece.x, y, z: piece.z }, yaw: 0 },
      parameters, resetGroup: 'course', links: [],
    } as unknown as LevelInstance;
  });
  return {
    schemaVersion: 1, contentVersion: 1, id,
    metadata: { name: level.name, description: 'The original synthwave circuit.', difficulty: 'normal' },
    themeId: 'neon-grid', musicId: 'retro-main', spawn: { ...level.start }, instances,
    resetGroups: [{ id: 'course', policy: 'course' }],
    checkpoints: instances.flatMap(instance => instance.type === 'checkpoint' ? [{
      id: `checkpoint-${instance.parameters.id}`, instanceId: instance.id,
      spawn: { ...instance.transform.position, y: instance.transform.position.y + 0.6 }, resetGroups: [],
    }] : []),
    objectives: instances.filter(instance => instance.type === 'goal').map(instance => ({ id: 'finish', type: 'reach-goal', target: instance.id, required: true })),
    signals: [], navigation: { nodes: [], links: [] }, cameraZones: [], validation: { intendedRoute: [], notes: [] },
  };
}
