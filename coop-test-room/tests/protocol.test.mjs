import assert from 'node:assert/strict';
import {
  COOP_MAX_PACKET_BYTES,
  normalizeInviteCode,
  parseClientPacket,
  sanitizeDisplayName,
} from '../server/protocol.mjs';

function packet(type, payload, extra = {}) {
  return JSON.stringify({ v: 1, type, payload, ...extra });
}

const playerId = '123e4567-e89b-12d3-a456-426614174000';
const reconnectToken = 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-';

const validPackets = [
  packet('hello', { operation: 'create', displayName: 'Rowan', clientVersion: '0.24.0' }),
  packet('hello', { operation: 'join', displayName: 'Mara', inviteCode: 'ABC234', clientVersion: '0.24.0' }),
  packet('hello', { operation: 'reconnect', inviteCode: 'ABC234', playerId, reconnectToken, clientVersion: '0.24.0' }),
  packet('input', { seq: 1, dt: 50, moveX: 0.7, moveY: -0.7, facing: 'up' }),
  packet('attack', { clientAttackId: 'attack:1', kind: 'melee', aimX: 1, aimY: 0 }),
  packet('interact', { targetId: 'shared-switch' }),
  packet('revive', { targetPlayerId: playerId, active: true }),
  packet('ping-marker', { x: 80, y: 90, kind: 'danger' }),
  packet('emote', { emote: 'thanks' }),
  packet('cutscene-ready', { sequenceId: 'coop-test-opening', step: 0 }),
  packet('pong', { nonce: 'abcdefgh1234', clientTime: 1000 }),
  packet('resync', {}),
];
for (const raw of validPackets) assert.equal(parseClientPacket(raw).ok, true, `expected valid packet: ${raw}`);

const invalidPackets = [
  '[]',
  'null',
  '{bad json',
  JSON.stringify({ v: 2, type: 'resync', payload: {} }),
  JSON.stringify({ v: 1, type: 'damage', payload: { amount: 999 } }),
  packet('attack', { clientAttackId: 'attack:2', kind: 'melee', aimX: 1, aimY: 0, damage: 999 }),
  packet('interact', { targetId: 'major-reward', currency: 9999 }),
  packet('input', { seq: 2, dt: 5000, moveX: 1, moveY: 0, facing: 'right' }),
  packet('input', { seq: 3, dt: 50, moveX: 1, moveY: 1, facing: 'right' }),
  packet('input', { seq: 4, dt: 50, moveX: 1e999, moveY: 0, facing: 'right' }),
  packet('ping-marker', { x: -1, y: 90, kind: 'look' }),
  packet('emote', { emote: 'execute-script' }),
  packet('resync', { unexpected: true }),
  packet('hello', { operation: 'create', displayName: 'Rowan', clientVersion: '0.24.0', admin: true }),
  JSON.stringify({ v: 1, type: 'resync', payload: {}, unexpectedEnvelopeField: true }),
];
for (const raw of invalidPackets) assert.equal(parseClientPacket(raw).ok, false, `expected invalid packet: ${raw}`);

const oversized = JSON.stringify({
  v: 1,
  type: 'hello',
  payload: { operation: 'create', displayName: 'Rowan', clientVersion: 'x'.repeat(COOP_MAX_PACKET_BYTES) },
});
assert.equal(parseClientPacket(oversized).ok, false, 'oversized packets must be rejected before gameplay handling');

assert.equal(normalizeInviteCode(' ab-i0o234 '), 'ABI0O2', 'invite code normalization is deterministic');
assert.equal(
  sanitizeDisplayName('  Rowan\u0000   Vale  '),
  'Rowan Vale',
  'display names should be normalized and stripped of control characters',
);
assert.equal(sanitizeDisplayName('\u0000\u0001'), 'Warden', 'empty sanitized names receive a safe fallback');

console.log('Network protocol tests passed: every client message type, malformed packets, extra fields, and packet limits.');
