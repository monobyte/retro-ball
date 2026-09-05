import type { SignalPort, SignalValue } from '../signals/SignalTypes';
import type * as THREE from 'three';
import type { InstanceId, ResetGroupId, Vec3 } from '../content/LevelDocument';

export type LogicalValue = null | boolean | number | string | LogicalValue[] | { [key: string]: LogicalValue };
export interface VisualFrame { simulationTime: number; presentationTime: number; dt: number; beat: number; marblePosition: THREE.Vector3 }

/** No callbacks or Rapier handles are allowed in logical save/reset state. */
export interface RuntimeComponent {
  readonly id: InstanceId;
  readonly resetGroup: ResetGroupId;
  fixedUpdate(time: number, dt: number): void;
  visualUpdate(frame: VisualFrame): void;
  receiveSignal?(port: SignalPort, value: SignalValue): void;
  stateOutputs?(): Partial<Record<SignalPort, boolean>>;
  takePulses?(): SignalPort[];
  capture(): LogicalValue;
  reset(state: LogicalValue): void;
  dispose(): void;
}

export interface CheckpointSnapshot {
  schemaVersion: 1;
  levelId: string;
  contentVersion: number;
  checkpointId: string | null;
  spawn: Vec3;
  groups: Record<ResetGroupId, {
    components: Record<InstanceId, LogicalValue>;
    /** Actor/puzzle/objective systems join the same group contract in phases 4–5. */
    actors: Record<InstanceId, { state: string; defeated: boolean; position: Vec3 }>;
    puzzles: Record<InstanceId, { solved: boolean; values: Record<string, LogicalValue> }>;
    objectives: Record<string, { completed: boolean; progress: number }>;
  }>;
}
