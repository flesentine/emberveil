import assert from 'node:assert/strict';
import { parseClientPacket } from '../server/protocol.mjs';
import { RoomServerCore } from '../server/room-server-core.mjs';

function packet(type, payload) {
  return JSON.stringify({ v: 1, type, payload });
}

function createTransport() {
  const messages = [];
  const closes = [];
  return {
    messages,
    closes,
    transport: {
      send: (message) => messages.push(JSON.parse(message)),
      close: (code, reason) => closes.push({ code, reason }),
    },
  };
}

function latest(transport, type) {
  return [...transport.messages].reverse().find((message) => message.type === type) ?? null;
}

let now = 10_000;
const core = new RoomServerCore({ now: () => now });
const first = createTransport();
const second = createTransport();
core.connect('connection-a', first.transport);
core.connect('connection-b', second.transport);

core.receive('connection-a', packet('hello', {
  operation: 'create',
  displayName: 'Rowan A',
  clientVersion: '0.24.0',
}));
const firstWelcome = latest(first, 'welcome');
assert.ok(firstWelcome, 'creating a room should return a welcome packet');
const roomCode = firstWelcome.payload.roomCode;
const firstPlayerId = firstWelcome.payload.playerId;
const firstReconnectToken = firstWelcome.payload.reconnectToken;
assert.equal(roomCode.length, 6);
assert.equal(firstWelcome.payload.maxPlayers, 2);

core.receive('connection-b', packet('hello', {
  operation: 'join',
  displayName: 'Rowan B',
  inviteCode: roomCode,
  clientVersion: '0.24.0',
}));
const secondWelcome = latest(second, 'welcome');
assert.ok(secondWelcome, 'joining by invite code should return a welcome packet');
assert.equal(secondWelcome.payload.roomCode, roomCode);
assert.notEqual(secondWelcome.payload.playerId, firstPlayerId);

const third = createTransport();
core.connect('connection-c', third.transport);
core.receive('connection-c', packet('hello', {
  operation: 'join',
  displayName: 'Rowan C',
  inviteCode: roomCode,
  clientVersion: '0.24.0',
}));
assert.equal(latest(third, 'error')?.payload.code, 'room-full', 'the test room must remain capped at two players');

const room = core.getRoom(roomCode);
assert.ok(room, 'created room should be inspectable by invite code');
room.cutscene.active = false;
const playerA = room.players.get(firstPlayerId);
const playerB = room.players.get(secondWelcome.payload.playerId);
assert.ok(playerA && playerB);

playerA.x = 120;
playerA.y = 90;
core.receive('connection-a', packet('interact', { targetId: 'shared-switch' }));
assert.equal(room.shared.switchActive, true);
assert.equal(room.shared.doorOpen, true, 'shared switch should authoritatively open the door');

playerA.x = 78;
playerA.y = 48;
playerB.x = 78;
playerB.y = 48;
core.receive('connection-a', packet('interact', { targetId: 'tonic-cache' }));
core.receive('connection-a', packet('interact', { targetId: 'tonic-cache' }));
core.receive('connection-b', packet('interact', { targetId: 'tonic-cache' }));
assert.equal(playerA.inventory.items['mossvale-tonic'], 1, 'normal pickup must not duplicate for one player');
assert.equal(playerB.inventory.items['mossvale-tonic'], 1, 'normal pickup should be independently collectible by the other player');

const forgedDamagePacket = parseClientPacket(packet('attack', {
  clientAttackId: 'forged',
  kind: 'melee',
  aimX: 1,
  aimY: 0,
  damage: 999,
}));
assert.equal(forgedDamagePacket.ok, false, 'client-reported damage fields must be rejected');
assert.equal(parseClientPacket(packet('damage', { amount: 999 })).ok, false, 'damage is not a legal client message type');

playerA.x = 220;
playerA.y = 90;
room.enemy.x = 242;
room.enemy.y = 90;
room.enemy.health = 4;
room.enemy.alive = true;
core.receive('connection-a', packet('attack', {
  clientAttackId: 'attack-once',
  kind: 'melee',
  aimX: 1,
  aimY: 0,
}));
assert.equal(room.enemy.alive, false, 'server should calculate a valid melee hit and defeat');
core.receive('connection-a', packet('attack', {
  clientAttackId: 'attack-once',
  kind: 'melee',
  aimX: 1,
  aimY: 0,
}));
assert.equal(room.enemy.health, 0, 'duplicate attack IDs must not apply twice');

playerA.x = 282;
playerA.y = 90;
core.receive('connection-a', packet('interact', { targetId: 'major-reward' }));
const revisionAfterReward = room.revision;
core.receive('connection-a', packet('interact', { targetId: 'major-reward' }));
assert.equal(room.shared.majorRewardClaimed, true);
assert.equal(room.rewardLedger.size, 1, 'shared reward transaction must be recorded once');
assert.equal(room.revision, revisionAfterReward, 'duplicate reward requests must not mutate room state');
assert.equal(playerA.inventory.items['signal-shard'], 1);
assert.equal(playerB.inventory.items['signal-shard'], 1);

