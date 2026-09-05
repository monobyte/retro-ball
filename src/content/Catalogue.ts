import worksData from './levels/relay-works.json' with { type: 'json' };
import symbolData from './levels/symbol-yard.json' with { type: 'json' };
import impulseData from './levels/impulse-vault.json' with { type: 'json' };
import twoFactorData from './levels/two-factor.json' with { type: 'json' };
import orderedData from './levels/ordered-garden.json' with { type: 'json' };
import signalData from './levels/signal-crossing.json' with { type: 'json' };
import borrowedData from './levels/borrowed-time.json' with { type: 'json' };
import balanceData from './levels/balance-act.json' with { type: 'json' };
import springData from './levels/spring-yard.json' with { type: 'json' };
import conveyorData from './levels/conveyor-run.json' with { type: 'json' };
import shuttleData from './levels/shuttle-bay.json' with { type: 'json' };
import spinData from './levels/spin-crossing.json' with { type: 'json' };
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
  regions: [{ id: 'prototype', name: 'The Relay', themeId: 'neon-grid', musicId: 'retro-main', levelIds: ['legacy', 'relay', 'grip-lab', 'sightlines', 'conveyor-run', 'shuttle-bay', 'spin-crossing', 'spring-yard', 'balance-act', 'borrowed-time', 'signal-crossing', 'two-factor', 'ordered-garden', 'symbol-yard', 'impulse-vault', 'relay-works'], unlockAfter: [], guideLocations: [] }],
  levels: [
    { id: 'relay-works', name: 'Relay Works', description: 'Four moving surfaces. One continuous journey.', regionId: 'prototype' },
    { id: 'symbol-yard', name: 'Symbol Yard', description: 'Match two shapes. Park their weight. Recall what gets lost.', regionId: 'prototype' },
    { id: 'impulse-vault', name: 'Impulse Vault', description: 'A door that listens to momentum.', regionId: 'prototype' },
    { id: 'two-factor', name: 'Two Factor', description: 'Arm the circuit. Borrow eight seconds of permission.', regionId: 'prototype' },
    { id: 'ordered-garden', name: 'Ordered Garden', description: 'Three answers. One order. The garden remembers.', regionId: 'prototype' },
    { id: 'legacy', name: 'The Original Circuit', description: 'The full neon obstacle course. Lasers, leaps and light elevators.', regionId: 'prototype' },
    { id: 'relay', name: 'Relay / 01', description: 'A short warm-up: bank a checkpoint, climb the ramp and reach the signal.', regionId: 'prototype' },
    { id: 'grip-lab', name: 'Grip Lab', description: 'Learn braking on grid, ice, rubber and rough ground.', regionId: 'prototype' },
    { id: 'sightlines', name: 'Sightlines', description: 'Climb, leap and keep your bearings behind tall scenery.', regionId: 'prototype' },
    { id: 'conveyor-run', name: 'Conveyor Run', description: 'Steer with and against the flow.', regionId: 'prototype' },
    { id: 'shuttle-bay', name: 'Shuttle Bay', description: 'Board, brake to ride, then step off at the far dock.', regionId: 'prototype' },
    { id: 'spin-crossing', name: 'Spin Crossing', description: 'Hold your place as the world turns beneath you.', regionId: 'prototype' },
    { id: 'spring-yard', name: 'Spring Yard', description: 'Charge a spring and ride the rebound.', regionId: 'prototype' },
    { id: 'balance-act', name: 'Balance Act', description: 'Your weight shifts the world beneath you.', regionId: 'prototype' },
    { id: 'borrowed-time', name: 'Borrowed Time', description: 'Watch the countdown. Everything returns.', regionId: 'prototype' },
    { id: 'signal-crossing', name: 'Signal Crossing', description: 'Cut the power. Save the circuit state.', regionId: 'prototype' },
  ],
};
const documents: Record<string, unknown> = { 'relay-works': worksData, 'symbol-yard': symbolData, 'impulse-vault': impulseData, 'two-factor': twoFactorData, 'ordered-garden': orderedData, 'signal-crossing': signalData, 'borrowed-time': borrowedData, 'balance-act': balanceData, 'spring-yard': springData, 'conveyor-run': conveyorData, 'shuttle-bay': shuttleData, 'spin-crossing': spinData, legacy: legacyData, relay: relayData, 'grip-lab': gripData, sightlines: sightlineData };

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
