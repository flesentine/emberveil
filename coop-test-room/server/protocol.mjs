export const COOP_PROTOCOL_VERSION = 1;
export const COOP_MAX_PACKET_BYTES = 8 * 1024;
export const COOP_MAX_PLAYERS = 2;
export const COOP_ROOM_CODE_LENGTH = 6;
export const COOP_RECONNECT_GRACE_MS = 30_000;
export const COOP_ROOM_IDLE_MS = 60_000;
export const COOP_TICK_RATE = 20;
export const COOP_SNAPSHOT_RATE = 10;
export const COOP_WORLD_WIDTH = 320;
export const COOP_WORLD_HEIGHT = 180;
export const COOP_PLAYER_SPEED = 72;
export const COOP_INPUT_STEP_MS = 50;

export const COOP_EMOTES = Object.freeze(['wave', 'cheer', 'help', 'thanks']);
export const COOP_PING_KINDS = Object.freeze(['look', 'danger', 'help']);
export const COOP_ATTACK_KINDS = Object.freeze(['melee', 'bolt']);

const CLIENT_MESSAGE_TYPES = new Set([
  'hello',
  'input',
  'attack',
  'interact',
  'revive',
  'ping-marker',
  'emote',
  'cutscene-ready',
  'pong',
  'resync',
]);

const RATE_LIMITS = Object.freeze({
  hello: { count: 2, windowMs: 10_000 },
  input: { count: 30, windowMs: 1_000 },
  attack: { count: 8, windowMs: 1_000 },
  interact: { count: 10, windowMs: 1_000 },
  revive: { count: 15, windowMs: 1_000 },
  'ping-marker': { count: 2, windowMs: 1_000 },
  emote: { count: 3, windowMs: 5_000 },
  'cutscene-ready': { count: 4, windowMs: 10_000 },
  pong: { count: 2, windowMs: 1_000 },
  resync: { count: 2, windowMs: 5_000 },
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function finiteNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function boundedString(value, minLength, maxLength, pattern = null) {
  if (typeof value !== 'string' || value.length < minLength || value.length > maxLength) return false;
  return pattern ? pattern.test(value) : true;
}

function optionalMessageId(value) {
  return value === undefined || boundedString(value, 1, 64, /^[A-Za-z0-9:_-]+$/);
}

function validateHello(payload) {
  if (!isRecord(payload)) return false;
  if (!boundedString(payload.operation, 4, 9) || !['create', 'join', 'reconnect'].includes(payload.operation)) return false;
  if (!boundedString(payload.clientVersion, 1, 32, /^[A-Za-z0-9._-]+$/)) return false;
  if (payload.operation === 'create') {
    return hasOnlyKeys(payload, new Set(['operation', 'displayName', 'clientVersion']))
      && boundedString(payload.displayName, 1, 16);
  }
  if (payload.operation === 'join') {
    return hasOnlyKeys(payload, new Set(['operation', 'displayName', 'inviteCode', 'clientVersion']))
      && boundedString(payload.displayName, 1, 16)
      && boundedString(payload.inviteCode, COOP_ROOM_CODE_LENGTH, COOP_ROOM_CODE_LENGTH, /^[A-Za-z0-9]+$/);
  }
  return hasOnlyKeys(payload, new Set(['operation', 'inviteCode', 'playerId', 'reconnectToken', 'clientVersion']))
    && boundedString(payload.inviteCode, COOP_ROOM_CODE_LENGTH, COOP_ROOM_CODE_LENGTH, /^[A-Za-z0-9]+$/)
    && boundedString(payload.playerId, 8, 64, /^[A-Za-z0-9-]+$/)
    && boundedString(payload.reconnectToken, 32, 128, /^[A-Za-z0-9_-]+$/);
}

function validateInput(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['seq', 'dt', 'moveX', 'moveY', 'facing']))
    && integer(payload.seq, 0, Number.MAX_SAFE_INTEGER)
    && integer(payload.dt, 1, COOP_INPUT_STEP_MS)
    && finiteNumber(payload.moveX, -1, 1)
    && finiteNumber(payload.moveY, -1, 1)
    && ['up', 'down', 'left', 'right'].includes(payload.facing)
    && Math.hypot(payload.moveX, payload.moveY) <= 1.05;
}

