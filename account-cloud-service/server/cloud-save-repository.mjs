import { createHash } from 'node:crypto';
import {
  CloudSaveConflictError,
  decideCloudWrite,
  publicCloudMetadata,
  summarizeSave,
  validateCloudSave,
} from './cloud-save-core.mjs';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    slotId: row.slot_id,
    cloudVersion: row.cloud_version,
    saveId: row.save_id,
    saveRevision: row.save_revision,
    saveSavedAt: row.save_saved_at,
    gameVersion: row.game_version,
    mapId: row.map_id,
    regionId: row.region_id,
    playTimeMs: row.play_time_ms,
    checksum: row.checksum,
    payloadJson: row.payload_json,
    lastDecision: row.last_decision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CloudSaveRepository {
  constructor(database) {
    this.database = database;
    this.selectOne = database.prepare('SELECT * FROM emberveil_cloud_save WHERE user_id = ? AND slot_id = ?');
    this.selectAll = database.prepare('SELECT * FROM emberveil_cloud_save WHERE user_id = ? ORDER BY slot_id');
    this.selectRequest = database.prepare('SELECT response_json FROM emberveil_cloud_save_request WHERE user_id = ? AND request_id = ?');
    this.insertCurrent = database.prepare(`
      INSERT INTO emberveil_cloud_save (
        user_id, slot_id, cloud_version, save_id, save_revision, save_saved_at,
        game_version, map_id, region_id, play_time_ms, checksum, payload_json,
        last_decision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.updateCurrent = database.prepare(`
      UPDATE emberveil_cloud_save SET
        cloud_version = ?, save_id = ?, save_revision = ?, save_saved_at = ?,
        game_version = ?, map_id = ?, region_id = ?, play_time_ms = ?, checksum = ?,
        payload_json = ?, last_decision = ?, updated_at = ?
      WHERE user_id = ? AND slot_id = ? AND cloud_version = ?
    `);
    this.replaceBackup = database.prepare(`
      INSERT INTO emberveil_cloud_save_backup (
        user_id, slot_id, cloud_version, save_id, save_revision, save_saved_at,
        game_version, map_id, region_id, play_time_ms, checksum, payload_json,
        last_decision, created_at, updated_at, backed_up_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, slot_id) DO UPDATE SET
        cloud_version=excluded.cloud_version, save_id=excluded.save_id,
        save_revision=excluded.save_revision, save_saved_at=excluded.save_saved_at,
        game_version=excluded.game_version, map_id=excluded.map_id,
        region_id=excluded.region_id, play_time_ms=excluded.play_time_ms,
        checksum=excluded.checksum, payload_json=excluded.payload_json,
        last_decision=excluded.last_decision, created_at=excluded.created_at,
        updated_at=excluded.updated_at, backed_up_at=excluded.backed_up_at
    `);
    this.insertRequest = database.prepare(`
      INSERT INTO emberveil_cloud_save_request
        (user_id, request_id, slot_id, result_cloud_version, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.selectUser = database.prepare('SELECT id, email, emailVerified, name, createdAt, updatedAt FROM "user" WHERE id = ?');
  }

  list(userId) {
    return this.selectAll.all(userId).map((row) => publicCloudMetadata(rowToRecord(row)));
  }

  get(userId, slotId) {
    const record = rowToRecord(this.selectOne.get(userId, slotId));
    if (!record) return null;
    return { metadata: publicCloudMetadata(record), save: JSON.parse(record.payloadJson) };
  }

  put(userId, request) {
    const validation = validateCloudSave(request.save);
    if (!validation.valid) {
      const error = new TypeError(validation.errors.join(' '));
      error.validationErrors = validation.errors;
      throw error;
    }
    const payloadJson = JSON.stringify(request.save);
    const checksum = sha256(payloadJson);
    const existingRequest = this.selectRequest.get(userId, request.idempotencyKey);
    if (existingRequest) return JSON.parse(existingRequest.response_json);

    this.database.exec('BEGIN IMMEDIATE');
    try {
      const current = rowToRecord(this.selectOne.get(userId, request.slotId));
      const decision = decideCloudWrite(current, { ...request, checksum });
      if (decision.noChange && current) {
        const response = { status: 'unchanged', metadata: publicCloudMetadata(current) };
        this.insertRequest.run(userId, request.idempotencyKey, request.slotId, current.cloudVersion, JSON.stringify(response), new Date().toISOString());
        this.database.exec('COMMIT');
        return response;
      }

      const now = new Date().toISOString();
      const summary = summarizeSave(request.save);
      if (!current) {
        this.insertCurrent.run(
          userId,
          request.slotId,
          decision.cloudVersion,
          summary.saveId,
          summary.saveRevision,
          summary.saveSavedAt,
          summary.gameVersion,
          summary.mapId,
          summary.regionId,
          summary.playTimeMs,
          checksum,
          payloadJson,
          request.decision,
          now,
          now,
        );
      } else {
        this.replaceBackup.run(
          current.userId,
          current.slotId,
          current.cloudVersion,
          current.saveId,
          current.saveRevision,
          current.saveSavedAt,
          current.gameVersion,
          current.mapId,
          current.regionId,
          current.playTimeMs,
          current.checksum,
          current.payloadJson,
          current.lastDecision,
          current.createdAt,
          current.updatedAt,
          now,
        );
        const result = this.updateCurrent.run(
          decision.cloudVersion,
          summary.saveId,
          summary.saveRevision,
          summary.saveSavedAt,
          summary.gameVersion,
          summary.mapId,
          summary.regionId,
          summary.playTimeMs,
          checksum,
          payloadJson,
          request.decision,
          now,
          userId,
          request.slotId,
          current.cloudVersion,
        );
        if (result.changes !== 1) {
          throw new CloudSaveConflictError('cloud-version-changed', publicCloudMetadata(rowToRecord(this.selectOne.get(userId, request.slotId))));
        }
      }

      const updated = rowToRecord(this.selectOne.get(userId, request.slotId));
      const response = { status: current ? 'updated' : 'created', metadata: publicCloudMetadata(updated) };
      this.insertRequest.run(userId, request.idempotencyKey, request.slotId, decision.cloudVersion, JSON.stringify(response), now);
      this.database.exec('COMMIT');
      return response;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  exportPersonalData(userId) {
    const account = this.selectUser.get(userId);
    if (!account) return null;
    return {
      format: 'emberveil-personal-data-export',
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      account: {
        id: account.id,
        email: account.email,
        emailVerified: Boolean(account.emailVerified),
        displayLabel: account.name,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
      cloudSaves: this.selectAll.all(userId).map((row) => {
        const record = rowToRecord(row);
        return { metadata: publicCloudMetadata(record), save: JSON.parse(record.payloadJson) };
      }),
      excluded: ['password hashes', 'sessions', 'verification tokens', 'IP addresses', 'user agents'],
    };
  }
}
