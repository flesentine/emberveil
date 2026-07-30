import type { SaveData } from '../../src/save/SaveData';
import type { SaveSlotId } from '../../src/save/SaveService';

export interface AccountSessionUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayLabel: string;
}

export interface AccountSession {
  readonly user: AccountSessionUser;
  readonly sessionExpiresAt: string;
}

export interface CloudSaveMetadata {
  readonly slotId: SaveSlotId;
  readonly cloudVersion: number;
  readonly saveId: string;
  readonly saveRevision: number;
  readonly saveSavedAt: string;
  readonly gameVersion: string;
  readonly mapId: string;
  readonly regionId: string;
  readonly playTimeMs: number;
  readonly checksum: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CloudSaveDownload {
  readonly metadata: CloudSaveMetadata;
  readonly save: SaveData;
}

export type CloudSaveDecision = 'sync' | 'keep-local';

export interface CloudSaveConflict {
  readonly code: 'CLOUD_SAVE_CONFLICT';
  readonly reason: string;
  readonly cloud: CloudSaveMetadata | null;
  readonly error: string;
}
