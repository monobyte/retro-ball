import { signalDocument } from './SignalDocument.ts';
import { validateSignalGraph } from '../signals/SignalGraph.ts';
import { movingBounds, sweepOverlaps, isMovingPiece } from './MovingBounds.ts';
import { PARTS, hasPart, type PartDefinition } from './PartRegistry.ts';
import { resolveLevel, type LevelDocument, type Vec3 } from './LevelDocument.ts';

export interface ValidationIssue { severity: 'error' | 'warning'; path: string; message: string; instanceId?: string; instanceIds?: string[] }
export interface ValidationResult { document: LevelDocument | null; issues: ValidationIssue[] }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000;
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(v);
const text = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const vector = (v: unknown): v is Vec3 => object(v) && ['x', 'y', 'z'].every(k => finite(v[k])) && Object.keys(v).length === 3;

function isDocumentData(value: unknown): boolean {
  let count = 0;
  const seen = new Set<object>();
  const visit = (v: unknown, depth: number): boolean => {
    if (++count > 100000 || depth > 24) return false;
    if (v === null || typeof v === 'boolean') return true;
    if (typeof v === 'string') return v.length <= 10000;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v !== 'object' || seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.length <= 4000 && v.every(item => visit(item, depth + 1));
    return object(v) && Object.keys(v).every(key => !['__proto__', 'constructor', 'prototype'].includes(key) && visit(v[key], depth + 1));
  };
  return visit(value, 0);
}

