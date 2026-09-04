import sightlineData from './levels/sightlines.json' with { type: 'json' };
import gripData from './levels/grip-lab.json' with { type: 'json' };
import legacyData from './levels/legacy.json' with { type: 'json' };
import relayData from './levels/relay.json' with { type: 'json' };
import { parseLevel } from './validateLevel.ts';
import type { LevelDocument, Vec3 } from './LevelDocument.ts';

export interface WorldCatalogue {
  schemaVersion: 1;
  contentVersion: number;
  id: string;
  regions: Array<{
    id: string;
    name: string;
    themeId: string;
    musicId: string;
    levelIds: string[];
    unlockAfter: string[];
    guideLocations: Vec3[];
  }>;
  levels: Array<{ id: string; name: string; description: string; regionId: string }>;
}

export const CATALOGUE: WorldCatalogue = {
  schemaVersion: 1, contentVersion: 1, id: 'retro-ball',
  regions: [{ id: 'prototype', name: 'The Relay', themeId: 'neon-grid', musicId: 'retro-main', levelIds: ['legacy', 'relay', 'grip-lab', 'sightlines'], unlockAfter: [], guideLocations: [] }],
  levels: [
    { id: 'legacy', name: 'The Original Circuit', description: 'The full neon obstacle course. Lasers, leaps and light elevators.', regionId: 'prototype' },
    { id: 'relay', name: 'Relay / 01', description: 'A short warm-up: bank a checkpoint, climb the ramp and reach the signal.', regionId: 'prototype' },
    { id: 'grip-lab', name: 'Grip Lab', description: 'Learn braking on grid, ice, rubber and rough ground.', regionId: 'prototype' },
    { id: 'sightlines', name: 'Sightlines', description: 'Climb, leap and keep your bearings behind tall scenery.', regionId: 'prototype' },
  ],
};
const documents: Record<string, unknown> = { legacy: legacyData, relay: relayData, 'grip-lab': gripData, sightlines: sightlineData };

/** Catalogue resolution returns a fresh, validated document owned by the caller. */
export function loadLevelDocument(id: string): LevelDocument {
  const entry = CATALOGUE.levels.find(level => level.id === id);
  if (!entry || !Object.hasOwn(documents, id)) throw new Error(`Unknown course "${id}". Return to the relay and choose an available course.`);
  const document = parseLevel(documents[id]);
  if (document.id !== entry.id) throw new Error(`Catalogue entry ${entry.id} resolves to a different level ID.`);
  return document;
}

export function validateCatalogue(catalogue: WorldCatalogue): string[] {
  const errors: string[] = [];
  if (catalogue.schemaVersion !== 1 || !Number.isSafeInteger(catalogue.contentVersion) || catalogue.contentVersion < 1) errors.push('Unsupported catalogue version.');
  const levelIds = new Set(catalogue.levels.map(l => l.id));
  const regions = new Set(catalogue.regions.map(r => r.id));
  if (levelIds.size !== catalogue.levels.length) errors.push('Duplicate level ID.');
  if (regions.size !== catalogue.regions.length) errors.push('Duplicate region ID.');
  for (const region of catalogue.regions) {
    if (region.themeId !== 'neon-grid' || region.musicId !== 'retro-main') errors.push(`Region ${region.id} references unavailable presentation assets.`);
    for (const id of [...region.levelIds, ...region.unlockAfter]) if (!levelIds.has(id)) errors.push(`Region ${region.id} references unknown level ${id}.`);
  }
  for (const level of catalogue.levels) {
    const region = catalogue.regions.find(r => r.id === level.regionId);
    if (!region || !region.levelIds.includes(level.id)) errors.push(`Level ${level.id} is not listed by its region.`);
  }
  return errors;
}
