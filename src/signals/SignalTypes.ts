export const PORT_TYPES = {
  activated: 'pulse', completed: 'pulse', reset: 'pulse',
  active: 'boolean', enable: 'boolean', inputA: 'boolean', inputB: 'boolean',
  step1: 'pulse', step2: 'pulse', step3: 'pulse',
} as const;
export type SignalPort = keyof typeof PORT_TYPES;
export type SignalType = 'boolean' | 'pulse';
export type SignalValue = boolean | null;
export interface SignalRef { instanceId: string; port: SignalPort }
export interface SignalLink { id: string; source: SignalRef; target: SignalRef }
export interface SignalNode {
  id: string;
  inputs: Partial<Record<SignalPort, SignalType>>;
  outputs: Partial<Record<SignalPort, SignalType>>;
}
export const acceptsSignal = (type: SignalType, value: SignalValue): boolean => type === 'pulse' ? value === null : typeof value === 'boolean';
