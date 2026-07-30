import { randomBytes, randomUUID } from 'node:crypto';
import {
  COOP_INPUT_STEP_MS,
  COOP_MAX_PLAYERS,
  COOP_PLAYER_SPEED,
  COOP_RECONNECT_GRACE_MS,
  COOP_ROOM_CODE_LENGTH,
  COOP_ROOM_IDLE_MS,
  COOP_SNAPSHOT_RATE,
  COOP_TICK_RATE,
  COOP_WORLD_HEIGHT,
  COOP_WORLD_WIDTH,
  normalizeInviteCode,
  parseClientPacket,
  rateLimitFor,
  sanitizeDisplayName,
  serverPacket,
} from './protocol.mjs';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYER_RADIUS = 7;
const BOSS_RADIUS = 12;
const PROJECTILE_RADIUS = 4;
const DOOR_RECT = Object.freeze({ x: 154, y: 34, width: 12, height: 112 });
const SWITCH_POSITION = Object.freeze({ x: 120, y: 90 });
const REWARD_POSITION = Object.freeze({ x: 282, y: 90 });
const REVIVE_DURATION_MS = 2_000;
const CUTSCENE_DURATION_MS = 2_600;
const MAX_INPUT_QUEUE = 12;
const MAX_ATTACK_IDS = 64;
const MALFORMED_STRIKE_LIMIT = 5;
const SNAPSHOT_INTERVAL_MS = Math.round(1_000 / COOP_SNAPSHOT_RATE);
const PING_INTERVAL_MS = 2_000;

