export const CLOUD_SLOT_IDS = Object.freeze(['autosave', 'manual-1', 'manual-2', 'manual-3']);
export const MAX_CLOUD_SAVE_BYTES = 512 * 1024;

export class CloudSaveConflictError extends Error {
  constructor(reason, current) {
    super('The cloud save changed and requires a player choice.');
    this.name = 'CloudSaveConflictError';
    this.reason = reason;
    this.current = current;
  }
}

export function isCloudSlotId(value) {
  return typeof value === 'string' && CLOUD_SLOT_IDS.includes(value);
}

export function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateCloudSave(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['Save must be an object.'] };
  const save = value;
  if (!Number.isInteger(save.version) || save.version < 1 || save.version > 1000) errors.push('Save schema version is invalid.');
  if (typeof save.gameVersion !== 'string' || save.gameVersion.length < 1 || save.gameVersion.length > 32) errors.push('Game version is invalid.');
  if (typeof save.saveId !== 'string' || save.saveId.length < 8 || save.saveId.length > 128) errors.push('Save identity is invalid.');
  if (!Number.isInteger(save.revision) || save.revision < 0) errors.push('Save revision is invalid.');
  if (!isIsoDate(save.savedAt)) errors.push('Save timestamp is invalid.');
  if (!save.player || typeof save.player !== 'object') errors.push('Player state is missing.');
  else {
    if (typeof save.player.mapId !== 'string' || save.player.mapId.length < 1 || save.player.mapId.length > 128) errors.push('Map identifier is invalid.');
    if (typeof save.player.regionId !== 'string' || save.player.regionId.length < 1 || save.player.regionId.length > 128) errors.push('Region identifier is invalid.');
    const numeric = ['x', 'y', 'health', 'maxHealth', 'magic', 'maxMagic'];
    if (!numeric.every((key) => Number.isFinite(save.player[key]))) errors.push('Player numeric state is invalid.');
  }
  if (!save.inventory || typeof save.inventory !== 'object') errors.push('Inventory state is missing.');
  if (!save.progress || typeof save.progress !== 'object') errors.push('Progress indexes are missing.');
  if (!Number.isFinite(save.playTimeMs) || save.playTimeMs < 0) errors.push('Playtime is invalid.');
  let serialized = '';
  try {
    serialized = JSON.stringify(save);
  } catch {
    errors.push('Save cannot be serialized.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CLOUD_SAVE_BYTES) errors.push('Save exceeds the cloud size limit.');
  return { valid: errors.length === 0, errors };
}

export function summarizeSave(save) {
  return Object.freeze({
    saveId: save.saveId,
    saveRevision: save.revision,
    saveSavedAt: save.savedAt,
    gameVersion: save.gameVersion,
    mapId: save.player.mapId,
    regionId: save.player.regionId,
    playTimeMs: Math.max(0, Math.floor(save.playTimeMs)),
  });
}

export function publicCloudMetadata(record) {
  if (!record) return null;
  return {
    slotId: record.slotId,
    cloudVersion: record.cloudVersion,
    saveId: record.saveId,
    saveRevision: record.saveRevision,
    saveSavedAt: record.saveSavedAt,
    gameVersion: record.gameVersion,
    mapId: record.mapId,
    regionId: record.regionId,
    playTimeMs: record.playTimeMs,
    checksum: record.checksum,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function compareSaveFreshness(incoming, current) {
  const incomingTime = Date.parse(incoming.savedAt);
  const currentTime = Date.parse(current.saveSavedAt);
  if (incomingTime !== currentTime) return incomingTime > currentTime ? 1 : -1;
  if (incoming.revision !== current.saveRevision) return incoming.revision > current.saveRevision ? 1 : -1;
  return 0;
}

export function decideCloudWrite(current, request) {
  if (!isCloudSlotId(request.slotId)) throw new TypeError('Unknown cloud save slot.');
  if (request.decision !== 'sync' && request.decision !== 'keep-local') throw new TypeError('Unknown cloud save decision.');
  if (!current) {
    if (request.expectedCloudVersion !== null) throw new CloudSaveConflictError('slot-created-elsewhere', null);
    return { cloudVersion: 1, replace: false, noChange: false };
  }
  if (request.expectedCloudVersion !== current.cloudVersion) throw new CloudSaveConflictError('cloud-version-changed', publicCloudMetadata(current));
  if (request.checksum === current.checksum) return { cloudVersion: current.cloudVersion, replace: false, noChange: true };
  if (request.decision === 'sync') {
    const freshness = compareSaveFreshness(request.save, current);
    if (freshness < 0) throw new CloudSaveConflictError('cloud-is-newer', publicCloudMetadata(current));
    if (freshness === 0) throw new CloudSaveConflictError('save-diverged', publicCloudMetadata(current));
  }
  return { cloudVersion: current.cloudVersion + 1, replace: true, noChange: false };
}
