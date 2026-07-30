import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CloudSaveConflictError } from '../server/cloud-save-core.mjs';
import { CloudSaveRepository } from '../server/cloud-save-repository.mjs';

function createSave(revision, savedAt, mapId = 'mossvale-village') {
  return {
    version: 17,
    gameVersion: '0.25.0',
    saveId: 'save-repository-test',
    revision,
    savedAt,
    playTimeMs: revision * 1000,
    player: { mapId, regionId: 'mossvale', x: 10, y: 12, health: 8, maxHealth: 8, magic: 40, maxMagic: 40 },
    inventory: { collectedItems: [], economy: { glints: revision } },
    progress: { defeatedBosses: [] },
  };
}

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
database.exec(`
  CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    emailVerified INTEGER NOT NULL,
    name TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);
database.exec(fs.readFileSync('server/migrations/0001_cloud_saves.sql', 'utf8'));
const insertUser = database.prepare('INSERT INTO "user" VALUES (?, ?, ?, ?, ?, ?)');
insertUser.run('user-a', 'a@example.com', 1, 'Emberveil Player', '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z');
insertUser.run('user-b', 'b@example.com', 1, 'Emberveil Player', '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z');

const repository = new CloudSaveRepository(database);
const firstRequest = {
  slotId: 'manual-1',
  expectedCloudVersion: null,
  decision: 'sync',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  save: createSave(1, '2026-07-30T10:00:00.000Z'),
};
const created = repository.put('user-a', firstRequest);
assert.equal(created.status, 'created');
assert.equal(created.metadata.cloudVersion, 1);
assert.equal(repository.list('user-b').length, 0, 'Cloud saves must be isolated by user.');
assert.equal(repository.get('user-a', 'manual-1').save.revision, 1);

const retried = repository.put('user-a', firstRequest);
assert.deepEqual(retried, created, 'An idempotent retry must return the original result.');
assert.equal(repository.get('user-a', 'manual-1').metadata.cloudVersion, 1);

const updated = repository.put('user-a', {
  ...firstRequest,
  expectedCloudVersion: 1,
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  save: createSave(2, '2026-07-30T10:05:00.000Z', 'whispering-woodland'),
});
assert.equal(updated.metadata.cloudVersion, 2);
assert.equal(repository.get('user-a', 'manual-1').save.player.mapId, 'whispering-woodland');
const backup = database.prepare('SELECT cloud_version, save_revision FROM emberveil_cloud_save_backup WHERE user_id = ? AND slot_id = ?').get('user-a', 'manual-1');
assert.equal(backup.cloud_version, 1);
assert.equal(backup.save_revision, 1);

assert.throws(() => repository.put('user-a', {
  ...firstRequest,
  expectedCloudVersion: 1,
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  save: createSave(3, '2026-07-30T10:10:00.000Z'),
}), (error) => error instanceof CloudSaveConflictError && error.reason === 'cloud-version-changed');
assert.equal(repository.get('user-a', 'manual-1').metadata.cloudVersion, 2, 'A stale write must not mutate the cloud slot.');

assert.throws(() => repository.put('user-a', {
  ...firstRequest,
  expectedCloudVersion: 2,
  idempotencyKey: '44444444-4444-4444-8444-444444444444',
  save: createSave(1, '2026-07-30T09:00:00.000Z'),
}), (error) => error instanceof CloudSaveConflictError && error.reason === 'cloud-is-newer');

const forced = repository.put('user-a', {
  ...firstRequest,
  expectedCloudVersion: 2,
  decision: 'keep-local',
  idempotencyKey: '55555555-5555-4555-8555-555555555555',
  save: createSave(1, '2026-07-30T09:00:00.000Z', 'sunken-quarry'),
});
assert.equal(forced.metadata.cloudVersion, 3);
assert.equal(repository.get('user-a', 'manual-1').save.player.mapId, 'sunken-quarry');

const personalData = repository.exportPersonalData('user-a');
assert.equal(personalData.account.email, 'a@example.com');
assert.equal(personalData.cloudSaves.length, 1);
const exportedText = JSON.stringify(personalData);
assert.equal(exportedText.includes('password'), true, 'The export should explain that password hashes are excluded.');
assert.equal(exportedText.includes('session_token'), false);

database.prepare('DELETE FROM "user" WHERE id = ?').run('user-a');
assert.equal(database.prepare('SELECT COUNT(*) AS count FROM emberveil_cloud_save WHERE user_id = ?').get('user-a').count, 0);
assert.equal(database.prepare('SELECT COUNT(*) AS count FROM emberveil_cloud_save_backup WHERE user_id = ?').get('user-a').count, 0);
assert.equal(database.prepare('SELECT COUNT(*) AS count FROM emberveil_cloud_save_request WHERE user_id = ?').get('user-a').count, 0);

database.close();
console.log('Cloud save repository tests passed: isolation, idempotency, backups, conflicts, export, and deletion cascade.');