/** Validate untrusted data before constructing any renderer, audio or physics resource. */
export function validateLevel(value: unknown, options: { draft?: boolean } = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string, instanceId?: string, instanceIds?: string[]) => issues.push({ severity: 'error' as const, path, message, ...(instanceId ? { instanceId } : {}), ...(instanceIds ? { instanceIds } : {}) });
  const warning = (path: string, message: string, instanceId?: string) => issues.push({ severity: 'warning' as const, path, message, ...(instanceId ? { instanceId } : {}) });
  const result = (): ValidationResult => ({ document: issues.some(i => i.severity === 'error') ? null : structuredClone(value) as LevelDocument, issues });
  if (!isDocumentData(value)) { error('$', 'Expected bounded JSON data with no executable values, cycles or special object keys.'); return { document: null, issues }; }
  if (!object(value)) { error('$', 'Expected a level document object.'); return result(); }
  const keys = ['schemaVersion', 'contentVersion', 'id', 'metadata', 'themeId', 'musicId', 'spawn', 'instances', 'resetGroups', 'checkpoints', 'objectives', 'signals', 'navigation', 'cameraZones', 'validation'];
  for (const key of Object.keys(value)) if (!keys.includes(key)) error(key, 'Unknown level field; executable scripts and custom properties are not supported.');
  if (value['schemaVersion'] !== 1) error('schemaVersion', 'Unsupported schema version. Expected 1.');
  if (!Number.isSafeInteger(value['contentVersion']) || Number(value['contentVersion']) < 1) error('contentVersion', 'Expected a positive integer content version.');
  if (!identifier(value['id'])) error('id', 'Use a stable lowercase ID containing letters, digits and hyphens.');
  const metadata = value['metadata'];
  if (!object(metadata) || !text(metadata['name'], 80) || !text(metadata['description'], 1000) || !['test', 'easy', 'normal', 'hard'].includes(String(metadata['difficulty']))) error('metadata', 'Provide a name, description and valid difficulty.');
  if (value['themeId'] !== 'neon-grid') error('themeId', 'Unknown theme. Available: neon-grid.');
  if (value['musicId'] !== 'retro-main') error('musicId', 'Unknown soundtrack. Available: retro-main.');
  if (!vector(value['spawn'])) error('spawn', 'Expected finite x/y/z coordinates within ±10000.');
  for (const key of ['instances', 'resetGroups', 'checkpoints', 'objectives', 'signals', 'cameraZones']) {
    if (!Array.isArray(value[key]) || (value[key] as unknown[]).length > 2000) error(key, 'Expected an array with at most 2000 entries.');
  }
  if (issues.some(i => i.severity === 'error')) return result();
  const list = (key: string) => value[key] as unknown[];
  const groups = new Set<string>();
  list('resetGroups').forEach((item, i) => {
    if (!object(item) || !identifier(item['id']) || !['attempt', 'checkpoint', 'course'].includes(String(item['policy']))) { error(`resetGroups[${i}]`, 'Expected a stable ID and attempt/checkpoint/course policy.'); return; }
    if (groups.has(item['id'])) error(`resetGroups[${i}].id`, 'Duplicate reset group ID.');
    groups.add(item['id']);
  });
  const instances = new Map<string, Record<string, unknown>>();
  const numericCheckpointIds = new Set<number>();
  if (!options.draft && list('instances').length === 0) error('instances', 'A playable level needs at least one track instance.');
  list('instances').forEach((item, i) => {
    const path = `instances[${i}]`;
    if (!object(item) || !identifier(item['id'])) { error(path, 'Expected an instance with a stable ID.'); return; }
    const id = item['id'];
    if (instances.has(id)) error(`${path}.id`, `Duplicate instance ID: ${id}.`, id);
    instances.set(id, item);
    for (const key of Object.keys(item)) if (!['id', 'type', 'transform', 'parameters', 'resetGroup', 'links'].includes(key)) error(`${path}.${key}`, 'Unknown instance field.', id);
    const type = item['type'];
    if (typeof type !== 'string' || !hasPart(type)) { error(`${path}.type`, `Unknown part type: ${String(type)}.`, id); return; }
    const transform = item['transform'];
    if (!object(transform) || !vector(transform['position']) || ![0, 90, 180, 270].includes(Number(transform['yaw'])) || typeof transform['yaw'] !== 'number') error(`${path}.transform`, 'Expected a finite position and yaw of 0, 90, 180 or 270 degrees.', id);
    if (!groups.has(String(item['resetGroup']))) error(`${path}.resetGroup`, 'Reference to an unknown reset group.', id);
    const params = item['parameters'];
    if (!object(params)) { error(`${path}.parameters`, 'Expected a parameter object.', id); return; }
    const definition: PartDefinition = PARTS[type];
    for (const key of Object.keys(params)) if (!Object.hasOwn(definition.parameters, key)) error(`${path}.parameters.${key}`, `Unknown parameter for ${type}.`, id);
    for (const [key, field] of Object.entries(definition.parameters)) {
      const v = params[key], fieldPath = `${path}.parameters.${key}`;
      if (v === undefined) { if (field.required) error(fieldPath, 'Required parameter is missing.', id); continue; }
      if (field.kind === 'number' && (!finite(v) || v < field.min || v > field.max)) error(fieldPath, `Expected a finite number from ${field.min} to ${field.max}.`, id);
      if (field.kind === 'choice' && !field.values.includes(String(v))) error(fieldPath, `Expected one of: ${field.values.join(', ')}.`, id);
      if (field.kind === 'text' && !text(v, field.maxLength)) error(fieldPath, `Expected text up to ${field.maxLength} characters.`, id);
      if (field.kind === 'vector' && (!object(v) || Object.keys(v).length !== field.axes.length || !field.axes.every(axis => finite(v[axis])))) error(fieldPath, `Expected finite ${field.axes.join('/')} coordinates.`, id);
    }
    if (type === 'laser' && Number(params['sweep']) > 0 && Number(params['speed']) <= 0) error(`${path}.parameters.speed`, 'A sweeping laser needs positive speed.', id);
    if (type === 'elevator' && Number(params['y1']) <= 0) error(`${path}.parameters.y1`, 'Elevator top must be above its base.', id);
    if (type === 'elevator' && 1.5 * Number(params['y1']) / (.22 * Number(params['period'])) > 20) error(`${path}.parameters.period`, 'Slow the elevator: peak travel speed must stay at or below 20 units per second.', id);
    if (type === 'laser' && 2 * Math.PI * Math.abs(Number(params['sweep'])) * Number(params['speed']) > 20) error(`${path}.parameters.speed`, 'Slow the laser sweep: peak travel speed must stay at or below 20 units per second.', id);
    if (type === 'bridge' && Number(params['dwell']) * 2 >= Number(params['period']) - .1) error(`${path}.parameters.dwell`, 'Waiting windows must leave at least 0.1 seconds for each round trip.', id);
    if (type === 'bridge' && 3 * Number(params['distance']) / (Number(params['period']) - 2 * Number(params['dwell'])) > 20) error(`${path}.parameters.period`, 'Increase the period or shorten travel: bridge speed must stay at or below 20 units per second.', id);
    if (type === 'rotator' && Math.abs(Number(params['angularSpeed'])) * Math.PI / 180 * Math.hypot(Number(params['w']), Number(params['d'])) / 2 > 20) error(`${path}.parameters.angularSpeed`, 'Slow the rotation: outer corner speed must stay at or below 20 units per second.', id);
    if (type === 'rotator' && Number(params['angularSpeed']) === 0) error(`${path}.parameters.angularSpeed`, 'Use a floor for stationary track; rotating platforms need nonzero angular speed.', id);
    if (type === 'checkpoint') {
      const n = Number(params['id']);
      if (!Number.isSafeInteger(n) || numericCheckpointIds.has(n)) error(`${path}.parameters.id`, 'Checkpoint number must be a unique integer.', id);
      numericCheckpointIds.add(n);
    }
    if (!Array.isArray(item['links']) || item['links'].length > 100) error(`${path}.links`, 'Expected at most 100 links.', id);
  });

  const reference = (id: unknown, path: string, type?: string): Record<string, unknown> | undefined => {
    const instance = typeof id === 'string' ? instances.get(id) : undefined;
    if (!instance || (type && instance['type'] !== type)) error(path, `Expected a reference to an existing ${type ?? 'part'} instance.`);
    return instance;
  };
  const link = (source: unknown, target: unknown, path: string) => {
    if (!object(source) || !object(target)) { error(path, 'Expected source and target port references.'); return; }
    for (const [side, ref, direction] of [['source', source, 'outputs'], ['target', target, 'inputs']] as const) {
      const item = reference(ref['instanceId'], `${path}.${side}.instanceId`);
      if (item && typeof item['type'] === 'string' && hasPart(item['type'])) {
        const definition: PartDefinition = PARTS[item['type']];
        if (!definition[direction].includes(ref['port'] as never)) error(`${path}.${side}.port`, `Part does not expose this ${direction === 'inputs' ? 'input' : 'output'} port.`);
      }
    }
  };
  for (const [id, item] of instances) if (Array.isArray(item['links'])) item['links'].forEach((l, i) => {
    if (!object(l) || !object(l['target'])) { error(`instances.${id}.links[${i}]`, 'Expected an output and target input.'); return; }
    link({ instanceId: id, port: l['output'] }, { instanceId: l['target']['instanceId'], port: l['target']['input'] }, `instances.${id}.links[${i}]`);
  });
  const unique = (items: unknown[], key: string, visit: (item: Record<string, unknown>, path: string) => void) => {
    const ids = new Set<string>();
    items.forEach((item, i) => {
      const path = `${key}[${i}]`;
      if (!object(item) || !identifier(item['id'])) { error(path, 'Expected an object with a stable ID.'); return; }
      if (ids.has(item['id'])) error(`${path}.id`, 'Duplicate ID.');
      ids.add(item['id']); visit(item, path);
    });
    return ids;
  };
  const declaredCheckpoints = new Set<string>();
  unique(list('checkpoints'), 'checkpoints', (c, path) => {
    reference(c['instanceId'], `${path}.instanceId`, 'checkpoint');
    if (declaredCheckpoints.has(String(c['instanceId']))) error(path, 'Checkpoint instance declared more than once.');
    declaredCheckpoints.add(String(c['instanceId']));
    if (!vector(c['spawn'])) error(`${path}.spawn`, 'Expected a safe finite spawn point.');
    if (!Array.isArray(c['resetGroups']) || c['resetGroups'].some(id => !groups.has(id))) error(`${path}.resetGroups`, 'Expected references to existing reset groups.');
  });
  for (const [id, instance] of instances) if (instance['type'] === 'checkpoint' && !declaredCheckpoints.has(id)) error('checkpoints', `Missing checkpoint policy for ${id}.`, id);
  let required = 0;
  unique(list('objectives'), 'objectives', (o, path) => {
    if (o['type'] !== 'reach-goal') error(`${path}.type`, 'Only reach-goal objectives are supported in schema 1.');
    reference(o['target'], `${path}.target`, 'goal');
    if (typeof o['required'] !== 'boolean') error(`${path}.required`, 'Expected true or false.');
    if (o['required'] === true) required++;
  });
  if (!options.draft && required !== 1) error('objectives', 'Declare exactly one required reach-goal objective.');
  if (!options.draft && [...instances.values()].filter(i => i['type'] === 'goal').length !== 1) error('instances', 'Schema 1 requires exactly one goal instance.');
  unique(list('signals'), 'signals', (s, path) => link(s['source'], s['target'], path));
  const nav = value['navigation'];
  if (!object(nav) || !Array.isArray(nav['nodes']) || !Array.isArray(nav['links']) || nav['nodes'].length > 2000 || nav['links'].length > 4000) error('navigation', 'Expected bounded node/link arrays.');
  else {
    const nodes = unique(nav['nodes'], 'navigation.nodes', (node, path) => {
      const instance = reference(node['instanceId'], `${path}.instanceId`);
      if (instance && !['slab', 'ramp', 'elevator', 'conveyor', 'bridge', 'rotator', 'seesaw', 'fragile'].includes(String(instance['type']))) error(`${path}.instanceId`, 'Navigation nodes require a traversable part.');
      if (!vector(node['position'])) error(`${path}.position`, 'Expected finite coordinates.');
    });
    nav['links'].forEach((l, i) => {
      const path = `navigation.links[${i}]`;
      if (!object(l) || !nodes.has(String(l['from'])) || !nodes.has(String(l['to'])) || !['roll', 'jump', 'elevator'].includes(String(l['traversal'])) || typeof l['bidirectional'] !== 'boolean') error(path, 'Expected existing nodes, roll/jump/elevator traversal and a bidirectional flag.');
    });
  }
  unique(list('cameraZones'), 'cameraZones', (zone, path) => {
    if (zone['mode'] !== undefined && !['speed', 'puzzle', 'vertical', 'arena'].includes(String(zone['mode']))) error(`${path}.mode`, 'Expected speed, puzzle, vertical or arena.');
    if (zone['priority'] !== undefined && (!Number.isSafeInteger(zone['priority']) || Math.abs(Number(zone['priority'])) > 100)) error(`${path}.priority`, 'Expected an integer priority from -100 to 100.');
    if (!vector(zone['center']) || !vector(zone['size']) || Object.values(zone['size']).some(n => n <= 0) || !finite(zone['viewHeight']) || zone['viewHeight'] < 5 || zone['viewHeight'] > 200) error(path, 'Expected center, positive size and view height from 5 to 200.');
  });
  const validation = value['validation'];
  if (!object(validation) || !Array.isArray(validation['intendedRoute']) || !Array.isArray(validation['notes']) || validation['notes'].some(n => !text(n, 1000))) error('validation', 'Expected intendedRoute references and text notes.');
  else for (const id of validation['intendedRoute']) reference(id, 'validation.intendedRoute');
  if (issues.some(i => i.severity === 'error')) return result();

  const graph = signalDocument(value as unknown as LevelDocument);
  for (const issue of validateSignalGraph(graph.nodes, graph.links)) {
    const link=graph.links.find(link=>link.id===issue.linkId);
    const ids=link?[link.source.instanceId,link.target.instanceId]:[...new Set(graph.links.flatMap(link=>[link.source.instanceId,link.target.instanceId]))];
    error(issue.linkId?`signals.${issue.linkId}`:'signals',issue.message,ids[0],ids);
  }
  if (issues.some(i => i.severity === 'error')) return result();

  // Authoring can temporarily lack a goal or floor support. All data shapes,
  // parameter ranges and references above remain mandatory, even for drafts.
  // Runtime load/export/play always use the full validation path.
  if (options.draft) return result();

  // Geometry checks operate on the same resolved dimensions passed to the game.
  const doc = value as unknown as LevelDocument;
  const level = resolveLevel(doc);
  const floors = level.pieces.filter(p => p.kind === 'slab');
  const support = (p: Vec3) => floors.some(f => p.x >= f.x - f.w / 2 + .5 && p.x <= f.x + f.w / 2 - .5 && p.z >= f.z - f.d / 2 + .5 && p.z <= f.z + f.d / 2 - .5 && p.y >= f.y + .45 && p.y <= f.y + 2);
  if (!support(doc.spawn)) error('spawn', 'Place spawn above a floor with at least a marble radius of edge clearance.');
  for (const c of doc.checkpoints) if (!support(c.spawn)) error(`checkpoints.${c.id}.spawn`, 'Checkpoint spawn needs floor support and edge clearance.');
  for (let i = 0; i < level.pieces.length; i++) {
    const p = level.pieces[i]!;
    const id = doc.instances[i]!.id;
    if (isMovingPiece(p)) {
      const bounds = movingBounds(p);
      for (const [otherIndex, other] of level.pieces.entries()) {
        const otherId = doc.instances[otherIndex]!.id;
        if (other.kind === 'wall' && other.y < bounds.maxY + 1 && other.y + other.h > bounds.minY && sweepOverlaps(p, other, .5)) {
          error(`instances.${id}`, `Moving surface sweep lacks marble clearance from wall ${otherId}. Move the wall or shorten the motion.`, id, [id, otherId]);
        }
        if (other.kind === 'slab' && Math.abs(p.y - other.y) < 1e-6 && sweepOverlaps(p, other)) {
          error(`instances.${id}`, `Moving surface crosses coplanar floor ${otherId}; separate the heights or leave the sweep clear to avoid flickering.`, id, [id, otherId]);
        }
      }
    }
    if (['switch','logic','sequence'].includes(p.kind) && 'y' in p && !support({ x:p.x, y:p.y+.6, z:p.z })) error(`instances.${id}`, 'Place circuit controls on reachable supported floor.', id);
    if (p.kind==='pressure' || p.kind==='door') {
      if (!floors.some(f=>Math.abs(f.y-p.y)<.01 && Math.abs(p.x-f.x)+p.w/2<=f.w/2 && Math.abs(p.z-f.z)+p.d/2<=f.d/2)) error(`instances.${id}`, 'Place the full circuit footprint on supported floor.', id);
      if (p.kind==='door') {
        for (const [label,spawn] of [['spawn',doc.spawn],...doc.checkpoints.map(c=>[`checkpoints.${c.id}.spawn`,c.spawn] as const)] as const) {
          if (Math.abs(spawn.x-p.x)<p.w/2+.6 && Math.abs(spawn.z-p.z)<p.d/2+.6 && spawn.y+.5>p.y && spawn.y-.5<p.y+p.h+1.4) error(label, `Keep spawn outside door ${id}'s complete travel.`);
        }
        for (const [otherIndex,other] of level.pieces.entries()) {
          if ((other.kind==='slab' || other.kind==='wall') && Math.abs(other.x-p.x)<(other.w+p.w)/2 && Math.abs(other.z-p.z)<(other.d+p.d)/2 && (other.kind==='wall'?other.y:other.y-(other.thick??1))<p.y+p.h+1.4 && (other.kind==='wall'?other.y+other.h:other.y)>p.y+.01) error(`instances.${id}`, `Door travel intersects ${doc.instances[otherIndex]!.id}. Leave the lift clear.`, id, [id,doc.instances[otherIndex]!.id]);
        }
      }
    }
    if (p.kind==='pushable') {
      const extent=p.size/2+.12;
      if(!floors.some(f=>Math.abs(f.y-p.y)<.01 && Math.abs(p.x-f.x)+extent<=f.w/2 && Math.abs(p.z-f.z)+extent<=f.d/2))error(`instances.${id}`, 'The object home needs full floor support and recall clearance.', id);
      for(const [label,spawn] of [['spawn',doc.spawn],...doc.checkpoints.map(c=>[`checkpoints.${c.id}.spawn`,c.spawn] as const)] as const) {
        if(Math.abs(spawn.x-p.x)<extent+.6 && Math.abs(spawn.z-p.z)<extent+.6 && spawn.y+.5>p.y && spawn.y-.5<p.y+p.size+.24)error(label,`Keep the marble spawn clear of object home ${id}.`);
      }
      for(const [j,other] of level.pieces.entries()) {
        if(j===i)continue;
        const otherId=doc.instances[j]!.id;
        if((other.kind==='wall'||other.kind==='door') && Math.abs(other.x-p.x)<other.w/2+extent && Math.abs(other.z-p.z)<other.d/2+extent && other.y<p.y+p.size+.24 && other.y+other.h+(other.kind==='door'?1.4:0)>p.y)error(`instances.${id}`,`Object home overlaps ${otherId}; recall must have a safe clear volume.`,id,[id,otherId]);
        if(other.kind==='slab' && other.y>p.y+.05 && other.y-(other.thick??1)<p.y+p.size+.24 && Math.abs(other.x-p.x)<other.w/2+extent && Math.abs(other.z-p.z)<other.d/2+extent)error(`instances.${id}`,`Object home is obstructed by floor ${otherId}.`,id,[id,otherId]);
        if(other.kind==='pushable' && j>i && Math.abs(other.x-p.x)<(other.size+p.size)/2+.24 && Math.abs(other.z-p.z)<(other.size+p.size)/2+.24 && Math.abs(other.y-p.y)<Math.max(other.size,p.size)+.24)error(`instances.${id}`,`Object homes overlap: ${otherId}.`,id,[id,otherId]);
      }
    }
    if((p.kind==='pressure'||p.kind==='momentum') && p.match && p.match!=='any' && !level.pieces.some(other=>other.kind==='pushable'&&other.token===p.match))error(`instances.${id}`,`Matching ${p.match} receiver needs an object with the same symbol.`,id);
    if (p.kind === 'bumper' || p.kind==='momentum') {
      if (!floors.some(f => Math.abs(f.y-p.y)<.01 && Math.abs(p.x-f.x)+p.radius<=f.w/2 && Math.abs(p.z-f.z)+p.radius<=f.d/2)) error(`instances.${id}`, `Place the entire ${p.kind==='bumper'?'spring bumper':'momentum receiver'} on supported floor.`, id);
      for (const [label, spawn] of [['spawn', doc.spawn], ...doc.checkpoints.map(c => [`checkpoints.${c.id}.spawn`, c.spawn] as const)] as const) {
        if (Math.hypot(spawn.x-p.x, spawn.z-p.z) < p.radius + 1 && spawn.y > p.y-.5 && spawn.y < p.y+2) error(label, `Keep spawn outside ${p.kind==='bumper'?'bumper':'momentum receiver'} ${id}'s ${p.kind==='bumper'?'spring-contact':'impact'} clearance.`);
      }
    }
    if (p.kind === 'void' && Math.min(p.w, p.d) <= 1) error(`instances.${id}`, 'Void opening must exceed the marble diameter (1).', id);
    if (p.kind === 'void') for (const floor of floors) {
      const overlapX = Math.min(p.x + p.w / 2, floor.x + floor.w / 2) - Math.max(p.x - p.w / 2, floor.x - floor.w / 2);
      const overlapZ = Math.min(p.z + p.d / 2, floor.z + floor.d / 2) - Math.max(p.z - p.d / 2, floor.z - floor.d / 2);
      if (Math.abs(p.y - floor.y) < .1 && overlapX > 1e-6 && overlapZ > 1e-6) error(`instances.${id}`, 'Void markers do not cut holes in solid floors. Partition the surrounding floor to leave this opening clear.', id, [id, doc.instances[level.pieces.indexOf(floor)]!.id]);
    }
    if (p.kind === 'jumppad' && !support({ x: p.targetX, y: p.targetY, z: p.targetZ })) warning(`instances.${id}`, 'Jump target is not above a full-clearance floor; verify the landing with physics.', id);
    if (p.kind === 'wall') for (const [label, spawn] of [['spawn', doc.spawn], ...doc.checkpoints.map(c => [`checkpoints.${c.id}.spawn`, c.spawn] as const)] as const) {
      if (Math.abs(spawn.x - p.x) < p.w / 2 + .5 && Math.abs(spawn.z - p.z) < p.d / 2 + .5 && spawn.y - .5 < p.y + p.h && spawn.y + .5 > p.y) error(label, `Spawn intersects wall ${id}.`);
    }
  }
  for (let i = 0; i < floors.length; i++) for (let j = i + 1; j < floors.length; j++) {
    const a = floors[i]!, b = floors[j]!;
    if (Math.abs(a.y - b.y) < 1e-6 && Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2) > 1e-6 && Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2) > 1e-6) error('instances', 'Coplanar floor overlap would cause flickering; partition the floor footprints.', undefined, [doc.instances[level.pieces.indexOf(a)]!.id, doc.instances[level.pieces.indexOf(b)]!.id]);
  }
  const byId = new Map(doc.instances.map((instance, index) => [instance.id, level.pieces[index]!]));
  const footprint = (p: (typeof level.pieces)[number]) => {
    const width = p.kind === 'ramp' ? (p.dir.endsWith('x') ? p.len : p.w) : 'w' in p ? p.w : 1;
    const depth = p.kind === 'ramp' ? (p.dir.endsWith('z') ? p.len : p.w) : 'd' in p ? p.d : 1;
    return { x: p.x, z: p.z, width, depth };
  };
  for (let i = 1; i < doc.validation.intendedRoute.length; i++) {
    const from = byId.get(doc.validation.intendedRoute[i - 1]!)!, to = byId.get(doc.validation.intendedRoute[i]!)!;
    const a = footprint(from), b = footprint(to);
    if (from.kind === 'jumppad') { a.x = from.targetX; a.z = from.targetZ; a.width = a.depth = 0; }
    const gap = Math.hypot(Math.max(0, Math.abs(a.x - b.x) - (a.width + b.width) / 2), Math.max(0, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2));
    if (gap > .1) error(`validation.intendedRoute[${i}]`, 'Route parts do not connect; include a jump pad or correct the footprints.');
  }
  if (doc.validation.intendedRoute.length === 0) warning('validation.intendedRoute', 'No authored route declared; completion must be verified with a play-test.');
  return result();
}

export class InvalidLevelError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.filter(i => i.severity === 'error').map(i => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'InvalidLevelError';
    this.issues = issues;
  }
}
export function parseLevel(value: unknown): LevelDocument {
  const result = validateLevel(value);
  if (!result.document) throw new InvalidLevelError(result.issues);
  return result.document;
}
