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
const surface: ChoiceParameter = { kind: 'choice', values: ['standard', 'ice', 'rubber', 'rough'] };
const clock: ChoiceParameter = { kind: 'choice', values: ['continuous', 'resettable'] };
const dimensions = { w: number(0.05), d: number(0.05) };
const vec = (axes: readonly string[], required = true): VectorParameter => ({ kind: 'vector', axes, required });

/** Shared, data-only part metadata for validation, authoring and generation. */
const match: ChoiceParameter = { kind: 'choice', values: ['any', 'triangle', 'circle', 'square'] };
export const PARTS = {
  pushable: { label: 'Pushable resonator', category: 'objective', inputs: ['reset'], outputs: [], parameters: { shape: { kind: 'choice', values: ['cube','orb'], required: true }, token: { kind: 'choice', values: ['triangle','circle','square'], required: true }, size: number(.8, 1.2), mass: number(.4, 3), recoveryDelay: number(.5, 8) } },
  momentum: { label: 'Momentum receiver', category: 'objective', inputs: ['reset'], outputs: ['active','activated'], parameters: { radius: number(.5, 2), threshold: number(1, 40), match, label: { kind: 'text', maxLength: 80 } } },
  pressure: { label: 'Pressure plate', category: 'objective', inputs: ['reset'], outputs: ['active', 'activated'], parameters: { match, w: number(1.5, 8), d: number(1.5, 8), mode: { kind: 'choice', values: ['hold', 'toggle', 'timed'], required: true }, duration: number(.3, 60), label: { kind: 'text', maxLength: 80 } } },
  door: { label: 'Signal door', category: 'objective', inputs: ['enable', 'reset'], outputs: [], parameters: { w: number(1.5, 20), d: number(.3, 4), h: number(1.5, 6), travelTime: number(.5, 8), initial: { kind: 'choice', values: ['open', 'closed'], required: true }, label: { kind: 'text', maxLength: 80 } } },
  logic: { label: 'AND / OR gate', category: 'objective', inputs: ['inputA', 'inputB'], outputs: ['active'], parameters: { operation: { kind: 'choice', values: ['and', 'or'], required: true }, label: { kind: 'text', maxLength: 80 } } },
  sequence: { label: 'Ordered sequence', category: 'objective', inputs: ['step1', 'step2', 'step3', 'reset'], outputs: ['active', 'completed'], parameters: { timeout: number(1, 120), label: { kind: 'text', maxLength: 80 } } },
  switch: { label: 'Signal switch', category: 'objective', inputs: ['reset'], outputs: ['active', 'activated'], parameters: { mode: { kind: 'choice', values: ['toggle', 'timed'], required: true }, duration: number(.3, 60), initial: { kind: 'choice', values: ['on', 'off'], required: true }, label: { kind: 'text', maxLength: 80 } } },
  bumper: { label: 'Spring bumper', category: 'hazard', inputs: ['reset'], outputs: [], parameters: { radius: number(.4, 4), kickSpeed: number(2, 16), cooldown: number(.3, 10) } },
  seesaw: { label: 'Seesaw', category: 'transport', inputs: ['reset'], outputs: [], parameters: { w: number(2, 30), d: number(2, 30), axis: { kind: 'choice', values: ['x', 'z'], required: true }, maxTilt: number(2, 25), response: number(1, 8) } },
  fragile: { label: 'Recovering floor', category: 'hazard', inputs: ['reset'], outputs: [], parameters: { w: number(1.5, 20), d: number(1.5, 20), mode: { kind: 'choice', values: ['drop', 'retract'], required: true }, dir: { kind: 'choice', values: ['+x', '-x', '+z', '-z'], required: true }, warning: number(.3, 10), recovery: number(1, 30) } },
  conveyor: { label: 'Conveyor', category: 'transport', inputs: ['enable', 'reset'], outputs: [], parameters: { ...dimensions, dir: { kind: 'choice', values: ['+x', '-x', '+z', '-z'], required: true }, speed: number(.1, 20), acceleration: number(.1, 40, false) } },
  bridge: { label: 'Shuttle bridge', category: 'transport', inputs: ['enable', 'reset'], outputs: [], parameters: { ...dimensions, dir: { kind: 'choice', values: ['+x', '-x', '+z', '-z'], required: true }, distance: number(.5, 100), period: number(1, 120), dwell: number(0, 30) } },
  rotator: { label: 'Rotating platform', category: 'transport', inputs: ['enable', 'reset'], outputs: [], parameters: { ...dimensions, angularSpeed: number(-90, 90) } },
  slab: { label: 'Floor', category: 'track', inputs: [], outputs: [], parameters: { ...dimensions, surface, thick: number(0.05, 1000, false), tone, label: { kind: 'text', maxLength: 80 }, gridOrigin: vec(['x', 'z'], false) } },
  wall: { label: 'Rail / wall', category: 'track', inputs: [], outputs: [], parameters: { ...dimensions, h: number(0.05), tone } },
  ramp: { label: 'Ramp', category: 'track', inputs: [], outputs: [], parameters: { surface, w: number(0.05), len: number(0.05), y1: number(-1000), dir: { kind: 'choice', values: ['+x', '-x', '+z', '-z'], required: true }, thick: number(0.05, 1000, false), tone } },
  jumppad: { label: 'Jump pad', category: 'transport', inputs: ['enable', 'reset'], outputs: [], parameters: { targetX: number(-1000), targetY: number(-1000), targetZ: number(-1000), arc: number(0.1, 100, false) } },
  elevator: { label: 'Light elevator', category: 'transport', inputs: ['enable', 'reset'], outputs: [], parameters: { clock, ...dimensions, y1: number(-1000), period: number(0.5, 300), phase: number(-1000, 1000, false) } },
  laser: { label: 'Laser', category: 'hazard', inputs: ['enable', 'reset'], outputs: [], parameters: { clock, axis: { kind: 'choice', values: ['x', 'z'], required: true }, length: number(0.05), sweep: number(0), speed: number(0, 10), dwell: number(0, 300, false), phase: number(-1000, 1000, false), gatePeriod: number(0.1, 300, false), gateDuty: number(0, 1, false) } },
  void: { label: 'Void marker', category: 'hazard', inputs: [], outputs: [], parameters: dimensions },
  checkpoint: { label: 'Checkpoint', category: 'objective', inputs: [], outputs: ['activated'], parameters: { id: number(1, 10000) } },
  goal: { label: 'Goal', category: 'objective', inputs: [], outputs: ['completed'], parameters: dimensions },
} as const satisfies Record<PieceKind, PartDefinition>;

export function hasPart(type: string): type is PieceKind { return Object.hasOwn(PARTS, type); }
