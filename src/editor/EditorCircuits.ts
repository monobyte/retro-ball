import type { EditorModel } from './EditorModel';
import type { LevelDocument } from '../content/LevelDocument';
import { PARTS } from '../content/PartRegistry';
import { signalDocument } from '../content/SignalDocument';
import { PORT_TYPES, type SignalPort } from '../signals/SignalTypes';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
/** Authoring controls share the runtime port contract and atomic editor commands. */
export class EditorCircuits {
  readonly wiring = el('div');
  readonly groups = el('div');
  private source = '';
  private target = '';
  private output: SignalPort = 'active';
  private input: SignalPort = 'enable';
  private name = '';
  constructor(private readonly model: EditorModel, private readonly tell: (value: unknown) => void) {}
  private run(action: () => void): void { try { action(); } catch (error) { this.tell(error); } }
  private button(name: string, action: () => void): HTMLButtonElement {
    const b = el('button', name); b.type = 'button'; b.onclick = () => this.run(action); return b;
  }
  private label(name: string, control: HTMLElement): HTMLLabelElement { const label = el('label'); label.append(el('span', name), control); return label; }
  private text(name: string, value: string): HTMLInputElement { const input = el('input'); input.value = value; input.setAttribute('aria-label', name); return input; }
  private select(name: string, choices: Array<[string, string]>, value: string, change: (value: string) => void): HTMLSelectElement {
    const select = el('select'); select.setAttribute('aria-label', name);
    for (const [id, label] of choices) { const option = el('option', label); option.value = id; select.append(option); }
    select.value = value; select.onchange = () => this.run(() => change(select.value)); return select;
  }
  selectionControls(d: LevelDocument, selection: string[]): HTMLElement {
    const root = el('div'), selected = d.instances.filter(i => selection.includes(i.id));
    if (!selected.length) return root;
    const groups = [...new Set(selected.map(i => i.resetGroup))];
    root.append(this.label('Reset group', this.select('Selected reset group', [...(groups.length > 1 ? [['', 'Mixed groups'] as [string,string]] : []), ...d.resetGroups.map(g => [g.id, g.id] as [string,string])], groups.length === 1 ? groups[0]! : '', value => { if (value) this.model.assignResetGroup(value); })));
    const cp = selected.length === 1 ? d.checkpoints.find(c => c.instanceId === selected[0]!.id) : null;
    if (cp) {
      root.append(el('h3', 'After dying at this checkpoint'), el('p', 'Checked groups return to their captured checkpoint state. Unchecked groups keep their current state.'));
      for (const group of d.resetGroups) {
        const box = el('input'); box.type = 'checkbox'; box.checked = cp.resetGroups.includes(group.id); box.setAttribute('aria-label', `Restore ${group.id} at ${cp.id}`);
        box.onchange = () => this.run(() => this.model.setCheckpointGroup(cp.id, group.id, box.checked));
        root.append(this.label(`Restore ${group.id}`, box));
      }
    }
    return root;
  }
  render(d: LevelDocument): void {
    this.wiring.replaceChildren(); this.groups.replaceChildren();
    const sources = d.instances.filter(i => PARTS[i.type].outputs.length), targets = d.instances.filter(i => PARTS[i.type].inputs.length);
    if (!sources.some(i => i.id === this.source)) this.source = sources[0]?.id ?? '';
    const outputs: readonly SignalPort[] = PARTS[sources.find(i => i.id === this.source)?.type ?? 'slab'].outputs;
    if (!outputs.includes(this.output)) this.output = outputs[0] ?? 'active';
    const compatible = targets.filter(i => PARTS[i.type].inputs.some(p => PORT_TYPES[p] === PORT_TYPES[this.output]));
    if (!compatible.some(i => i.id === this.target)) this.target = compatible[0]?.id ?? '';
    const inputs: readonly SignalPort[] = PARTS[compatible.find(i => i.id === this.target)?.type ?? 'slab'].inputs.filter(p => PORT_TYPES[p] === PORT_TYPES[this.output]);
    if (!inputs.includes(this.input)) this.input = inputs[0] ?? 'enable';
    const options = (parts: typeof sources): Array<[string,string]> => parts.map(i => [i.id, `${PARTS[i.type].label} · ${i.id}`]);
    const rerender = () => {
      const expanded = [...this.wiring.querySelectorAll<HTMLDetailsElement>('details[open]'), ...this.groups.querySelectorAll<HTMLDetailsElement>('details[open]')].map(detail => detail.dataset['editorDetail']);
      this.render(this.model.document);
      for (const detail of [...this.wiring.querySelectorAll<HTMLDetailsElement>('details'), ...this.groups.querySelectorAll<HTMLDetailsElement>('details')]) if (expanded.includes(detail.dataset['editorDetail'])) detail.open = true;
    };
    const name = this.text('New signal name', this.name); name.placeholder = 'Auto name'; name.oninput = () => { this.name = name.value; };
    this.wiring.append(el('p', 'State wires stay on or off. Pulse wires fire once per event. Only compatible inputs are offered.'), this.label('Name', name),
      this.label('From part', this.select('Signal source', options(sources), this.source, value => { this.source = value; rerender(); })),
      this.button('Use selected as source', () => { const part = sources.find(i => this.model.selection.includes(i.id)); if (!part) throw Error('Select a part with an output.'); this.source = part.id; rerender(); }),
      this.label('Output', this.select('Signal output', outputs.map(p => [p, `${p} (${PORT_TYPES[p]})`]), this.output, value => { this.output = value as SignalPort; rerender(); })),
      this.label('To part', this.select('Signal target', options(compatible), this.target, value => { this.target = value; rerender(); })),
      this.button('Use selected as target', () => { const part = compatible.find(i => this.model.selection.includes(i.id)); if (!part) throw Error('Select a part with a compatible input.'); this.target = part.id; rerender(); }),
      this.label('Input', this.select('Signal input', inputs.map(p => [p, p]), this.input, value => { this.input = value as SignalPort; })),
      this.button('Connect signal', () => { if (!outputs.length || !inputs.length) throw Error('Place a source and compatible receiver first.'); this.model.connectSignal({instanceId:this.source,port:this.output}, {instanceId:this.target,port:this.input}, this.name); this.name = ''; this.tell('Signal connected.'); }));
    const links = signalDocument(d).links;
    this.wiring.append(el('h3', `${links.length} connections`));
    for (const link of links) {
      const detail = el('details'); detail.dataset['editorDetail'] = `signal-${link.id}`;
      detail.append(el('summary', link.id), el('p', `${link.source.instanceId}.${link.source.port} → ${link.target.instanceId}.${link.target.port}`));
      const rename = this.text(`Signal name ${link.id}`, link.id.startsWith('inline/') ? '' : link.id);
      detail.append(rename, this.button('Rename signal', () => this.model.renameSignal(link.id, rename.value)), this.button('Select endpoints', () => this.model.select([link.source.instanceId,link.target.instanceId])), this.button('Disconnect signal', () => this.model.disconnectSignal(link.id))); this.wiring.append(detail);
    }
    const groupName = this.text('New reset group name', ''); groupName.placeholder = 'puzzle-room';
    this.groups.append(el('p', 'Assign parts to groups in the Inspector. Select a checkpoint to choose which groups it restores.'), groupName, this.button('Add reset group', () => this.model.addResetGroup(groupName.value)));
    for (const group of d.resetGroups) {
      const detail = el('details'); detail.dataset['editorDetail'] = `group-${group.id}`;
      detail.append(el('summary', `${group.id} · ${d.instances.filter(i => i.resetGroup === group.id).length} parts`));
      const rename = this.text(`Reset group name ${group.id}`, group.id);
      detail.append(rename, this.button('Rename group', () => this.model.renameResetGroup(group.id, rename.value)), this.label('Before first checkpoint', this.select(`Initial reset policy ${group.id}`, [['reset','Reset to initial state'],['keep','Keep current state']], group.policy === 'course' ? 'keep' : 'reset', value => this.model.edit('Set initial reset policy', doc => { doc.resetGroups.find(g => g.id === group.id)!.policy = value === 'keep' ? 'course' : 'checkpoint'; }))));
      const others = d.resetGroups.filter(g => g.id !== group.id);
      if (others.length) {
        const replacement = this.select(`Merge destination ${group.id}`, others.map(g => [g.id,g.id]), others[0]!.id, () => {});
        detail.append(this.label('Merge into', replacement), this.button('Merge group', () => this.model.mergeResetGroup(group.id, replacement.value)));
      }
      this.groups.append(detail);
    }
  }
}
