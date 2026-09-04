import * as THREE from 'three';
import { resolveInstance, type LevelDocument, type LevelInstance, type Vec3 } from '../content/LevelDocument';
import { pieceToBox } from '../game/Level';
import { PARTS } from '../content/PartRegistry';
import { SURFACES } from '../physics/Surfaces';

const NS = 'http://www.w3.org/2000/svg';
function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}
export function footprint(instance: LevelInstance): { x: number; z: number; w: number; d: number; points: string } {
  const piece = resolveInstance(instance), box = pieceToBox(piece);
  let points: THREE.Vector3[];
  if (box) {
    points = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(new THREE.Vector3(x * box.size.x / 2, y * box.size.y / 2, z * box.size.z / 2).applyQuaternion(box.quat).add(box.center));
  } else {
    const w = 'w' in piece ? piece.w : piece.kind === 'laser' && piece.axis === 'x' ? piece.length : 1.5;
    const d = 'd' in piece ? piece.d : piece.kind === 'laser' && piece.axis === 'z' ? piece.length : 1.5;
    points = [new THREE.Vector3(piece.x - w / 2, 0, piece.z - d / 2), new THREE.Vector3(piece.x + w / 2, 0, piece.z + d / 2)];
  }
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  return { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ, points: `${minX},${minZ} ${maxX},${minZ} ${maxX},${maxZ} ${minX},${maxZ}` };
}

/** Top-down authoring view. Geometry bounds use the runtime's collider converter. */
export class EditorViewport {
  readonly svg = node('svg', { tabindex: '0', role: 'application', 'aria-label': 'Course editor canvas' });
  onSelect: (ids: string[]) => void = () => {};
  onMove: (delta: Vec3) => void = () => {};
  onPlace: (position: Vec3) => void = () => {};
  placing = false;
  elevation = 0;
  overlays = true;
  layerOnly = false;
  private level: LevelDocument | null = null;
  private selection: string[] = [];
  private invalidIds = new Set<string>();
  private invalidSpawn = false;
  private view = { x: -18, z: -18, w: 36, h: 36 };
  private drag: { x: number; z: number; mode: 'move' | 'pan' | 'select'; shift: boolean; original: string[] } | null = null;
  private readonly listeners = new AbortController();
  private readonly resizeObserver = new ResizeObserver(() => { if (this.svg.clientWidth && this.svg.clientHeight) this.draw(); });

