import { z } from 'zod';
import { CLOUD_SLOT_IDS } from './cloud-save-core.mjs';

const isoDate = z.string().datetime({ offset: true });
const saveSchema = z
  .object({
    version: z.number().int().positive().max(1000),
    gameVersion: z.string().min(1).max(32),
    saveId: z.string().min(8).max(128),
    revision: z.number().int().nonnegative(),
    savedAt: isoDate,
    playTimeMs: z.number().finite().nonnegative(),
    player: z
      .object({
        mapId: z.string().min(1).max(128),
        regionId: z.string().min(1).max(128),
        x: z.number().finite(),
        y: z.number().finite(),
        health: z.number().finite().nonnegative(),
        maxHealth: z.number().finite().positive(),
        magic: z.number().finite().nonnegative(),
        maxMagic: z.number().finite().nonnegative(),
      })
      .passthrough(),
    inventory: z.record(z.string(), z.unknown()),
    progress: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const uploadSchema = z.object({
  expectedCloudVersion: z.number().int().positive().nullable(),
  decision: z.enum(['sync', 'keep-local']),
  idempotencyKey: z.string().uuid(),
  save: saveSchema,
});

export const slotParamSchema = z.object({
  slotId: z.enum(CLOUD_SLOT_IDS),
});

export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const error = new TypeError('Request validation failed.');
  error.validationErrors = result.error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`);
  throw error;
}