playerB.downed = true;
playerB.health = 0;
playerB.downedAt = now;
playerA.x = 90;
playerA.y = 90;
playerB.x = 100;
playerB.y = 90;
for (let step = 0; step < 22; step += 1) {
  room.handleMessage(playerA.id, { type: 'revive', payload: { targetPlayerId: playerB.id, active: true } }, now);
  now += 100;
  room.tick(now, 100);
}
assert.equal(playerB.downed, false, 'holding revive intent nearby should restore the other player');
assert.ok(playerB.health >= 3);

const reconnectToken = secondWelcome.payload.reconnectToken;
const secondPlayerId = secondWelcome.payload.playerId;
core.disconnect('connection-b');
const reconnect = createTransport();
core.connect('connection-d', reconnect.transport);
now += 500;
core.receive('connection-d', packet('hello', {
  operation: 'reconnect',
  inviteCode: roomCode,
  playerId: secondPlayerId,
  reconnectToken,
  clientVersion: '0.24.0',
}));
assert.equal(latest(reconnect, 'welcome')?.payload.playerId, secondPlayerId, 'reconnect should restore the same authoritative player identity');

const malformed = createTransport();
core.connect('connection-malformed', malformed.transport);
for (let index = 0; index < 5; index += 1) core.receive('connection-malformed', '{bad json');
assert.equal(malformed.closes.at(-1)?.code, 4002, 'repeated malformed packets should close the connection safely');

const firstSession = core.getSession('connection-a');
assert.ok(firstSession?.authenticated);
for (let index = 0; index < 35; index += 1) {
  core.receive('connection-a', packet('input', {
    seq: index,
    dt: 50,
    moveX: 1,
    moveY: 0,
    facing: 'right',
  }));
}
assert.ok(first.messages.some((message) => message.type === 'error' && message.payload.code === 'rate-limited'), 'excessive input messages should be rate limited');
assert.equal(first.closes.length, 0, 'ordinary rate limiting should not crash or immediately close a valid client');

core.disconnect('connection-a');
const reconnectFirst = createTransport();
core.connect('connection-e', reconnectFirst.transport);
now += 500;
core.receive('connection-e', packet('hello', {
  operation: 'reconnect',
  inviteCode: roomCode,
  playerId: firstPlayerId,
  reconnectToken: firstReconnectToken,
  clientVersion: '0.24.0',
}));
assert.equal(latest(reconnectFirst, 'welcome')?.payload.playerId, firstPlayerId);

console.log('Network server tests passed: rooms, validation, authority, rewards, revival, rate limits, and reconnect.');

// Late joiners receive the authoritative shared state while retaining independent normal pickups.
let lateNow = 50_000;
const lateCore = new RoomServerCore({ now: () => lateNow });
const lateHost = createTransport();
lateCore.connect('late-host', lateHost.transport);
lateCore.receive('late-host', packet('hello', {
  operation: 'create',
  displayName: 'Early Warden',
  clientVersion: '0.24.0',
}));
const lateHostWelcome = latest(lateHost, 'welcome');
assert.ok(lateHostWelcome);
const lateRoom = lateCore.getRoom(lateHostWelcome.payload.roomCode);
assert.ok(lateRoom);
lateRoom.cutscene.active = false;
const earlyPlayer = lateRoom.players.get(lateHostWelcome.payload.playerId);
assert.ok(earlyPlayer);
earlyPlayer.x = 120;
earlyPlayer.y = 90;
lateCore.receive('late-host', packet('interact', { targetId: 'shared-switch' }));
earlyPlayer.x = 78;
earlyPlayer.y = 48;
lateCore.receive('late-host', packet('interact', { targetId: 'tonic-cache' }));

const lateGuest = createTransport();
lateCore.connect('late-guest', lateGuest.transport);
lateCore.receive('late-guest', packet('hello', {
  operation: 'join',
  displayName: 'Late Warden',
  inviteCode: lateHostWelcome.payload.roomCode,
  clientVersion: '0.24.0',
}));
const lateGuestWelcome = latest(lateGuest, 'welcome');
assert.ok(lateGuestWelcome, 'late joining should return a complete authoritative snapshot');
assert.equal(lateGuestWelcome.payload.snapshot.shared.switchActive, true);
assert.equal(lateGuestWelcome.payload.snapshot.shared.doorOpen, true);
const lateTonic = lateGuestWelcome.payload.snapshot.pickups.find((pickup) => pickup.id === 'tonic-cache');
assert.ok(lateTonic);
assert.deepEqual(lateTonic.collectedBy, [earlyPlayer.id]);
const latePlayer = lateRoom.players.get(lateGuestWelcome.payload.playerId);
assert.equal(latePlayer?.inventory.items['mossvale-tonic'], 0, 'late joiners keep an independent normal inventory');

