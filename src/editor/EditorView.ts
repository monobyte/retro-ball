import { EditorModel, starterDocument, type Prefab } from './EditorModel';
import { EditorViewport } from './EditorViewport';
import { PARTS, type PartDefinition, type ParameterField } from '../content/PartRegistry';
import type { LevelDocument, PieceKind, Vec3 } from '../content/LevelDocument';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
const axes = ['x', 'y', 'z'] as const;
const prefabKey = 'retro-ball.editor-prefabs.v1';

export class EditorView {
  readonly root = el('section');
  readonly model: EditorModel;
  readonly viewport = new EditorViewport();
  onPlay: (document: LevelDocument) => Promise<void> = async () => {};
  onExit: () => void = () => {};
  private readonly listeners = new AbortController();
  private readonly palette = el('div');
  private readonly inspector = el('div');
  private readonly course = el('div');
  private readonly validation = el('div');
  private readonly library = el('div');
  private readonly message = el('p');
  private readonly title = el('strong');
  private readonly status = el('span');
  private readonly search = el('input');
  private readonly playStart = el('select');
  private readonly undo: HTMLButtonElement;
  private readonly redo: HTMLButtonElement;
  private readonly mode = el('span', 'SELECT');
  private prefabs: Prefab[] = [];
  private placing: PieceKind | null = null;
  private prefabToPlace: { prefab: Prefab; values: Record<string, unknown> } | null = null;
  private downloadUrl: string | null = null;
  private renderFrame = 0;

