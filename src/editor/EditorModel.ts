import { documentFromLegacy, type LevelDocument, type LevelInstance, type PieceKind, type Vec3, type QuarterTurn } from '../content/LevelDocument.ts';
import { PARTS, type PartDefinition } from '../content/PartRegistry.ts';
import { InvalidLevelError, parseLevel, validateLevel } from '../content/validateLevel.ts';

export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface EditState { document: LevelDocument; selection: string[] }
interface Command { label: string; before: EditState; after: EditState; bytes: number }
export interface Prefab {
  version: 1;
  name: string;
  fragment: LevelDocument;
  exposed: Record<string, { instanceId: string; parameter: string }>;
}
const DRAFT_KEY = 'retro-ball.editor-draft.v1';
const MAX_FILE_LENGTH = 2_000_000;
const MAX_HISTORY_BYTES = 8_000_000;
const clone = <T>(value: T): T => structuredClone(value);
const add = (p: Vec3, d: Vec3) => { p.x += d.x; p.y += d.y; p.z += d.z; };
const idFor = (prefix: string, used: Set<string>): string => {
  let index = 1; while (used.has(`${prefix}-${index}`)) index++;
  const id = `${prefix}-${index}`; used.add(id); return id;
};
function draft(value: unknown): LevelDocument {
  const result = validateLevel(value, { draft: true });
  if (!result.document) throw new InvalidLevelError(result.issues);
  return result.document;
}
function decode(text: string): unknown {
  if (text.length > MAX_FILE_LENGTH) throw new Error('Level file exceeds the 2 MB authoring limit.');
  try { return JSON.parse(text); } catch { throw new Error('This file is not valid JSON. The current draft has been kept.'); }
}

export function starterDocument(): LevelDocument {
  const document = documentFromLegacy({ name: 'UNTITLED SIGNAL', start: { x: 0, y: .6, z: 3 }, pieces: [
    { kind: 'slab', x: 0, y: 0, z: 0, w: 12, d: 12 },
    { kind: 'goal', x: 0, y: 0, z: -4, w: 3, d: 3 },
  ] }, 'untitled-signal');
  document.metadata.description = 'A new route through the relay.';
  document.metadata.difficulty = 'test';
  return document;
}

const DEFAULTS: Record<PieceKind, Record<string, unknown>> = {
  slab: { w: 6, d: 6, tone: 'blue', surface: 'standard' },
  wall: { w: 6, d: .4, h: .8, tone: 'cyan' },
  ramp: { w: 6, len: 8, y1: 2, dir: '-z' },
  jumppad: { targetX: 0, targetZ: -10, targetY: .6, arc: 4 },
  elevator: { w: 4, d: 4, y1: 4, period: 6 },
  laser: { axis: 'x', length: 6, sweep: 0, speed: 0 },
  void: { w: 1.5, d: 1.5 }, checkpoint: { id: 1 }, goal: { w: 3, d: 3 },
};

/** Document authority for the editor. No renderer, physics, audio or campaign state. */
export class EditorModel {
  private state: EditState;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private saved = '';
  private readonly storage: DraftStorage | undefined;
  storageMessage = '';
  onChange: (() => void) | null = null;
  snap = 1;