const PICKUP_DEFINITIONS = Object.freeze([
  { id: 'tonic-cache', kind: 'item', itemId: 'mossvale-tonic', amount: 1, x: 78, y: 48 },
  { id: 'glint-cache', kind: 'currency', currencyId: 'glints', amount: 8, x: 78, y: 132 },
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) return { x: 0, y: 0 };
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function circleIntersectsRect(x, y, radius, rect) {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function generateRoomCode() {
  const bytes = randomBytes(COOP_ROOM_CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  return code;
}

function createReconnectToken() {
  return randomBytes(32).toString('base64url');
}

function spawnForSeat(seat) {
  return seat === 0 ? { x: 44, y: 90 } : { x: 68, y: 90 };
}

function cloneInventory(player) {
  return {
    items: { ...player.inventory.items },
    currency: player.inventory.currency,
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    displayName: player.displayName,
    seat: player.seat,
    x: player.x,
    y: player.y,
    facing: player.facing,
    health: player.health,
    maxHealth: player.maxHealth,
    downed: player.downed,
    reviveProgressMs: player.reviveProgressMs,
    connected: player.connected,
    lastProcessedInputSeq: player.lastProcessedInputSeq,
    inventory: cloneInventory(player),
    rttMs: player.rttMs,
  };
}

function createPlayer(displayName, seat, now) {
  const spawn = spawnForSeat(seat);
  return {
    id: randomUUID(),
    reconnectToken: createReconnectToken(),
    displayName,
    seat,
    x: spawn.x,
    y: spawn.y,
    facing: 'right',
    health: 6,
    maxHealth: 6,
    downed: false,
    downedAt: 0,
    invulnerableUntil: 0,
    reviveProgressMs: 0,
    reviveIntentTargetId: '',
    reviveIntentExpiresAt: 0,
    connected: true,
    disconnectExpiresAt: 0,
    joinedAt: now,
    lastProcessedInputSeq: -1,
    lastQueuedInputSeq: -1,
    inputQueue: [],
    lastAttackAt: -Infinity,
    processedAttackIds: new Set(),
    processedAttackOrder: [],
    inventory: {
      items: { 'mossvale-tonic': 0 },
      currency: 0,
    },
    rttMs: 0,
  };
}

export class CoopRoom {
  constructor(code, now = Date.now()) {
    this.code = code;
    this.createdAt = now;
    this.lastActiveAt = now;
    this.revision = 1;
    this.eventSequence = 0;
    this.projectileSequence = 0;
    this.players = new Map();
    this.events = [];
    this.rewardLedger = new Set();
    this.shared = {
      switchActive: false,
      doorOpen: false,
      questComplete: false,
      majorRewardClaimed: false,
    };
    this.pickups = PICKUP_DEFINITIONS.map((definition) => ({
      ...definition,
      collectedBy: new Set(),
    }));
    this.enemy = {
      id: 'veil-sentinel',
      x: 242,
      y: 90,
      health: 24,
      maxHealth: 24,
      alive: true,
      phase: 1,
      lastAttackAt: now,
      contactCooldownByPlayer: new Map(),
    };
    this.projectiles = new Map();
    this.cutscene = {
      id: 'coop-test-opening',
      active: true,
      startAt: now + 500,
      durationMs: CUTSCENE_DURATION_MS,
      step: 0,
      readyPlayerIds: new Set(),
    };
  }

  addPlayer(displayName, now = Date.now()) {
    if (this.players.size >= COOP_MAX_PLAYERS) return null;
    const occupiedSeats = new Set([...this.players.values()].map((player) => player.seat));
    const seat = occupiedSeats.has(0) ? 1 : 0;
    const player = createPlayer(sanitizeDisplayName(displayName), seat, now);
    if (this.shared.majorRewardClaimed) {
      player.inventory.items['signal-shard'] = 1;
    }
    this.players.set(player.id, player);
    this.lastActiveAt = now;
    this.bumpRevision();
    this.emit('player-joined', {
      playerId: player.id,
      displayName: player.displayName,
      seat: player.seat,
    });
    return player;
  }

  reconnectPlayer(playerId, reconnectToken, now = Date.now()) {
    const player = this.players.get(playerId);
    if (!player || player.reconnectToken !== reconnectToken) return null;
    if (player.connected) return null;
    if (player.disconnectExpiresAt > 0 && now > player.disconnectExpiresAt) return null;
    player.connected = true;
    player.disconnectExpiresAt = 0;
    player.inputQueue.length = 0;
    player.reviveIntentTargetId = '';
    player.reviveIntentExpiresAt = 0;
    this.lastActiveAt = now;
    this.bumpRevision();
    this.emit('player-reconnected', {
      playerId: player.id,
      displayName: player.displayName,
    });
    return player;
  }

  disconnectPlayer(playerId, now = Date.now()) {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return;
    player.connected = false;
    player.disconnectExpiresAt = now + COOP_RECONNECT_GRACE_MS;
    player.inputQueue.length = 0;
    player.reviveIntentTargetId = '';
    player.reviveIntentExpiresAt = 0;
    this.lastActiveAt = now;
    this.bumpRevision();
    this.emit('player-disconnected', {
      playerId: player.id,
      displayName: player.displayName,
      reconnectGraceMs: COOP_RECONNECT_GRACE_MS,
    });
  }

  handleMessage(playerId, message, now = Date.now()) {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return;
    this.lastActiveAt = now;

    switch (message.type) {
      case 'input':
        this.handleInput(player, message.payload);
        break;
      case 'attack':
        this.handleAttack(player, message.payload, now);
        break;
      case 'interact':
        this.handleInteract(player, message.payload.targetId, now);
        break;
      case 'revive':
        this.handleReviveIntent(player, message.payload, now);
        break;
      case 'ping-marker':
        if (!player.downed && !this.cutscene.active) {
          this.emit('ping-marker', {
            playerId: player.id,
            x: message.payload.x,
            y: message.payload.y,
            kind: message.payload.kind,
            expiresAt: now + 2_400,
          });
        }
        break;
      case 'emote':
        this.emit('emote', {
          playerId: player.id,
          emote: message.payload.emote,
          expiresAt: now + 1_800,
        });
        break;
      case 'cutscene-ready':
        if (this.cutscene.active && message.payload.sequenceId === this.cutscene.id) {
          this.cutscene.readyPlayerIds.add(player.id);
        }
        break;
      case 'resync':
        break;
      default:
        break;
    }
  }

  tick(now, deltaMs) {
    this.removeExpiredPlayers(now);
    this.updateCutscene(now);
    this.processInputs();
    this.updateRevives(now, deltaMs);
    this.updateEnemy(now, deltaMs);
    this.updateProjectiles(now, deltaMs);
    this.updateSoloRecovery(now);
  }

  snapshotFor(localPlayerId, now = Date.now()) {
    return {
      roomCode: this.code,
      localPlayerId,
      serverTime: now,
      revision: this.revision,
      maxPlayers: COOP_MAX_PLAYERS,
      world: {
        width: COOP_WORLD_WIDTH,
        height: COOP_WORLD_HEIGHT,
        door: { ...DOOR_RECT, open: this.shared.doorOpen },
        switch: { ...SWITCH_POSITION, active: this.shared.switchActive },
        reward: { ...REWARD_POSITION, claimed: this.shared.majorRewardClaimed },
      },
      players: [...this.players.values()].map(publicPlayer),
      enemy: {
        id: this.enemy.id,
        x: this.enemy.x,
        y: this.enemy.y,
        health: this.enemy.health,
        maxHealth: this.enemy.maxHealth,
        alive: this.enemy.alive,
        phase: this.enemy.phase,
      },
      projectiles: [...this.projectiles.values()].map((projectile) => ({
        id: projectile.id,
        ownerId: projectile.ownerId,
        ownerType: projectile.ownerType,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
      })),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        kind: pickup.kind,
        itemId: pickup.itemId ?? '',
        currencyId: pickup.currencyId ?? '',
        amount: pickup.amount,
        x: pickup.x,
        y: pickup.y,
        collectedBy: [...pickup.collectedBy],
      })),
      shared: { ...this.shared },
      cutscene: {
        id: this.cutscene.id,
        active: this.cutscene.active,
        startAt: this.cutscene.startAt,
        durationMs: this.cutscene.durationMs,
        step: this.cutscene.step,
      },
    };
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  isIdle(now = Date.now()) {
    return this.players.size === 0 && now - this.lastActiveAt >= COOP_ROOM_IDLE_MS;
  }

  handleInput(player, payload) {
    if (payload.seq <= player.lastQueuedInputSeq) return;
    player.lastQueuedInputSeq = payload.seq;
    player.inputQueue.push({
      seq: payload.seq,
      dt: Math.min(COOP_INPUT_STEP_MS, payload.dt),
      moveX: payload.moveX,
      moveY: payload.moveY,
      facing: payload.facing,
    });
    if (player.inputQueue.length > MAX_INPUT_QUEUE) {
      player.inputQueue.splice(0, player.inputQueue.length - MAX_INPUT_QUEUE);
    }
  }

  processInputs() {
    for (const player of this.players.values()) {
      if (!player.connected) {
        player.inputQueue.length = 0;
        continue;
      }
      while (player.inputQueue.length > 0) {
        const frame = player.inputQueue.shift();
        player.lastProcessedInputSeq = frame.seq;
        player.facing = frame.facing;
        if (this.cutscene.active || player.downed) continue;
        const movement = normalizeVector(frame.moveX, frame.moveY);
        const distance = COOP_PLAYER_SPEED * (frame.dt / 1_000);
        this.movePlayer(player, movement.x * distance, movement.y * distance);
      }
    }
  }

  movePlayer(player, dx, dy) {
    const minX = PLAYER_RADIUS + 4;
    const maxX = COOP_WORLD_WIDTH - PLAYER_RADIUS - 4;
    const minY = PLAYER_RADIUS + 24;
    const maxY = COOP_WORLD_HEIGHT - PLAYER_RADIUS - 4;

    const nextX = clamp(player.x + dx, minX, maxX);
    if (this.shared.doorOpen || !circleIntersectsRect(nextX, player.y, PLAYER_RADIUS, DOOR_RECT)) {
      player.x = nextX;
    }
    const nextY = clamp(player.y + dy, minY, maxY);
    if (this.shared.doorOpen || !circleIntersectsRect(player.x, nextY, PLAYER_RADIUS, DOOR_RECT)) {
      player.y = nextY;
    }
  }

  handleAttack(player, payload, now) {
    if (this.cutscene.active || player.downed || !this.enemy.alive) return;
    if (player.processedAttackIds.has(payload.clientAttackId)) return;
    player.processedAttackIds.add(payload.clientAttackId);
    player.processedAttackOrder.push(payload.clientAttackId);
    if (player.processedAttackOrder.length > MAX_ATTACK_IDS) {
      const oldest = player.processedAttackOrder.shift();
      player.processedAttackIds.delete(oldest);
    }

    const cooldown = payload.kind === 'melee' ? 350 : 650;
    if (now - player.lastAttackAt < cooldown) return;
    player.lastAttackAt = now;
    const aim = normalizeVector(payload.aimX, payload.aimY);

    if (payload.kind === 'melee') {
      const distance = Math.sqrt(distanceSquared(player, this.enemy));
      const toEnemy = normalizeVector(this.enemy.x - player.x, this.enemy.y - player.y);
      const facingDot = aim.x * toEnemy.x + aim.y * toEnemy.y;
      if (distance <= 38 && facingDot >= 0.15 && (this.shared.doorOpen || player.x > DOOR_RECT.x + DOOR_RECT.width)) {
        this.damageEnemy(player.id, 4, now, payload.clientAttackId);
      } else {
        this.emit('attack-missed', { playerId: player.id, kind: payload.kind });
      }
      return;
    }

    const projectile = {
      id: `p${++this.projectileSequence}`,
      ownerId: player.id,
      ownerType: 'player',
      x: player.x + aim.x * 12,
      y: player.y + aim.y * 12,
      vx: aim.x * 150,
      vy: aim.y * 150,
      damage: 3,
      expiresAt: now + 1_600,
    };
    this.projectiles.set(projectile.id, projectile);
    this.emit('projectile-spawned', {
      id: projectile.id,
      ownerId: projectile.ownerId,
      ownerType: projectile.ownerType,
      x: projectile.x,
      y: projectile.y,
    });
  }

  handleInteract(player, targetId, now) {
    if (this.cutscene.active || player.downed) return;
    if (targetId === 'shared-switch') {
      if (distanceSquared(player, SWITCH_POSITION) > 24 * 24) return;
      if (!this.shared.switchActive) {
        this.shared.switchActive = true;
        this.shared.doorOpen = true;
        this.bumpRevision();
        this.emit('switch-activated', { playerId: player.id, targetId });
        this.emit('door-opened', { doorId: 'sentinel-door' });
      }
      return;
    }

    const pickup = this.pickups.find((candidate) => candidate.id === targetId);
    if (pickup) {
      if (distanceSquared(player, pickup) > 24 * 24 || pickup.collectedBy.has(player.id)) return;
      pickup.collectedBy.add(player.id);
      if (pickup.kind === 'currency') {
        player.inventory.currency += pickup.amount;
      } else {
        const current = player.inventory.items[pickup.itemId] ?? 0;
        player.inventory.items[pickup.itemId] = current + pickup.amount;
      }
      this.bumpRevision();
      this.emit('pickup-collected', {
        playerId: player.id,
        pickupId: pickup.id,
        kind: pickup.kind,
        itemId: pickup.itemId ?? '',
        currencyId: pickup.currencyId ?? '',
        amount: pickup.amount,
      });
      return;
    }

    if (targetId === 'major-reward') {
      if (distanceSquared(player, REWARD_POSITION) > 26 * 26 || this.enemy.alive) return;
      const transactionId = 'shared-reward:signal-shard';
      if (this.rewardLedger.has(transactionId)) {
        this.emit('notice', { playerId: player.id, text: 'The Signal Shard has already joined the room quest.' }, [player.id]);
        return;
      }
      this.rewardLedger.add(transactionId);
      this.shared.questComplete = true;
      this.shared.majorRewardClaimed = true;
      for (const roomPlayer of this.players.values()) {
        roomPlayer.inventory.items['signal-shard'] = 1;
      }
      this.bumpRevision();
      this.emit('reward-granted', {
        transactionId,
        rewardId: 'signal-shard',
        claimedBy: player.id,
      });
      return;
    }

    this.emit('notice', { playerId: player.id, text: 'Nothing responds.' }, [player.id]);
    this.lastActiveAt = now;
  }

  handleReviveIntent(player, payload, now) {
    if (player.downed) return;
    player.reviveIntentTargetId = payload.active ? payload.targetPlayerId : '';
    player.reviveIntentExpiresAt = payload.active ? now + 250 : 0;
  }

  updateRevives(now, deltaMs) {
    const activeTargets = new Set();
    for (const reviver of this.players.values()) {
      if (!reviver.connected || reviver.downed || now > reviver.reviveIntentExpiresAt) continue;
      const target = this.players.get(reviver.reviveIntentTargetId);
      if (!target || !target.connected || !target.downed) continue;
      if (distanceSquared(reviver, target) > 30 * 30) continue;
      activeTargets.add(target.id);
      target.reviveProgressMs += deltaMs;
      if (target.reviveProgressMs >= REVIVE_DURATION_MS) {
        this.revivePlayer(target, reviver.id, now);
      }
    }

    for (const target of this.players.values()) {
      if (!target.downed || activeTargets.has(target.id)) continue;
      target.reviveProgressMs = Math.max(0, target.reviveProgressMs - deltaMs * 2);
    }
  }

  revivePlayer(target, revivedBy, now) {
    target.downed = false;
    target.health = Math.max(3, Math.ceil(target.maxHealth / 2));
    target.reviveProgressMs = 0;
    target.downedAt = 0;
    target.invulnerableUntil = now + 1_000;
    this.bumpRevision();
    this.emit('player-revived', {
      playerId: target.id,
      revivedBy,
      health: target.health,
    });
  }

  updateSoloRecovery(now) {
    const activePlayers = [...this.players.values()].filter((player) => player.connected && !player.downed);
    for (const player of this.players.values()) {
      if (!player.connected || !player.downed) continue;
      if (activePlayers.length === 0 && now - player.downedAt >= 4_000) {
        this.revivePlayer(player, 'signal-network', now);
      }
    }
  }

  updateEnemy(now, deltaMs) {
    if (!this.enemy.alive || !this.shared.doorOpen || this.cutscene.active) return;
    const targets = [...this.players.values()].filter((player) => player.connected && !player.downed);
    if (targets.length === 0) return;
    targets.sort((a, b) => distanceSquared(a, this.enemy) - distanceSquared(b, this.enemy));
    const target = targets[0];
    const direction = normalizeVector(target.x - this.enemy.x, target.y - this.enemy.y);
    const speed = this.enemy.phase === 1 ? 18 : 28;
    this.enemy.x = clamp(this.enemy.x + direction.x * speed * (deltaMs / 1_000), 178, COOP_WORLD_WIDTH - 18);
    this.enemy.y = clamp(this.enemy.y + direction.y * speed * (deltaMs / 1_000), 36, COOP_WORLD_HEIGHT - 14);

    const contactLastAt = this.enemy.contactCooldownByPlayer.get(target.id) ?? -Infinity;
    if (distanceSquared(target, this.enemy) <= (PLAYER_RADIUS + BOSS_RADIUS + 2) ** 2 && now - contactLastAt >= 900) {
      this.enemy.contactCooldownByPlayer.set(target.id, now);
      this.damagePlayer(target, 1, 'sentinel-contact', now);
    }

    const attackCooldown = this.enemy.phase === 1 ? 1_350 : 900;
    if (now - this.enemy.lastAttackAt >= attackCooldown) {
      this.enemy.lastAttackAt = now;
      const projectile = {
        id: `p${++this.projectileSequence}`,
        ownerId: this.enemy.id,
        ownerType: 'enemy',
        x: this.enemy.x + direction.x * 12,
        y: this.enemy.y + direction.y * 12,
        vx: direction.x * (this.enemy.phase === 1 ? 92 : 120),
        vy: direction.y * (this.enemy.phase === 1 ? 92 : 120),
        damage: 1,
        expiresAt: now + 2_200,
      };
      this.projectiles.set(projectile.id, projectile);
      this.emit('projectile-spawned', {
        id: projectile.id,
        ownerId: projectile.ownerId,
        ownerType: projectile.ownerType,
        x: projectile.x,
        y: projectile.y,
      });
    }
  }

  updateProjectiles(now, deltaMs) {
    for (const projectile of [...this.projectiles.values()]) {
      projectile.x += projectile.vx * (deltaMs / 1_000);
      projectile.y += projectile.vy * (deltaMs / 1_000);
      const outOfBounds = projectile.x < 0 || projectile.y < 20 || projectile.x > COOP_WORLD_WIDTH || projectile.y > COOP_WORLD_HEIGHT;
      const hitDoor = !this.shared.doorOpen && circleIntersectsRect(projectile.x, projectile.y, PROJECTILE_RADIUS, DOOR_RECT);
      if (outOfBounds || hitDoor || now >= projectile.expiresAt) {
        this.removeProjectile(projectile.id, hitDoor ? 'door' : 'expired');
        continue;
      }

      if (projectile.ownerType === 'player') {
        if (this.enemy.alive && distanceSquared(projectile, this.enemy) <= (PROJECTILE_RADIUS + BOSS_RADIUS) ** 2) {
          this.damageEnemy(projectile.ownerId, projectile.damage, now, projectile.id);
          this.removeProjectile(projectile.id, 'enemy-hit');
        }
        continue;
      }

      const target = [...this.players.values()].find((player) =>
        player.connected
        && !player.downed
        && distanceSquared(projectile, player) <= (PROJECTILE_RADIUS + PLAYER_RADIUS) ** 2,
      );
      if (target) {
        this.damagePlayer(target, projectile.damage, projectile.id, now);
        this.removeProjectile(projectile.id, 'player-hit');
      }
    }
  }

  removeProjectile(projectileId, reason) {
    if (!this.projectiles.delete(projectileId)) return;
    this.emit('projectile-removed', { projectileId, reason });
  }

  damageEnemy(sourcePlayerId, amount, now, attackId) {
    if (!this.enemy.alive || amount <= 0) return;
    this.enemy.health = Math.max(0, this.enemy.health - amount);
    this.enemy.phase = this.enemy.health > this.enemy.maxHealth / 2 ? 1 : 2;
    this.bumpRevision();
    this.emit('enemy-damaged', {
      enemyId: this.enemy.id,
      sourcePlayerId,
      attackId,
      amount,
      health: this.enemy.health,
      phase: this.enemy.phase,
    });
    if (this.enemy.health > 0) return;
    this.enemy.alive = false;
    this.projectiles.clear();
    this.bumpRevision();
    this.emit('enemy-defeated', {
      enemyId: this.enemy.id,
      defeatedBy: sourcePlayerId,
      rewardTargetId: 'major-reward',
      serverTime: now,
    });
  }

  damagePlayer(player, amount, sourceId, now) {
    if (amount <= 0 || player.downed || now < player.invulnerableUntil) return;
    player.health = Math.max(0, player.health - amount);
    player.invulnerableUntil = now + 500;
    this.bumpRevision();
    this.emit('player-damaged', {
      playerId: player.id,
      amount,
      sourceId,
      health: player.health,
    });
    if (player.health > 0) return;
    player.downed = true;
    player.downedAt = now;
    player.reviveProgressMs = 0;
    player.inputQueue.length = 0;
    this.bumpRevision();
    this.emit('player-downed', {
      playerId: player.id,
      sourceId,
    });
  }

  updateCutscene(now) {
    if (!this.cutscene.active || now < this.cutscene.startAt) return;
    const connectedIds = [...this.players.values()].filter((player) => player.connected).map((player) => player.id);
    const everyoneReady = connectedIds.length > 0 && connectedIds.every((id) => this.cutscene.readyPlayerIds.has(id));
    const minimumElapsed = now >= this.cutscene.startAt + 600;
    const timedOut = now >= this.cutscene.startAt + this.cutscene.durationMs;
    if ((everyoneReady && minimumElapsed) || timedOut) {
      this.cutscene.active = false;
      this.cutscene.step = 1;
      this.bumpRevision();
      this.emit('cutscene-ended', { sequenceId: this.cutscene.id });
    }
  }

  removeExpiredPlayers(now) {
    for (const player of [...this.players.values()]) {
      if (player.connected || player.disconnectExpiresAt <= 0 || now <= player.disconnectExpiresAt) continue;
      this.players.delete(player.id);
      for (const pickup of this.pickups) pickup.collectedBy.delete(player.id);
      this.cutscene.readyPlayerIds.delete(player.id);
      this.bumpRevision();
      this.emit('player-left', {
        playerId: player.id,
        displayName: player.displayName,
      });
    }
  }

  bumpRevision() {
    this.revision += 1;
  }

  emit(eventType, payload, recipients = null) {
    this.events.push({
      eventId: `${this.code}:${++this.eventSequence}`,
      roomRevision: this.revision,
      eventType,
      payload,
      recipients,
    });
  }
}

export class RoomServerCore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.rooms = new Map();
    this.sessions = new Map();
    this.lastSnapshotAt = 0;
    this.lastPingAt = 0;
  }

  connect(connectionId, transport) {
    this.sessions.set(connectionId, {
      connectionId,
      transport,
      roomCode: '',
      playerId: '',
      authenticated: false,
      strikes: 0,
      rateHistory: new Map(),
      pendingPings: new Map(),
    });
  }

  receive(connectionId, raw) {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    const parsed = parseClientPacket(raw);
    if (!parsed.ok) {
      this.strike(session, parsed.code);
      return;
    }
    const message = parsed.message;
    const now = this.now();
    if (!this.allowRate(session, message.type, now)) {
      this.sendError(session, 'rate-limited', 'Too many messages were sent.', true);
      return;
    }

    if (!session.authenticated) {
      if (message.type !== 'hello') {
        this.strike(session, 'hello-required');
        return;
      }
      this.handleHello(session, message.payload, now);
      return;
    }

    if (message.type === 'hello') {
      this.strike(session, 'already-authenticated');
      return;
    }
    if (message.type === 'pong') {
      const sentAt = session.pendingPings.get(message.payload.nonce);
      if (sentAt !== undefined) {
        session.pendingPings.delete(message.payload.nonce);
        const room = this.rooms.get(session.roomCode);
        const player = room?.players.get(session.playerId);
        if (player) player.rttMs = clamp(now - sentAt, 0, 9_999);
      }
      return;
    }

    const room = this.rooms.get(session.roomCode);
    if (!room) {
      this.sendError(session, 'room-gone', 'The room is no longer available.', false);
      session.transport.close?.(4004, 'room-gone');
      return;
    }
    room.handleMessage(session.playerId, message, now);
    if (message.type === 'resync') this.sendSnapshot(session, room, now);
    this.flushRoomEvents(room);
  }

  disconnect(connectionId) {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    this.sessions.delete(connectionId);
    if (!session.authenticated) return;
    const room = this.rooms.get(session.roomCode);
    room?.disconnectPlayer(session.playerId, this.now());
    if (room) this.flushRoomEvents(room);
  }

  tick(deltaMs = Math.round(1_000 / COOP_TICK_RATE)) {
    const now = this.now();
    for (const room of this.rooms.values()) {
      room.tick(now, deltaMs);
      this.flushRoomEvents(room);
    }

    if (now - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      this.lastSnapshotAt = now;
      for (const session of this.sessions.values()) {
        if (!session.authenticated) continue;
        const room = this.rooms.get(session.roomCode);
        if (room) this.sendSnapshot(session, room, now);
      }
    }

    if (now - this.lastPingAt >= PING_INTERVAL_MS) {
      this.lastPingAt = now;
      for (const session of this.sessions.values()) {
        if (!session.authenticated) continue;
        const nonce = randomBytes(12).toString('base64url');
        session.pendingPings.set(nonce, now);
        for (const [pendingNonce, sentAt] of session.pendingPings) {
          if (now - sentAt > 10_000) session.pendingPings.delete(pendingNonce);
        }
        this.send(session, 'ping', { nonce, serverTime: now });
      }
    }

    for (const [code, room] of this.rooms) {
      if (room.isIdle(now)) this.rooms.delete(code);
    }
  }

  getRoom(code) {
    return this.rooms.get(normalizeInviteCode(code)) ?? null;
  }

  getSession(connectionId) {
    return this.sessions.get(connectionId) ?? null;
  }

  handleHello(session, payload, now) {
    if (payload.operation === 'create') {
      let roomCode = generateRoomCode();
      while (this.rooms.has(roomCode)) roomCode = generateRoomCode();
      const room = new CoopRoom(roomCode, now);
      this.rooms.set(roomCode, room);
      const player = room.addPlayer(payload.displayName, now);
      this.authenticate(session, room, player, now);
      this.flushRoomEvents(room);
      return;
    }

    const roomCode = normalizeInviteCode(payload.inviteCode);
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendError(session, 'room-not-found', 'No active room matches that invite code.', true);
      return;
    }

    if (payload.operation === 'join') {
      const player = room.addPlayer(payload.displayName, now);
      if (!player) {
        this.sendError(session, 'room-full', 'This test room already has two players.', true);
        return;
      }
      this.authenticate(session, room, player, now);
      this.flushRoomEvents(room);
      return;
    }

    const player = room.reconnectPlayer(payload.playerId, payload.reconnectToken, now);
    if (!player) {
      this.sendError(session, 'reconnect-rejected', 'The reconnect token is invalid or its grace period expired.', false);
      return;
    }
    this.authenticate(session, room, player, now);
    this.flushRoomEvents(room);
  }

  authenticate(session, room, player, now) {
    session.authenticated = true;
    session.roomCode = room.code;
    session.playerId = player.id;
    this.send(session, 'welcome', {
      roomCode: room.code,
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      reconnectGraceMs: COOP_RECONNECT_GRACE_MS,
      maxPlayers: COOP_MAX_PLAYERS,
      serverTime: now,
      snapshot: room.snapshotFor(player.id, now),
    });
  }

  flushRoomEvents(room) {
    const events = room.drainEvents();
    if (events.length === 0) return;
    for (const event of events) {
      for (const session of this.sessions.values()) {
        if (!session.authenticated || session.roomCode !== room.code) continue;
        if (event.recipients && !event.recipients.includes(session.playerId)) continue;
        this.send(session, 'event', {
          eventId: event.eventId,
          roomRevision: event.roomRevision,
          eventType: event.eventType,
          payload: event.payload,
        });
      }
    }
  }

  sendSnapshot(session, room, now) {
    this.send(session, 'snapshot', room.snapshotFor(session.playerId, now));
  }

  send(session, type, payload) {
    try {
      session.transport.send(serverPacket(type, payload));
    } catch {
      session.transport.close?.(1011, 'send-failed');
    }
  }

  sendError(session, code, message, recoverable) {
    this.send(session, 'error', { code, message, recoverable });
  }

  strike(session, code) {
    session.strikes += 1;
    this.sendError(session, code, 'The server rejected an invalid network message.', session.strikes < MALFORMED_STRIKE_LIMIT);
    if (session.strikes >= MALFORMED_STRIKE_LIMIT) {
      session.transport.close?.(4002, 'too-many-invalid-packets');
    }
  }

  allowRate(session, type, now) {
    const limit = rateLimitFor(type);
    const history = session.rateHistory.get(type) ?? [];
    const recent = history.filter((timestamp) => now - timestamp < limit.windowMs);
    if (recent.length >= limit.count) {
      session.rateHistory.set(type, recent);
      return false;
    }
    recent.push(now);
    session.rateHistory.set(type, recent);
    return true;
  }
}