  constructor() {
    this.svg.classList.add('editor-canvas'); this.resizeObserver.observe(this.svg);
    const signal = this.listeners.signal;
    this.svg.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault(); this.svg.focus(); const p = this.point(e);
      if (this.placing && e.button === 0 && !e.altKey) { this.onPlace({ x: p.x, y: this.elevation, z: p.z }); return; }
      const id = (e.target as Element).closest('[data-instance]')?.getAttribute('data-instance');
      const mode = e.button === 1 || e.altKey ? 'pan' : id ? 'move' : 'select';
      if (mode === 'move' && id) {
        const next = e.shiftKey ? this.selection.includes(id) ? this.selection.filter(i => i !== id) : [...this.selection, id] : this.selection.includes(id) ? this.selection : [id];
        this.onSelect(next);
      }
      this.drag = { ...p, mode, shift: e.shiftKey, original: [...this.selection] };
      this.svg.setPointerCapture(e.pointerId);
    }, { signal });
    this.svg.addEventListener('pointermove', e => {
      if (!this.drag) return; const p = this.point(e);
      if (this.drag.mode === 'pan') { this.view.x += this.drag.x - p.x; this.view.z += this.drag.z - p.z; this.draw(); }
      else if (this.drag.mode === 'move') {
        for (const el of this.svg.querySelectorAll<SVGGElement>('[data-selected=true]')) el.setAttribute('transform', `translate(${p.x - this.drag.x} ${p.z - this.drag.z})`);
      } else {
        this.svg.querySelector('[data-marquee]')?.remove();
        const rect = node('rect', { x: Math.min(p.x, this.drag.x), y: Math.min(p.z, this.drag.z), width: Math.abs(p.x - this.drag.x), height: Math.abs(p.z - this.drag.z), fill: '#5df4df22', stroke: '#5df4df', 'stroke-width': .08, 'data-marquee': '' });
        this.svg.append(rect);
      }
    }, { signal });
    this.svg.addEventListener('pointerup', e => {
      const drag = this.drag; this.drag = null; if (!drag) return;
      const p = this.point(e); this.svg.releasePointerCapture(e.pointerId);
      if (drag.mode === 'move') this.onMove({ x: p.x - drag.x, y: 0, z: p.z - drag.z });
      if (drag.mode === 'select') {
        const hits = this.level?.instances.filter(i => { const q = i.transform.position; return q.x >= Math.min(p.x, drag.x) && q.x <= Math.max(p.x, drag.x) && q.z >= Math.min(p.z, drag.z) && q.z <= Math.max(p.z, drag.z); }).map(i => i.id) ?? [];
        this.onSelect(drag.shift ? [...new Set([...drag.original, ...hits])] : hits);
      }
      this.draw();
    }, { signal });
    this.svg.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const id = (e.target as Element).closest('[data-instance]')?.getAttribute('data-instance');
      if (id) { e.preventDefault(); this.onSelect(e.shiftKey ? [...new Set([...this.selection, id])] : [id]); }
    }, { signal });
    this.svg.addEventListener('pointercancel', () => { this.drag = null; this.draw(); }, { signal });
    this.svg.addEventListener('wheel', e => {
      e.preventDefault(); const p = this.point(e), factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      if (this.view.w * factor < 6 || this.view.w * factor > 1000) return;
      this.view.x = p.x - (p.x - this.view.x) * factor; this.view.z = p.z - (p.z - this.view.z) * factor;
      this.view.w *= factor; this.view.h *= factor; this.draw();
    }, { signal, passive: false });
  }
  private point(event: MouseEvent): { x: number; z: number } {
    const inverse = this.svg.getScreenCTM()?.inverse();
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    return { x: p.x, z: p.y };
  }
  setDocument(level: LevelDocument, selection: string[], invalidIds?: string[], invalidSpawn?: boolean): void { this.level = level; this.selection = selection; if (invalidIds) this.invalidIds = new Set(invalidIds); if (invalidSpawn !== undefined) this.invalidSpawn = invalidSpawn; this.draw(); }
  fit(selectionOnly = false): void {
    const parts = this.level?.instances.filter(i => !selectionOnly || this.selection.includes(i.id)) ?? [];
    if (!parts.length) return;
    const boxes = parts.map(footprint), minX = Math.min(...boxes.map(b => b.x)), minZ = Math.min(...boxes.map(b => b.z));
    const maxX = Math.max(...boxes.map(b => b.x + b.w)), maxZ = Math.max(...boxes.map(b => b.z + b.d));
    const size = Math.max(maxX - minX, maxZ - minZ, 12) + 8;
    this.view = { x: (minX + maxX - size) / 2, z: (minZ + maxZ - size) / 2, w: size, h: size }; this.draw();
  }
  private draw(): void {
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.z} ${this.view.w} ${this.view.h}`);
    this.svg.style.cursor = this.placing ? 'crosshair' : 'default';
    this.svg.replaceChildren();
    const defs = node('defs'), grid = node('pattern', { id: 'workshop-grid', width: 1, height: 1, patternUnits: 'userSpaceOnUse' });
    grid.append(node('path', { d: 'M 1 0 L 0 0 0 1', fill: 'none', stroke: '#25394c', 'stroke-width': .025 })); defs.append(grid); this.svg.append(defs);
    this.svg.append(node('rect', { x: this.view.x - this.view.w, y: this.view.z - this.view.h, width: this.view.w * 3, height: this.view.h * 3, fill: 'url(#workshop-grid)' }));
    if (!this.level) return;
    const fontSize = Math.max(.25, this.view.w * 11 / Math.max(120, Math.min(this.svg.clientWidth, this.svg.clientHeight)));
    for (const instance of [...this.level.instances].sort((a, b) => a.transform.position.y - b.transform.position.y || Number(a.type !== 'slab') - Number(b.type !== 'slab'))) {
      if (this.layerOnly && Math.abs(instance.transform.position.y - this.elevation) > .01) continue;
      const b = footprint(instance), selected = this.selection.includes(instance.id);
      const group = node('g', { 'data-instance': instance.id, 'data-selected': String(selected), role: 'button', 'aria-label': `${PARTS[instance.type].label} ${instance.id}`, tabindex: '0' });
      const surface = instance.type === 'slab' || instance.type === 'ramp' ? instance.parameters.surface ?? 'standard' : null;
      const fill = surface ? new THREE.Color(...SURFACES[surface].fill).getStyle() : instance.type === 'goal' ? '#33bfad' : instance.type === 'checkpoint' ? '#ca9df3' : PARTS[instance.type].category === 'hazard' ? '#b73b61' : '#536886';
      group.append(node('rect', { x: b.x, y: b.z, width: b.w, height: b.d, fill, 'fill-opacity': .88, stroke: this.invalidIds.has(instance.id) ? '#ff557c' : selected ? '#fff0a8' : '#9ab8cc', 'stroke-width': selected || this.invalidIds.has(instance.id) ? .16 : .06 }));
      if (this.overlays && pieceToBox(resolveInstance(instance))) group.append(node('polygon', { points: b.points, fill: 'none', stroke: '#59e2ff', 'stroke-width': .035, 'stroke-dasharray': '.2 .12', 'pointer-events': 'none' }));
      if (this.overlays && instance.type === 'slab' && b.w > 1 && b.d > 1) group.append(node('rect', { x: b.x + .5, y: b.z + .5, width: b.w - 1, height: b.d - 1, fill: 'none', stroke: '#defca5', 'stroke-width': .035, 'stroke-dasharray': '.1 .2', 'pointer-events': 'none' }));
      const isFloor = instance.type === 'slab' || instance.type === 'ramp';
      const label = node('text', { x: isFloor ? b.x + .3 : b.x + b.w / 2, y: isFloor ? b.z + fontSize + .2 : b.z - .25, fill: '#fff', stroke: '#07111b', 'stroke-width': .05, 'paint-order': 'stroke', 'font-size': fontSize, 'text-anchor': isFloor ? 'start' : 'middle', 'pointer-events': 'none' });
      label.textContent = `${PARTS[instance.type].label} · ${instance.transform.position.y}m`; group.append(label); this.svg.append(group);
    }
    if (this.overlays) for (const zone of this.level.cameraZones) {
      this.svg.append(node('rect', { x: zone.center.x - zone.size.x / 2, y: zone.center.z - zone.size.z / 2, width: zone.size.x, height: zone.size.z, fill: 'none', stroke: '#d29bff', 'stroke-dasharray': '.5 .3', 'stroke-width': .08, 'pointer-events': 'none' }));
    }
    const spawn = this.level.spawn;
    this.svg.append(node('circle', { cx: spawn.x, cy: spawn.z, r: .5, fill: this.invalidSpawn ? '#ff557c' : '#fff', stroke: '#061119', 'stroke-width': .12, 'pointer-events': 'none' }));
    const label = node('text', { x: spawn.x, y: spawn.z + 1.1, fill: '#fff', 'font-size': fontSize, 'text-anchor': 'middle', 'pointer-events': 'none' }); label.textContent = 'SPAWN'; this.svg.append(label);
  }
  dispose(): void { this.resizeObserver.disconnect(); this.listeners.abort(); this.svg.remove(); }
}