  constructor(document: LevelDocument = starterDocument(), storage?: DraftStorage) {
    this.state = { document: draft(document), selection: [] };
    this.storage = storage;
    this.saved = JSON.stringify(this.state.document);
  }
  get document(): LevelDocument { return clone(this.state.document); }
  get selection(): string[] { return [...this.state.selection]; }
  get dirty(): boolean { return JSON.stringify(this.state.document) !== this.saved; }
  get undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null; }
  get issues() { return validateLevel(this.state.document).issues; }
  select(ids: string[]): void {
    const available = new Set(this.state.document.instances.map(i => i.id));
    this.state.selection = [...new Set(ids)].filter(id => available.has(id)); this.onChange?.();
  }
  snapped(value: number): number { return this.snap > 0 ? Math.round(value / this.snap) * this.snap : value; }

  /** One transaction per user gesture; invalid edits cannot partially replace the draft. */
  edit(label: string, change: (document: LevelDocument, selection: string[]) => string[] | void): void {
    const before = clone(this.state), next = clone(before);
    const selection = change(next.document, next.selection);
    if (selection) next.selection = selection;
    next.document = draft(next.document);
    next.selection = next.selection.filter(id => next.document.instances.some(i => i.id === id));
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    const bytes = JSON.stringify(before).length + JSON.stringify(next).length;
    this.undoStack.push({ label, before, after: clone(next), bytes });
    // Bound snapshot history by size as well as command count on large courses.
    let total = this.undoStack.reduce((sum, command) => sum + command.bytes, 0);
    while (this.undoStack.length > 1 && (total > MAX_HISTORY_BYTES || this.undoStack.length > 80)) total -= this.undoStack.shift()!.bytes;
    this.redoStack = []; this.state = next; this.changed();
  }
  undo(): void {
    const command = this.undoStack.pop(); if (!command) return;
    this.redoStack.push(command); this.state = clone(command.before); this.changed();
  }
  redo(): void {
    const command = this.redoStack.pop(); if (!command) return;
    this.undoStack.push(command); this.state = clone(command.after); this.changed();
  }
  private changed(): void { this.autosave(); this.onChange?.(); }
  autosave(): void {
    if (!this.storage) return;
    try { this.storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, document: this.state.document })); this.storageMessage = 'Draft saved locally'; }
    catch { this.storageMessage = 'Local storage is unavailable. Export your course to keep it.'; }
  }
  recover(): boolean {
    if (!this.storage) return false;
    const text = this.storage.getItem(DRAFT_KEY); if (!text) return false;
    const value = decode(text) as { version?: unknown; document?: unknown } | null;
    if (!value || value.version !== 1) throw new Error('Unsupported editor draft version. The current draft has been kept.');
    const recovered = draft(value.document);
    this.edit('Recover local draft', d => { Object.assign(d, recovered); return []; });
    return true;
  }
  importFile(text: string): void {
    const document = parseLevel(decode(text)); // Imports are complete courses, not trusted drafts.
    this.edit('Import course', d => { Object.assign(d, document); return []; });
  }
  exportFile(): string {
    const document = parseLevel(this.state.document);
    const text = JSON.stringify(document, null, 2);
    if (text.length > MAX_FILE_LENGTH) throw new Error('Level file exceeds the 2 MB authoring limit.');
    return text;
  }
  markExported(): void { this.saved = JSON.stringify(this.state.document); this.onChange?.(); }

  place(type: PieceKind, position: Vec3): void {
    this.edit(`Place ${PARTS[type].label}`, document => {
      const id = idFor(type, new Set(document.instances.map(i => i.id)));
      const parameters = clone(DEFAULTS[type]);
      if (type === 'checkpoint') parameters['id'] = 1 + Math.max(0, ...document.instances.flatMap(i => i.type === 'checkpoint' ? [i.parameters.id] : []));
      if (!document.resetGroups.length) document.resetGroups.push({ id: 'course', policy: 'course' });
      const p = { x: this.snapped(position.x), y: this.snapped(position.y), z: this.snapped(position.z) };
      document.instances.push({ id, type, transform: { position: p, yaw: 0 }, parameters, resetGroup: document.resetGroups[0]!.id, links: [] } as unknown as LevelInstance);
      if (type === 'checkpoint') document.checkpoints.push({ id: idFor('checkpoint-policy', new Set(document.checkpoints.map(c => c.id))), instanceId: id, spawn: { ...p, y: p.y + .6 }, resetGroups: [] });
      if (type === 'goal') document.objectives.push({ id: idFor('finish', new Set(document.objectives.map(o => o.id))), type: 'reach-goal', target: id, required: true });
      return [id];
    });
  }
  move(delta: Vec3): void {
    this.edit('Move selection', (document, selection) => {
      for (const instance of document.instances.filter(i => selection.includes(i.id))) {
        const p = instance.transform.position;
        const actual = { x: this.snapped(p.x + delta.x) - p.x, y: this.snapped(p.y + delta.y) - p.y, z: this.snapped(p.z + delta.z) - p.z };
        add(p, actual);
        for (const c of document.checkpoints.filter(c => c.instanceId === instance.id)) add(c.spawn, actual);
        for (const n of document.navigation.nodes.filter(n => n.instanceId === instance.id)) add(n.position, actual);
      }
    });
  }
  rotate(): void {
    this.edit('Rotate selection', (document, selection) => {
      const parts = document.instances.filter(i => selection.includes(i.id)); if (!parts.length) return;
      const pivot = clone(parts[0]!.transform.position);
      const turn = (p: Vec3) => { const x = p.x - pivot.x, z = p.z - pivot.z; p.x = pivot.x + z; p.z = pivot.z - x; };
      for (const i of parts) { turn(i.transform.position); i.transform.yaw = ((i.transform.yaw + 90) % 360) as QuarterTurn; }
      for (const c of document.checkpoints.filter(c => selection.includes(c.instanceId))) turn(c.spawn);
      for (const n of document.navigation.nodes.filter(n => selection.includes(n.instanceId))) turn(n.position);
    });
  }
  parameter(key: string, value: unknown): void {
    this.edit(`Set ${key}`, (document, selection) => {
      for (const i of document.instances.filter(i => selection.includes(i.id))) {
        const fields = (PARTS[i.type] as PartDefinition).parameters;
        if (!Object.hasOwn(fields, key)) throw new Error(`${PARTS[i.type].label} has no ${key} parameter.`);
        const params = i.parameters as unknown as Record<string, unknown>;
        if (value === undefined) delete params[key]; else params[key] = clone(value);
      }
    });
  }
  remove(): void {
    this.edit('Delete selection', (d, selection) => {
      const removed = new Set(selection);
      d.instances = d.instances.filter(i => !removed.has(i.id));
      for (const i of d.instances) i.links = i.links.filter(l => !removed.has(l.target.instanceId));
      d.checkpoints = d.checkpoints.filter(c => !removed.has(c.instanceId));
      d.objectives = d.objectives.filter(o => !removed.has(o.target));
      d.signals = d.signals.filter(s => !removed.has(s.source.instanceId) && !removed.has(s.target.instanceId));
      d.navigation.nodes = d.navigation.nodes.filter(n => !removed.has(n.instanceId));
      const nodes = new Set(d.navigation.nodes.map(n => n.id));
      d.navigation.links = d.navigation.links.filter(l => nodes.has(l.from) && nodes.has(l.to));
      d.validation.intendedRoute = d.validation.intendedRoute.filter(id => !removed.has(id));
      return [];
    });
  }

  createPrefab(name: string, exposed: Prefab['exposed'] = {}): Prefab {
    if (!name.trim() || name.length > 80) throw new Error('Give the prefab a name of 1–80 characters.');
    const d = this.document, selected = new Set(this.selection);
    if (!selected.size) throw new Error('Select at least one part to make a prefab.');
    d.instances = d.instances.filter(i => selected.has(i.id));
    for (const i of d.instances) i.links = i.links.filter(l => selected.has(l.target.instanceId));
    d.checkpoints = d.checkpoints.filter(c => selected.has(c.instanceId));
    d.objectives = d.objectives.filter(o => selected.has(o.target));
    d.signals = d.signals.filter(s => selected.has(s.source.instanceId) && selected.has(s.target.instanceId));
    d.navigation.nodes = d.navigation.nodes.filter(n => selected.has(n.instanceId));
    const nodes = new Set(d.navigation.nodes.map(n => n.id));
    d.navigation.links = d.navigation.links.filter(l => nodes.has(l.from) && nodes.has(l.to));
    d.validation.intendedRoute = d.validation.intendedRoute.filter(id => selected.has(id));
    d.cameraZones = [];
    const origin = clone(d.instances[0]!.transform.position);
    const delta = { x: -origin.x, y: -origin.y, z: -origin.z };
    for (const i of d.instances) add(i.transform.position, delta);
    for (const c of d.checkpoints) add(c.spawn, delta);
    for (const n of d.navigation.nodes) add(n.position, delta);
    d.spawn = { x: 0, y: .6, z: 0 };
    const usedGroups = new Set([...d.instances.map(i => i.resetGroup), ...d.checkpoints.flatMap(c => c.resetGroups)]);
    d.resetGroups = d.resetGroups.filter(g => usedGroups.has(g.id));
    for (const [label, ref] of Object.entries(exposed)) {
      const instance = d.instances.find(i => i.id === ref.instanceId);
      if (!label.trim() || label.length > 80 || !instance || !Object.hasOwn(PARTS[instance.type].parameters, ref.parameter)) throw new Error('Exposed parameters must name fields on selected parts.');
    }
    return { version: 1, name: name.trim(), fragment: draft(d), exposed: clone(exposed) };
  }
  duplicate(delta: Vec3 = { x: 6, y: 0, z: 0 }): void {
    const first = this.state.document.instances.find(i => this.state.selection.includes(i.id));
    if (!first) return;
    const position = clone(first.transform.position); add(position, delta);
    this.insertPrefab(this.createPrefab('Selection'), position);
  }
  insertPrefab(prefab: Prefab, position: Vec3, values: Record<string, unknown> = {}): void {
    if (prefab.version !== 1) throw new Error('Unsupported prefab version.');
    const fragment = draft(prefab.fragment);
    for (const [name, value] of Object.entries(values)) {
      const ref = Object.hasOwn(prefab.exposed, name) ? prefab.exposed[name] : undefined;
      const instance = ref && fragment.instances.find(i => i.id === ref.instanceId);
      if (!ref || !instance || !Object.hasOwn(PARTS[instance.type].parameters, ref.parameter)) throw new Error(`Unknown exposed parameter: ${name}.`);
      (instance.parameters as unknown as Record<string, unknown>)[ref.parameter] = clone(value);
    }
    draft(fragment); // Validate parameter overrides before changing editor state.
    this.edit(`Insert ${prefab.name}`, d => {
      const ids = new Set(d.instances.map(i => i.id)), groups = new Set(d.resetGroups.map(g => g.id));
      const remap = new Map(fragment.instances.map(i => [i.id, idFor(i.type, ids)]));
      const groupMap = new Map(fragment.resetGroups.map(g => [g.id, idFor('group', groups)]));
      const nodeIds = new Set(d.navigation.nodes.map(n => n.id));
      const nodeMap = new Map(fragment.navigation.nodes.map(n => [n.id, idFor('node', nodeIds)]));
      const policyIds = new Set(d.checkpoints.map(c => c.id)), objectiveIds = new Set(d.objectives.map(o => o.id)), signalIds = new Set(d.signals.map(s => s.id));
      let checkpointNumber = Math.max(0, ...d.instances.flatMap(i => i.type === 'checkpoint' ? [i.parameters.id] : []));
      const offset = { x: this.snapped(position.x), y: this.snapped(position.y), z: this.snapped(position.z) };
      for (const group of fragment.resetGroups) { group.id = groupMap.get(group.id)!; d.resetGroups.push(group); }
      for (const i of fragment.instances) {
        i.id = remap.get(i.id)!; i.resetGroup = groupMap.get(i.resetGroup)!; add(i.transform.position, offset);
        for (const l of i.links) l.target.instanceId = remap.get(l.target.instanceId)!;
        if (i.type === 'checkpoint') i.parameters.id = ++checkpointNumber;
        d.instances.push(i);
      }
      for (const c of fragment.checkpoints) {
        c.id = idFor('checkpoint-policy', policyIds); c.instanceId = remap.get(c.instanceId)!;
        c.resetGroups = c.resetGroups.map(id => groupMap.get(id)!); add(c.spawn, offset); d.checkpoints.push(c);
      }
      for (const o of fragment.objectives) { o.id = idFor('finish', objectiveIds); o.target = remap.get(o.target)!; d.objectives.push(o); }
      for (const s of fragment.signals) { s.id = idFor('signal', signalIds); s.source.instanceId = remap.get(s.source.instanceId)!; s.target.instanceId = remap.get(s.target.instanceId)!; d.signals.push(s); }
      for (const n of fragment.navigation.nodes) { n.id = nodeMap.get(n.id)!; n.instanceId = remap.get(n.instanceId)!; add(n.position, offset); d.navigation.nodes.push(n); }
      for (const l of fragment.navigation.links) { l.from = nodeMap.get(l.from)!; l.to = nodeMap.get(l.to)!; d.navigation.links.push(l); }
      return [...remap.values()];
    });
  }

  /** Detached input for runtime play: failed validation never mutates the draft. */
  playDocument(start: 'spawn' | { checkpointId: string } | Vec3 = 'spawn'): LevelDocument {
    const d = this.document;
    if (start !== 'spawn') {
      if ('checkpointId' in start) {
        const checkpoint = d.checkpoints.find(c => c.id === start.checkpointId);
        if (!checkpoint) throw new Error('Choose an existing checkpoint.');
        d.spawn = clone(checkpoint.spawn);
      } else d.spawn = clone(start);
    }
    return parseLevel(d);
  }
}