function validateAttack(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['clientAttackId', 'kind', 'aimX', 'aimY']))
    && boundedString(payload.clientAttackId, 1, 64, /^[A-Za-z0-9:_-]+$/)
    && COOP_ATTACK_KINDS.includes(payload.kind)
    && finiteNumber(payload.aimX, -1, 1)
    && finiteNumber(payload.aimY, -1, 1)
    && Math.hypot(payload.aimX, payload.aimY) >= 0.5
    && Math.hypot(payload.aimX, payload.aimY) <= 1.05;
}

function validateInteract(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['targetId']))
    && boundedString(payload.targetId, 1, 48, /^[A-Za-z0-9:_-]+$/);
}

function validateRevive(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['targetPlayerId', 'active']))
    && boundedString(payload.targetPlayerId, 8, 64, /^[A-Za-z0-9-]+$/)
    && typeof payload.active === 'boolean';
}

function validatePing(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['x', 'y', 'kind']))
    && finiteNumber(payload.x, 0, COOP_WORLD_WIDTH)
    && finiteNumber(payload.y, 0, COOP_WORLD_HEIGHT)
    && COOP_PING_KINDS.includes(payload.kind);
}

function validateEmote(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['emote']))
    && COOP_EMOTES.includes(payload.emote);
}

function validateCutsceneReady(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['sequenceId', 'step']))
    && boundedString(payload.sequenceId, 1, 48, /^[A-Za-z0-9:_-]+$/)
    && integer(payload.step, 0, 999);
}

function validatePong(payload) {
  return isRecord(payload)
    && hasOnlyKeys(payload, new Set(['nonce', 'clientTime']))
    && boundedString(payload.nonce, 8, 64, /^[A-Za-z0-9_-]+$/)
    && finiteNumber(payload.clientTime, 0, Number.MAX_SAFE_INTEGER);
}

function validateEmpty(payload) {
  return isRecord(payload) && Object.keys(payload).length === 0;
}

const PAYLOAD_VALIDATORS = Object.freeze({
  hello: validateHello,
  input: validateInput,
  attack: validateAttack,
  interact: validateInteract,
  revive: validateRevive,
  'ping-marker': validatePing,
  emote: validateEmote,
  'cutscene-ready': validateCutsceneReady,
  pong: validatePong,
  resync: validateEmpty,
});

export function parseClientPacket(raw) {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  if (Buffer.byteLength(text, 'utf8') > COOP_MAX_PACKET_BYTES) {
    return { ok: false, code: 'packet-too-large' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: 'malformed-json' };
  }

  if (!isRecord(parsed) || !hasOnlyKeys(parsed, new Set(['v', 'type', 'id', 'payload']))) {
    return { ok: false, code: 'invalid-envelope' };
  }
  if (parsed.v !== COOP_PROTOCOL_VERSION) return { ok: false, code: 'protocol-mismatch' };
  if (typeof parsed.type !== 'string' || !CLIENT_MESSAGE_TYPES.has(parsed.type)) {
    return { ok: false, code: 'unknown-message' };
  }
  if (!optionalMessageId(parsed.id)) return { ok: false, code: 'invalid-message-id' };
  const validator = PAYLOAD_VALIDATORS[parsed.type];
  if (!validator || !validator(parsed.payload)) return { ok: false, code: 'invalid-payload' };

  return {
    ok: true,
    message: {
      v: COOP_PROTOCOL_VERSION,
      type: parsed.type,
      ...(parsed.id ? { id: parsed.id } : {}),
      payload: parsed.payload,
    },
  };
}

export function rateLimitFor(type) {
  return RATE_LIMITS[type] ?? { count: 1, windowMs: 1_000 };
}

export function serverPacket(type, payload, id = undefined) {
  return JSON.stringify({
    v: COOP_PROTOCOL_VERSION,
    type,
    ...(id ? { id } : {}),
    payload,
  });
}

export function sanitizeDisplayName(value) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return normalized || 'Warden';
}

export function normalizeInviteCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, COOP_ROOM_CODE_LENGTH);
}