// Movement is an intent: the server applies the fixed maximum distance and acknowledges its sequence.
const movementStartX = latePlayer.x;
lateCore.receive('late-guest', packet('input', {
  seq: 1,
  dt: 50,
  moveX: 1,
  moveY: 0,
  facing: 'right',
}));
lateNow += 50;
lateCore.tick(50);
assert.ok(latePlayer.x > movementStartX);
assert.ok(latePlayer.x - movementStartX <= 3.600001, 'one input step must not exceed authoritative speed');
assert.equal(latePlayer.lastProcessedInputSeq, 1);

// The server owns projectile creation, travel, collision, damage, and removal.
latePlayer.x = 202;
latePlayer.y = 90;
lateRoom.enemy.x = 250;
lateRoom.enemy.y = 90;
lateRoom.enemy.health = 24;
lateRoom.enemy.alive = true;
lateCore.receive('late-guest', packet('attack', {
  clientAttackId: 'server-bolt-1',
  kind: 'bolt',
  aimX: 1,
  aimY: 0,
}));
assert.equal(lateRoom.projectiles.size, 1, 'a validated attack intent should create a server-owned projectile');
for (let step = 0; step < 12 && lateRoom.enemy.health === 24; step += 1) {
  lateNow += 50;
  lateCore.tick(50);
}
assert.ok(lateRoom.enemy.health < 24, 'only the server projectile collision should reduce enemy health');

// Shared cutscenes use a server timeline and a connected-player ready barrier.
let cutsceneNow = 80_000;
const cutsceneCore = new RoomServerCore({ now: () => cutsceneNow });
const cutsceneA = createTransport();
const cutsceneB = createTransport();
cutsceneCore.connect('cutscene-a', cutsceneA.transport);
cutsceneCore.connect('cutscene-b', cutsceneB.transport);
cutsceneCore.receive('cutscene-a', packet('hello', {
  operation: 'create', displayName: 'One', clientVersion: '0.24.0',
}));
const cutsceneWelcomeA = latest(cutsceneA, 'welcome');
assert.ok(cutsceneWelcomeA);
cutsceneCore.receive('cutscene-b', packet('hello', {
  operation: 'join', displayName: 'Two', inviteCode: cutsceneWelcomeA.payload.roomCode, clientVersion: '0.24.0',
}));
const cutsceneWelcomeB = latest(cutsceneB, 'welcome');
assert.ok(cutsceneWelcomeB);
const cutsceneRoom = cutsceneCore.getRoom(cutsceneWelcomeA.payload.roomCode);
assert.ok(cutsceneRoom?.cutscene.active);
cutsceneNow = cutsceneRoom.cutscene.startAt + 700;
cutsceneCore.receive('cutscene-a', packet('cutscene-ready', { sequenceId: 'coop-test-opening', step: 0 }));
cutsceneCore.tick(50);
assert.equal(cutsceneRoom.cutscene.active, true, 'one player cannot skip a two-player shared cutscene alone');
cutsceneCore.receive('cutscene-b', packet('cutscene-ready', { sequenceId: 'coop-test-opening', step: 0 }));
cutsceneCore.tick(50);
assert.equal(cutsceneRoom.cutscene.active, false, 'all connected players can complete the shared ready barrier');

// Reconnect identities expire cleanly and cannot be reclaimed after the grace window.
let expiryNow = 120_000;
const expiryCore = new RoomServerCore({ now: () => expiryNow });
const expiryClient = createTransport();
expiryCore.connect('expiry-a', expiryClient.transport);
expiryCore.receive('expiry-a', packet('hello', {
  operation: 'create', displayName: 'Fading Warden', clientVersion: '0.24.0',
}));
const expiryWelcome = latest(expiryClient, 'welcome');
assert.ok(expiryWelcome);
expiryCore.disconnect('expiry-a');
expiryNow += expiryWelcome.payload.reconnectGraceMs + 1;
expiryCore.tick(50);
const expiredReconnect = createTransport();
expiryCore.connect('expiry-b', expiredReconnect.transport);
expiryCore.receive('expiry-b', packet('hello', {
  operation: 'reconnect',
  inviteCode: expiryWelcome.payload.roomCode,
  playerId: expiryWelcome.payload.playerId,
  reconnectToken: expiryWelcome.payload.reconnectToken,
  clientVersion: '0.24.0',
}));
assert.equal(latest(expiredReconnect, 'error')?.payload.code, 'reconnect-rejected');

console.log('Extended network tests passed: late join, fixed-step movement, server projectiles, shared cutscenes, and reconnect expiry.');