  constructor() {
    this.model = new EditorModel(starterDocument(), {
      getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
    });
    this.root.className = 'editor'; this.root.hidden = true; this.root.setAttribute('aria-label', 'Workshop');
    const header = el('header'), brand = el('div'); brand.append(el('small', 'THE WORKSHOP'), this.title);
    const actions = el('div'); actions.className = 'editor-actions';
    this.undo = this.button('Undo', () => this.model.undo()); this.redo = this.button('Redo', () => this.model.redo());
    const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; file.dataset['editorImport'] = '';
    file.addEventListener('change', async () => {
      try {
        const selected = file.files?.[0]; if (!selected) return;
        if (selected.size > 2_000_000) throw new Error('Course file exceeds 2 MB. Your draft has been kept.');
        this.model.importFile(await selected.text()); this.viewport.fit(); this.tell('Course imported. Undo restores the previous draft.');
      } catch (error) { this.tell(error); } finally { file.value = ''; }
    });
    actions.append(this.undo, this.redo, this.button('New', () => { this.model.edit('New course', d => { Object.assign(d, starterDocument()); return []; }); this.viewport.fit(); }),
      this.button('Import', () => file.click()), this.button('Export', () => this.download()),
      this.button('Recover draft', () => { this.tell(this.model.recover() ? 'Recovered local draft.' : 'No local draft found.'); this.viewport.fit(); }),
      this.button('Return to relay', () => this.onExit()));
    header.append(brand, actions, file);
    const tools = el('nav'); tools.className = 'editor-tools'; tools.setAttribute('aria-label', 'Editor tools');
    const snap = this.select(['0.25', '0.5', '1', '2', '0'], '1', value => { this.model.snap = Number(value); }); snap.setAttribute('aria-label', 'Grid snap');
    const elevation = this.number('Placement elevation', 0, value => { this.viewport.elevation = value; this.render(); });
    const overlay = el('input'); overlay.type = 'checkbox'; overlay.checked = true; overlay.setAttribute('aria-label', 'Collider and clearance overlays'); overlay.onchange = () => { this.viewport.overlays = overlay.checked; this.render(); };
    tools.append(this.button('Select', () => this.setPlacement(null)), this.mode, this.label('Grid', snap), this.label('Elevation', elevation), this.button('Fit course', () => this.viewport.fit()), this.button('Frame selection', () => this.viewport.fit(true)), this.label('Bounds / clearance', overlay));
    const layer = el('input'); layer.type = 'checkbox'; layer.setAttribute('aria-label', 'Current elevation only'); layer.onchange = () => { this.viewport.layerOnly = layer.checked; this.render(); }; tools.append(this.label('This layer', layer));
    this.playStart.setAttribute('aria-label', 'Play start');
    tools.append(this.playStart, this.button('Play test', () => { void this.play(); }));
    const layout = el('div'); layout.className = 'editor-layout';
    const left = el('aside'); left.setAttribute('aria-label', 'Parts and prefabs');
    this.search.type = 'search'; this.search.placeholder = 'Find a part…'; this.search.setAttribute('aria-label', 'Search parts'); this.search.oninput = () => this.renderPalette();
    const prefabDetails = el('details'); prefabDetails.open = true; prefabDetails.append(el('summary', 'Prefabs'), this.library);
    left.append(el('h2', 'Parts'), this.search, this.palette, prefabDetails);
    const center = el('main'); center.className = 'editor-stage';
    const help = el('p', 'Drag parts to move · Shift selects more · Drag empty space to box-select · Alt-drag pans · Wheel zooms'); help.className = 'editor-help';
    center.append(this.viewport.svg, help);
    const right = el('aside'); right.setAttribute('aria-label', 'Inspector');
    const courseDetails = el('details'); courseDetails.append(el('summary', 'Course / cameras'), this.course);
    const errors = el('details'); errors.open = true; errors.append(el('summary', 'Validation'), this.validation);
    right.append(el('h2', 'Inspector'), this.inspector, courseDetails, errors);
    layout.append(left, center, right);
    const footer = el('footer'); this.message.setAttribute('role', 'status'); footer.append(this.status, this.message);
    this.root.append(header, tools, layout, footer); document.body.append(this.root);
    this.viewport.onSelect = ids => this.model.select(ids);
    this.viewport.onMove = delta => this.run(() => this.model.move(delta));
    this.viewport.onPlace = position => this.run(() => {
      if (this.prefabToPlace) this.model.insertPrefab(this.prefabToPlace.prefab, position, this.prefabToPlace.values);
      else if (this.placing) this.model.place(this.placing, position);
    });
    this.model.onChange = () => {
      if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
      this.renderFrame = requestAnimationFrame(() => { this.renderFrame = 0; this.render(); });
    };
    this.root.addEventListener('keydown', e => {
      if (e.target instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.key === 'Escape') { this.setPlacement(null); return; }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.model.redo() : this.model.undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyD') { e.preventDefault(); this.run(() => this.model.duplicate()); }
      else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); this.run(() => this.model.remove()); }
      else if (e.code === 'KeyR') { e.preventDefault(); this.run(() => this.model.rotate()); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.code)) {
        e.preventDefault(); const step = (this.model.snap || .25) * (e.shiftKey ? 5 : 1);
        this.run(() => this.model.move({ x: e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0, y: e.code === 'PageUp' ? step : e.code === 'PageDown' ? -step : 0, z: e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0 }));
      }
    }, { signal: this.listeners.signal });
    try { this.model.recover(); } catch (error) { this.tell(error); }
    try {
      const text = localStorage.getItem(prefabKey);
      if (text && text.length <= 1_000_000) {
        const saved: unknown = JSON.parse(text);
        if (!Array.isArray(saved) || saved.length > 50) throw new Error('Invalid prefab library.');
        for (const prefab of saved) {
          if (!prefab || typeof prefab.name !== 'string' || !prefab.exposed || typeof prefab.exposed !== 'object') throw new Error('Invalid prefab data.');
          new EditorModel().insertPrefab(prefab, { x: 20, y: 0, z: 0 });
        }
        this.prefabs = saved;
      }
    } catch { this.tell('The saved prefab library could not be loaded. Your course draft is intact.'); }
    this.render(); this.viewport.fit();
  }
  private run(action: () => void): void { try { action(); } catch (error) { this.tell(error); } }
  private tell(value: unknown): void { this.message.textContent = value instanceof Error ? value.message : String(value); }
  private button(text: string, action: () => void): HTMLButtonElement { const button = el('button', text); button.type = 'button'; button.onclick = () => this.run(action); return button; }
  private label(text: string, input: HTMLElement): HTMLLabelElement { const label = el('label'); label.append(el('span', text), input); return label; }
  private number(name: string, value: number, change: (value: number) => void): HTMLInputElement {
    const input = el('input'); input.type = 'number'; input.step = 'any'; input.value = String(value); input.setAttribute('aria-label', name);
    input.onchange = () => this.run(() => { if (!input.value || !Number.isFinite(input.valueAsNumber)) throw new Error(`${name} needs a finite number.`); change(input.valueAsNumber); }); return input;
  }
  private select(values: readonly string[], current: string, change: (value: string) => void): HTMLSelectElement {
    const select = el('select'); for (const value of values) { const option = el('option', value); option.value = value; select.append(option); } select.value = current; select.onchange = () => this.run(() => change(select.value)); return select;
  }
  private text(name: string, value: string, change: (value: string) => void): HTMLInputElement {
    const input = el('input'); input.value = value; input.setAttribute('aria-label', name); input.onchange = () => this.run(() => change(input.value)); return input;
  }
  private vector(parent: HTMLElement, label: string, value: Vec3, change: (value: Vec3) => void): void {
    const row = el('div'); row.className = 'editor-vector';
    for (const axis of axes) row.append(this.label(axis, this.number(`${label} ${axis}`, value[axis], n => change({ ...value, [axis]: n }))));
    parent.append(el('h3', label), row);
  }
  private field(parent: HTMLElement, key: string, field: ParameterField, value: unknown, change: (value: unknown) => void): void {
    if (field.kind === 'vector') {
      const row = el('div'); row.className = 'editor-vector';
      for (const axis of field.axes) row.append(this.label(axis, this.number(`${key} ${axis}`, (value as Record<string, number> | undefined)?.[axis] ?? 0, n => change({ ...Object.fromEntries(field.axes.map(a => [a, 0])), ...value as object, [axis]: n }))));
      if (value === undefined && !field.required) for (const input of row.querySelectorAll('input')) { input.value = ''; input.placeholder = 'Default'; }
      parent.append(el('h3', key), row); if (!field.required && value !== undefined) parent.append(this.button(`Default ${key}`, () => change(undefined))); return;
    }
    const input = field.kind === 'choice' ? this.select(field.required ? field.values : ['', ...field.values], String(value ?? ''), v => change(v === '' && !field.required ? undefined : v)) : field.kind === 'number' ? this.number(key, Number(value ?? Math.max(0, field.min)), change) : this.text(key, String(value ?? ''), change);
    input.setAttribute('aria-label', key); input.dataset['parameter'] = key;
    if (!field.required) {
      if (input instanceof HTMLSelectElement) input.options[0]!.textContent = 'Default';
      if (input instanceof HTMLInputElement) {
        if (value === undefined) input.value = '';
        input.placeholder = 'Default';
        const update = input.onchange;
        input.onchange = event => { if (input.value === '') this.run(() => change(undefined)); else update?.call(input, event); };
      }
    }
    if (field.kind === 'number' && input instanceof HTMLInputElement) { input.min = String(field.min); input.max = String(field.max); }
    if (field.kind === 'text' && input instanceof HTMLInputElement) input.maxLength = field.maxLength;
    parent.append(this.label(key + (field.required ? '' : ' (optional)'), input));
  }
  private setPlacement(type: PieceKind | null): void {
    this.placing = type; this.prefabToPlace = null; this.viewport.placing = type !== null;
    this.mode.textContent = type ? `PLACE ${PARTS[type].label.toUpperCase()}` : 'SELECT'; this.renderPalette(); this.viewport.setDocument(this.model.document, this.model.selection);
  }
  private renderPalette(): void {
    this.palette.replaceChildren();
    for (const [type, part] of Object.entries(PARTS)) {
      if (!`${part.label} ${part.category}`.toLowerCase().includes(this.search.value.toLowerCase())) continue;
      const button = this.button(part.label, () => this.setPlacement(type as PieceKind)); button.dataset['part'] = type;
      button.setAttribute('aria-pressed', String(this.placing === type)); button.append(el('small', part.category)); this.palette.append(button);
    }
  }
  private render(): void {
    const focused = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement ? document.activeElement : null;
    const focusName = focused?.getAttribute('aria-label');
    const selectionStart = focused instanceof HTMLInputElement && focused.type === 'text' ? focused.selectionStart : null;
    const expanded = new Map(Array.from(this.root.querySelectorAll<HTMLDetailsElement>('[data-editor-detail]')).map(el => [el.dataset['editorDetail'], el.open]));
    const d = this.model.document, selection = this.model.selection;
    this.title.textContent = d.metadata.name + (this.model.dirty ? ' *' : '');
    this.status.textContent = `${d.instances.length} parts · ${selection.length} selected · ${this.model.storageMessage || 'Local workshop'}`;
    this.undo.disabled = !this.model.undoLabel; this.redo.disabled = !this.model.redoLabel;
    this.undo.title = this.model.undoLabel ?? ''; this.redo.title = this.model.redoLabel ?? '';
    const issues = this.model.issues;
    this.renderPalette(); this.viewport.setDocument(d, selection, issues.flatMap(i => i.instanceIds ?? (i.instanceId ? [i.instanceId] : [])), issues.some(i => i.path === 'spawn' && i.severity === 'error'));
    const currentStart = this.playStart.value; this.playStart.replaceChildren();
    for (const [value, text] of [['spawn', 'Play from spawn'], ['selection', 'Play from selection'], ...d.checkpoints.map(c => [c.id, `Checkpoint: ${c.id}`])]) { const option = el('option', text); option.value = value!; this.playStart.append(option); }
    if (Array.from(this.playStart.options).some(o => o.value === currentStart)) this.playStart.value = currentStart;
    this.renderInspector(d, selection); this.renderCourse(d); this.renderLibrary();
    for (const detail of this.root.querySelectorAll<HTMLDetailsElement>('[data-editor-detail]')) if (expanded.has(detail.dataset['editorDetail'])) detail.open = expanded.get(detail.dataset['editorDetail'])!;
    this.validation.replaceChildren();
    if (!issues.length) this.validation.append(el('p', 'Ready to play.'));
    for (const issue of issues) {
      const button = this.button(`${issue.severity.toUpperCase()} · ${issue.path}: ${issue.message}`, () => {
        let ids = issue.instanceIds ?? (issue.instanceId ? [issue.instanceId] : []);
        const index = /^instances\[(\d+)\]/.exec(issue.path)?.[1]; if (index && d.instances[Number(index)]) ids = [d.instances[Number(index)]!.id];
        if (!ids.length && issue.path === 'instances') ids = d.instances.filter(i => i.type === 'slab' || i.type === 'goal').map(i => i.id);
        if (ids.length) { this.model.select(ids); this.viewport.fit(true); }
      }); button.className = `editor-issue ${issue.severity}`; this.validation.append(button);
    }
    if (focused && !focused.isConnected && focusName) {
      const replacement = [...this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[aria-label], select[aria-label]')].find(el => el.getAttribute('aria-label') === focusName);
      replacement?.focus({ preventScroll: true });
      if (replacement instanceof HTMLInputElement && replacement.type === 'text' && selectionStart !== null) replacement.setSelectionRange(selectionStart, selectionStart);
    }
  }
  private renderInspector(d: LevelDocument, selection: string[]): void {
    this.inspector.replaceChildren(); const parts = d.instances.filter(i => selection.includes(i.id));
    if (!parts.length) { this.inspector.append(el('p', 'Select a part to edit it, or choose a part and click the canvas to place it.')); return; }
    this.inspector.append(el('p', parts.map(i => i.id).join(', ')));
    const actions = el('div'); actions.className = 'editor-actions'; actions.append(this.button('Rotate 90°', () => this.model.rotate()), this.button('Duplicate', () => this.model.duplicate()), this.button('Delete', () => this.model.remove())); this.inspector.append(actions);
    const first = parts[0]!;
    this.vector(this.inspector, 'Position', first.transform.position, value => { const old = first.transform.position; this.model.move({ x: value.x - old.x, y: value.y - old.y, z: value.z - old.z }); });
    for (const [key, field] of Object.entries((PARTS[first.type] as PartDefinition).parameters)) {
      if (parts.every(i => Object.hasOwn(PARTS[i.type].parameters, key))) this.field(this.inspector, key, field, (first.parameters as unknown as Record<string, unknown>)[key], value => this.model.parameter(key, value));
    }
    if (first.type === 'checkpoint' && parts.length === 1) {
      const checkpoint = d.checkpoints.find(c => c.instanceId === first.id)!;
      this.vector(this.inspector, 'Checkpoint spawn', checkpoint.spawn, value => this.model.edit('Set checkpoint spawn', doc => { doc.checkpoints.find(c => c.id === checkpoint.id)!.spawn = value; }));
    }
    const name = this.text('Prefab name', 'My section', () => {}); const exposed = el('details'); exposed.append(el('summary', 'Expose prefab parameters'));
    for (const part of parts) for (const key of Object.keys(PARTS[part.type].parameters)) {
      const input = el('input'); input.type = 'checkbox'; input.dataset['exposeId'] = part.id; input.dataset['exposeKey'] = key;
      exposed.append(this.label(`${part.id} / ${key}`, input));
    }
    this.inspector.append(el('h3', 'Make a reusable section'), name, exposed, this.button('Save prefab', () => {
      if (this.prefabs.length >= 50) throw new Error('The library holds up to 50 prefabs.');
      const fields: Prefab['exposed'] = {};
      for (const input of exposed.querySelectorAll<HTMLInputElement>('input:checked')) fields[`${input.dataset['exposeId']}.${input.dataset['exposeKey']}`] = { instanceId: input.dataset['exposeId']!, parameter: input.dataset['exposeKey']! };
      const prefab = this.model.createPrefab(name.value, fields); this.prefabs.push(prefab); const saved = this.saveLibrary(); this.renderLibrary(); if (saved) this.tell(`Saved ${prefab.name}.`);
    }));
  }
  private saveLibrary(): boolean {
    try { const text = JSON.stringify(this.prefabs); if (text.length > 1_000_000) throw new Error(); localStorage.setItem(prefabKey, text); return true; }
    catch { this.tell('Prefab library is only in memory: local storage is unavailable or full.'); return false; }
  }
  private renderLibrary(): void {
    this.library.replaceChildren(); if (!this.prefabs.length) this.library.append(el('p', 'Save selected parts as a reusable section.'));
    for (const prefab of this.prefabs) {
      const details = el('details'); details.dataset['editorDetail'] = `prefab-${this.prefabs.indexOf(prefab)}`; details.append(el('summary', prefab.name)); const values: Record<string, unknown> = {};
      for (const [name, ref] of Object.entries(prefab.exposed)) {
        const part = prefab.fragment.instances.find(i => i.id === ref.instanceId); if (!part) continue;
        const field = (PARTS[part.type] as PartDefinition).parameters[ref.parameter]; if (!field) continue;
        this.field(details, name, field, (part.parameters as unknown as Record<string, unknown>)[ref.parameter], value => { values[name] = value; });
      }
      details.append(this.button('Place prefab', () => { this.placing = null; this.prefabToPlace = { prefab, values }; this.viewport.placing = true; this.mode.textContent = `PLACE ${prefab.name}`; }), this.button('Remove prefab', () => { this.prefabs = this.prefabs.filter(p => p !== prefab); this.saveLibrary(); this.renderLibrary(); })); this.library.append(details);
    }
  }
  private renderCourse(d: LevelDocument): void {
    this.course.replaceChildren();
    this.course.append(this.label('Name', this.text('Course name', d.metadata.name, value => this.model.edit('Rename course', doc => { doc.metadata.name = value; }))),
      this.label('Description', this.text('Course description', d.metadata.description, value => this.model.edit('Describe course', doc => { doc.metadata.description = value; }))),
      this.label('Level ID', this.text('Level ID', d.id, value => this.model.edit('Set level ID', doc => { doc.id = value; }))),
      this.label('Difficulty', this.select(['test', 'easy', 'normal', 'hard'], d.metadata.difficulty, value => this.model.edit('Set difficulty', doc => { doc.metadata.difficulty = value as LevelDocument['metadata']['difficulty']; }))),
      this.label('Theme', this.select(['neon-grid'], d.themeId, value => this.model.edit('Set theme', doc => { doc.themeId = value; }))),
      this.label('Music', this.select(['retro-main'], d.musicId, value => this.model.edit('Set music', doc => { doc.musicId = value; }))));
    this.vector(this.course, 'Spawn', d.spawn, value => this.model.edit('Set spawn', doc => { doc.spawn = value; }));
    this.course.append(this.button('Route from selection', () => this.model.edit('Declare route', doc => { doc.validation.intendedRoute = this.model.selection; })), el('p', `Route: ${d.validation.intendedRoute.join(' → ') || 'Not declared'}`));
    this.course.append(el('h3', 'Objectives'));
    for (const objective of d.objectives) {
      const box = el('div'); const required = el('input'); required.type = 'checkbox'; required.checked = objective.required;
      required.onchange = () => this.run(() => this.model.edit('Set required objective', doc => { doc.objectives.find(o => o.id === objective.id)!.required = required.checked; }));
      box.append(el('p', objective.id), this.select(d.instances.filter(i => i.type === 'goal').map(i => i.id), objective.target, value => this.model.edit('Set objective target', doc => { doc.objectives.find(o => o.id === objective.id)!.target = value; })), this.label('Required to finish', required)); this.course.append(box);
    }
    this.course.append(el('p', 'Placing a goal creates its completion objective; placing a checkpoint creates its spawn policy.'));
    this.course.append(el('h3', 'Camera zones'), this.button('Add camera zone', () => this.model.edit('Add camera zone', doc => {
      let index = 1; while (doc.cameraZones.some(z => z.id === `camera-${index}`)) index++;
      const point = doc.instances.find(i => this.model.selection.includes(i.id))?.transform.position ?? doc.spawn;
      doc.cameraZones.push({ id: `camera-${index}`, mode: 'arena', center: { ...point }, size: { x: 20, y: 10, z: 20 }, viewHeight: 28, priority: 0 });
    })));
    for (const zone of d.cameraZones) {
      const details = el('details'); details.dataset['editorDetail'] = zone.id; details.append(el('summary', zone.id));
      details.append(this.label('Mode', this.select(['arena', 'puzzle', 'speed', 'vertical'], zone.mode ?? 'arena', value => this.model.edit('Set camera mode', doc => { doc.cameraZones.find(z => z.id === zone.id)!.mode = value as NonNullable<typeof zone.mode>; }))));
      this.vector(details, 'Camera center', zone.center, value => this.model.edit('Move camera zone', doc => { doc.cameraZones.find(z => z.id === zone.id)!.center = value; }));
      this.vector(details, 'Camera size', zone.size, value => this.model.edit('Resize camera zone', doc => { doc.cameraZones.find(z => z.id === zone.id)!.size = value; }));
      details.append(this.label('View height', this.number('View height', zone.viewHeight, value => this.model.edit('Set camera zoom', doc => { doc.cameraZones.find(z => z.id === zone.id)!.viewHeight = value; }))), this.label('Priority', this.number('Camera priority', zone.priority ?? 0, value => this.model.edit('Set camera priority', doc => { doc.cameraZones.find(z => z.id === zone.id)!.priority = value; }))), this.button('Delete camera zone', () => this.model.edit('Delete camera zone', doc => { doc.cameraZones = doc.cameraZones.filter(z => z.id !== zone.id); })));
      this.course.append(details);
    }
  }
  private async play(): Promise<void> {
    try {
      const start = this.playStart.value;
      const selected = this.model.document.instances.find(i => this.model.selection.includes(i.id));
      if (start === 'selection' && !selected) throw new Error('Select a supported floor position first.');
      const point = selected?.transform.position;
      const doc = this.model.playDocument(start === 'spawn' ? 'spawn' : start === 'selection' ? { x: point!.x, y: point!.y + .6, z: point!.z } : { checkpointId: start });
      this.model.autosave(); await this.onPlay(doc);
    } catch (error) { this.tell(error); }
  }
  private download(): void {
    const text = this.model.exportFile(); if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = el('a'); link.href = this.downloadUrl; link.download = `${this.model.document.id}.json`; link.click(); this.model.markExported(); this.tell('Course export prepared.');
  }
  show(): void { this.root.hidden = false; this.render(); this.viewport.svg.focus(); }
  hide(): void { this.root.hidden = true; }
  dispose(): void { if (this.renderFrame) cancelAnimationFrame(this.renderFrame); this.listeners.abort(); this.model.onChange = null; this.viewport.dispose(); if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl); this.root.remove(); }
}
