import type { PieceKind, Port } from './LevelDocument';

export interface NumericParameter { kind: 'number'; min: number; max: number; required?: boolean }
export interface ChoiceParameter { kind: 'choice'; values: readonly string[]; required?: boolean }
export interface VectorParameter { kind: 'vector'; axes: readonly string[]; required?: boolean }
export interface TextParameter { kind: 'text'; maxLength: number; required?: boolean }
export type ParameterField = NumericParameter | ChoiceParameter | VectorParameter | TextParameter;
export interface PartDefinition {
  label: string;
  category: 'track' | 'hazard' | 'transport' | 'objective';
  parameters: Record<string, ParameterField>;
  inputs: readonly Port[];
  outputs: readonly Port[];
}
const number = (min: number, max = 1000, required = true): NumericParameter => ({ kind: 'number', min, max, required });
const tone: ChoiceParameter = { kind: 'choice', values: ['blue', 'pink', 'cyan'] };
const dimensions = { w: number(0.05), d: number(0.05) };
const vec = (axes: readonly string[], required = true): VectorParameter => ({ kind: 'vector', axes, required });

/** Shared, data-only part metadata for validation, authoring and generation. */
export const PARTS = {
  slab: { label: 'Floor', category: 'track', inputs: [], outputs: [], parameters: { ...dimensions, thick: number(0.05, 1000, false), tone, label: { kind: 'text', maxLength: 80 }, gridOrigin: vec(['x', 'z'], false) } },
  wall: { label: 'Rail / wall', category: 'track', inputs: [], outputs: [], parameters: { ...dimensions, h: number(0.05), tone } },
  ramp: { label: 'Ramp', category: 'track', inputs: [], outputs: [], parameters: { w: number(0.05), len: number(0.05), y1: number(-1000), dir: { kind: 'choice', values: ['+x', '-x', '+z', '-z'], required: true }, thick: number(0.05, 1000, false), tone } },
  jumppad: { label: 'Jump pad', category: 'transport', inputs: [], outputs: [], parameters: { targetX: number(-1000), targetY: number(-1000), targetZ: number(-1000), arc: number(0.1, 100, false) } },
  elevator: { label: 'Light elevator', category: 'transport', inputs: [], outputs: [], parameters: { ...dimensions, y1: number(-1000), period: number(0.5, 300), phase: number(-1000, 1000, false) } },
  laser: { label: 'Laser', category: 'hazard', inputs: [], outputs: [], parameters: { axis: { kind: 'choice', values: ['x', 'z'], required: true }, length: number(0.05), sweep: number(0), speed: number(0, 10), dwell: number(0, 300, false), phase: number(-1000, 1000, false), gatePeriod: number(0.1, 300, false), gateDuty: number(0, 1, false) } },
  void: { label: 'Void marker', category: 'hazard', inputs: [], outputs: [], parameters: dimensions },
  checkpoint: { label: 'Checkpoint', category: 'objective', inputs: [], outputs: ['activated'], parameters: { id: number(1, 10000) } },
  goal: { label: 'Goal', category: 'objective', inputs: [], outputs: ['completed'], parameters: dimensions },
} as const satisfies Record<PieceKind, PartDefinition>;

export function hasPart(type: string): type is PieceKind { return Object.hasOwn(PARTS, type); }
