import assert from 'node:assert/strict';
import {
  CloudSaveConflictError,
  decideCloudWrite,
  isCloudSlotId,
  publicCloudMetadata,
  summarizeSave,
  validateCloudSave,
} from '../server/cloud-save-core.mjs';

function save(overrides = {}) {
  return {
    version: 17,
    gameVersion: '0.25.0',
    saveId: 'save-12345678',
    revision: 10,
    savedAt: '2026-07-30T18:00:00.000Z',
    playTimeMs: 3600000,
    player: { mapId: 'mossvale-village', regionId: 'mossvale', x: 10, y: 12, health: 8, maxHealth: 8, magic: 40, maxMagic: 40 },
    inventory: { collectedItems: [], economy: { glints: 30 } },
    progress: { defeatedBosses: [] },
    ...overrides,
  };
}

function record(source = save(), cloudVersion = 2, checksum = 'cloud-hash') {
  const summary = summarizeSave(source);
  return {
    userId: 'user-a',
    slotId: 'manual-1',
    cloudVersion,
    ...summary,
    checksum,
    payloadJson: JSON.stringify(source),
    lastDecision: 'sync',
    createdAt: '2026-07-30T18:00:01.000Z',
    updatedAt: '2026-07-30T18:00:01.000Z',
  };
}

assert.equal(isCloudSlotId('autosave'), true);
assert.equal(isCloudSlotId('manual-3'), true);
assert.equal(isCloudSlotId('manual-4'), false);
assert.deepEqual(validateCloudSave(save()), { valid: true, errors: [] });
assert.equal(validateCloudSave({}).valid, false);

const createDecision = decideCloudWrite(null, {
  slotId: 'manual-1', expectedCloudVersion: null, decision: 'sync', checksum: 'new', save: save(),
});
assert.deepEqual(createDecision, { cloudVersion: 1, replace: false, noChange: false });

const current = record();
const updateDecision = decideCloudWrite(current, {
  slotId: 'manual-1', expectedCloudVersion: 2, decision: 'sync', checksum: 'new',
  save: save({ revision: 11, savedAt: '2026-07-30T18:05:00.000Z' }),
});
assert.equal(updateDecision.cloudVersion, 3);
assert.equal(updateDecision.replace, true);

const unchanged = decideCloudWrite(current, {
  slotId: 'manual-1', expectedCloudVersion: 2, decision: 'sync', checksum: current.checksum, save: save(),
});
assert.equal(unchanged.noChange, true);
assert.equal(unchanged.cloudVersion, 2);

assert.throws(() => decideCloudWrite(current, {
  slotId: 'manual-1', expectedCloudVersion: 1, decision: 'sync', checksum: 'new', save: save(),
}), (error) => error instanceof CloudSaveConflictError && error.reason === 'cloud-version-changed');

assert.throws(() => decideCloudWrite(current, {
  slotId: 'manual-1', expectedCloudVersion: 2, decision: 'sync', checksum: 'new',
  save: save({ revision: 8, savedAt: '2026-07-30T17:00:00.000Z' }),
}), (error) => error instanceof CloudSaveConflictError && error.reason === 'cloud-is-newer');

assert.throws(() => decideCloudWrite(current, {
  slotId: 'manual-1', expectedCloudVersion: 2, decision: 'sync', checksum: 'different', save: save(),
}), (error) => error instanceof CloudSaveConflictError && error.reason === 'save-diverged');

const explicitOverride = decideCloudWrite(current, {
  slotId: 'manual-1', expectedCloudVersion: 2, decision: 'keep-local', checksum: 'new',
  save: save({ revision: 8, savedAt: '2026-07-30T17:00:00.000Z' }),
});
assert.equal(explicitOverride.cloudVersion, 3);

const metadata = publicCloudMetadata(current);
assert.equal(metadata.cloudVersion, 2);
assert.equal('payloadJson' in metadata, false);
assert.equal('userId' in metadata, false);

console.log('Cloud save conflict and validation tests passed.');
