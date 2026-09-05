import { acceptsSignal, type SignalLink, type SignalNode, type SignalPort, type SignalValue, type SignalRef } from './SignalTypes.ts';
import { validateSignalGraph } from './SignalGraph.ts';

export type SignalReceiver = (port: SignalPort, value: SignalValue) => void;
export interface SignalTrace { sequence: number; channel: string; source: SignalRef; target: SignalRef; value: SignalValue; cause: number | null }
export interface SignalInspection { outputs: Array<{source: SignalRef; value: boolean}>; inputs: SignalTrace[]; trace: SignalTrace[]; fault: string | null }
interface Pending { link: SignalLink; value: SignalValue; cause: number | null }
/** Emits enqueue work; only flush delivers it. No recursive callbacks or frame clocks. */
export class SignalNetwork {
  readonly trace: SignalTrace[] = [];
  fault: string | null = null;
  private readonly nodes: Map<string, SignalNode>;
  private readonly routes = new Map<string, SignalLink[]>();
  private readonly receivers = new Map<string, SignalReceiver>();
  private readonly states = new Map<string, boolean>();
  private readonly lastInputs = new Map<string, SignalTrace>();
  private pending: Pending[] = [];
  private sequence = 0;
  private cause: number | null = null;
  private flushing = false;
  private disposed = false;

  constructor(nodes: SignalNode[], links: SignalLink[]) {
    const issues = validateSignalGraph(nodes, links);
    if (issues.length) throw Error(issues.map(issue => issue.message).join('\n'));
    this.nodes = new Map(nodes.map(node => [node.id, node]));
    for (const link of [...links].sort((a,b) => a.id.localeCompare(b.id))) {
      const key = this.key(link.source.instanceId, link.source.port);
      const routes = this.routes.get(key) ?? []; routes.push(structuredClone(link)); this.routes.set(key, routes);
    }
  }
  private key(id: string, port: SignalPort): string { return `${id}:${port}`; }
  register(id: string, receiver: SignalReceiver): void {
    if (!this.nodes.has(id) || this.receivers.has(id)) throw Error(`Unknown or duplicate signal receiver ${id}.`);
    this.receivers.set(id, receiver);
  }
  emit(id: string, port: SignalPort, value: SignalValue): void {
    if (this.disposed || this.fault) return;
    const type = this.nodes.get(id)?.outputs[port];
    if (!type || !acceptsSignal(type, value)) throw Error(`Invalid ${id}.${port} signal value.`);
    const key = this.key(id, port);
    if (typeof value === 'boolean') {
      if (this.states.get(key) === value) return;
      this.states.set(key, value);
    }
    for (const link of this.routes.get(key) ?? []) {
      if (this.pending.length >= 8192) { this.fail('Signal queue exceeded its bounded capacity. Retry the course and simplify the circuit.'); return; }
      this.pending.push({ link, value, cause: this.cause });
    }
  }
  flush(): void {
    if (this.flushing || this.disposed || this.fault || !this.pending.length) return;
    this.flushing = true;
    try {
      let delivered = 0;
      // Appended emissions join this queue; a linked receiver never runs recursively.
      for (let cursor = 0; cursor < this.pending.length; cursor++) {
        if (++delivered > 4096) { this.fail('Signal propagation exceeded its per-step budget. Retry the course and simplify the circuit.'); break; }
        const event = this.pending[cursor]!, receiver = this.receivers.get(event.link.target.instanceId);
        if (!receiver) { this.fail(`Missing signal receiver ${event.link.target.instanceId}.`); break; }
        const record = { sequence: ++this.sequence, channel: event.link.id, source: event.link.source, target: event.link.target, value: event.value, cause: event.cause };
        this.trace.push(record); if (this.trace.length > 128) this.trace.shift();
        this.lastInputs.set(this.key(record.target.instanceId,record.target.port),record);
        this.cause = record.sequence;
        receiver(event.link.target.port, event.value);
      }
    } finally { this.pending = []; this.cause = null; this.flushing = false; }
  }
  /** Detached diagnostic data; current inputs survive the bounded history window. */
  inspect(): SignalInspection {
    const outputs: SignalInspection['outputs']=[];
    for(const node of this.nodes.values())for(const port of Object.keys(node.outputs) as SignalPort[]) {
      const value=this.states.get(this.key(node.id,port));if(value!==undefined)outputs.push({source:{instanceId:node.id,port},value});
    }
    return structuredClone({outputs,inputs:[...this.lastInputs.values()],trace:this.trace,fault:this.fault});
  }
  private fail(message: string): void { this.fault = message; this.pending = []; }
  /** Call after component checkpoint restoration, then republish current state outputs. */
  reset(): void { this.pending = []; this.states.clear(); this.lastInputs.clear(); this.trace.length = 0; this.sequence = 0; this.cause = null; this.fault = null; }
  dispose(): void { this.disposed = true; this.reset(); this.routes.clear(); this.receivers.clear(); this.nodes.clear(); }
}
