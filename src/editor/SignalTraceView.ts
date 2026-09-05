import type { LevelSession } from '../runtime/LevelSession';
import type { LogicalValue } from '../runtime/Component';
import { PARTS } from '../content/PartRegistry';
import type { SignalInspection, SignalTrace } from '../signals/SignalNetwork';

interface TraceSnapshot {
  course: string;
  time: number;
  network: SignalInspection;
  parts: Array<{ id: string; label: string; state: LogicalValue | undefined }>;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
const valueText = (value: boolean | null): string => value === null ? 'PULSE' : value ? 'ON' : 'OFF';
const delivery = (event: SignalTrace): string => `#${event.sequence} ${event.channel}: ${event.source.instanceId}.${event.source.port} → ${event.target.instanceId}.${event.target.port} = ${valueText(event.value)}`;
/** Workshop-only inspection. Saved evidence owns no session, component or physics handle. */
export class SignalTraceView {
  readonly root = el('details');
  private readonly title = el('summary', 'Circuit trace');
  private readonly caption = el('p');
  private readonly choice = el('select');
  private readonly readings = el('div');
  private readonly history = el('ol');
  private readonly logical = el('pre');
  private snapshot: TraceSnapshot | null = null;
  private lastUpdate = -Infinity;
  private live = false;
  constructor() {
    this.root.className = 'signal-trace'; this.root.hidden = true; this.root.setAttribute('aria-label', 'Circuit trace');
    this.choice.setAttribute('aria-label', 'Trace component'); this.choice.onchange = () => this.renderReadings();
    const state = el('details'); state.append(el('summary', 'Component state'), this.logical);
    const history = el('details'); history.append(el('summary', 'Recent deliveries'), this.history);
    this.root.append(this.title,this.caption,this.choice,this.readings,state,history); document.body.append(this.root);
    this.root.addEventListener('toggle', () => { this.lastUpdate = -Infinity; });
    // Keep editor shortcuts and game actions out of diagnostic controls.
    this.root.addEventListener('keydown', e => e.stopPropagation());
  }
  private capture(session: LevelSession): TraceSnapshot {
    const components = new Map(session.game.dynamics.components.map(c => [c.id,c]));
    return {course:session.document.metadata.name,time:session.game.elapsed,network:session.game.dynamics.signals.inspect(),parts:session.document.instances.filter(i => PARTS[i.type].inputs.length || PARTS[i.type].outputs.length).map(i => ({id:i.id,label:`${PARTS[i.type].label} · ${i.id}`,state:structuredClone(components.get(i.id)?.capture())}))};
  }
  start(): void { this.live = true; this.snapshot = null; this.lastUpdate = -Infinity; this.root.hidden = false; this.title.textContent = 'Circuit trace · live'; this.render(); }
  update(session: LevelSession, now: number): void {
    if (!this.live || this.root.hidden || !this.root.open || now-this.lastUpdate < 200) return;
    this.lastUpdate = now; this.snapshot = this.capture(session); this.render();
  }
  save(session: LevelSession): void { this.snapshot = this.capture(session); this.live = false; this.title.textContent = 'Circuit trace · last play test'; this.render(); }
  showSaved(): void { this.root.hidden = !this.snapshot; this.live = false; this.render(); }
  hide(): void { this.root.hidden = true; }
  private render(): void {
    const selected = this.choice.value;
    const parts = this.snapshot?.parts ?? [];
    if ([...this.choice.options].map(o => o.value).join('|') !== parts.map(p => p.id).join('|')) {
      this.choice.replaceChildren();
      for (const part of parts) { const option = el('option',part.label); option.value = part.id; this.choice.append(option); }
    }
    if (this.snapshot?.parts.some(p => p.id === selected)) this.choice.value = selected;
    this.caption.textContent = this.snapshot ? `${this.snapshot.course} · ${this.snapshot.time.toFixed(2)}s. ${this.live ? 'Live simulation.' : 'Last play test; may differ from your current draft.'}` : 'Open this panel during a play test to inspect signal state.';
    this.renderReadings();
  }
  private renderReadings(): void {
    this.readings.replaceChildren(); this.history.replaceChildren(); this.logical.textContent = '';
    const data = this.snapshot; if (!data) return;
    const id = this.choice.value;
    if (data.network.fault) this.readings.append(el('p',`FAULT: ${data.network.fault}`));
    const inputs = data.network.inputs.filter(e => e.target.instanceId === id), outputs = data.network.outputs.filter(e => e.source.instanceId === id);
    for (const output of outputs) this.readings.append(el('p',`Output ${output.source.port}: ${valueText(output.value)}`));
    if (!inputs.length) this.readings.append(el('p','No signal delivered to this part since the last reset. Its state comes from its settings or physical interaction.'));
    for (const input of inputs) {
      this.readings.append(el('p',`Latest input ${input.target.port}: ${valueText(input.value)} via ${input.channel}.`));
      const chain = el('ol'); let event: SignalTrace | undefined = input;
      while (event) {
        chain.append(el('li',delivery(event)));
        if (event.cause === null) { chain.append(el('li','Origin: source state, interaction or reset resynchronisation.')); break; }
        const parent = data.network.trace.find(e => e.sequence === event!.cause);
        if (!parent) { chain.append(el('li',`Earlier cause #${event.cause} is outside the 128-delivery history.`)); break; }
        event = parent;
      }
      this.readings.append(chain);
    }
    this.logical.textContent = JSON.stringify(data.parts.find(p => p.id === id)?.state ?? null,null,2);
    for (const event of [...data.network.trace].reverse()) if (event.source.instanceId === id || event.target.instanceId === id) this.history.append(el('li',delivery(event)));
    if (!this.history.children.length) this.history.append(el('li','No recent deliveries for this part.'));
  }
  dispose(): void { this.snapshot = null; this.root.remove(); }
}
