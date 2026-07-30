import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

const port = 18_000 + Math.floor(Math.random() * 2_000);
const origin = 'http://localhost:5173';
const server = spawn(process.execPath, ['server/server.mjs'], {
  env: {
    ...process.env,
    COOP_HOST: '127.0.0.1',
    COOP_PORT: String(port),
    COOP_ALLOWED_ORIGINS: origin,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.setEncoding('utf8');
server.stderr.setEncoding('utf8');
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

function waitForServer(timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Room server did not start.\n${serverOutput}`)), timeoutMs);
    const poll = setInterval(() => {
      if (serverOutput.includes('co-op room server listening')) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve();
      }
    }, 20);
    server.once('exit', (code) => {
      clearInterval(poll);
      clearTimeout(deadline);
      reject(new Error(`Room server exited early with ${code}.\n${serverOutput}`));
    });
  });
}

function createClient() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  const queue = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString('utf8'));
    const waiterIndex = waiters.findIndex((waiter) => waiter.type === message.type);
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    } else {
      queue.push(message);
    }
  });
  return {
    socket,
    async open() {
      if (socket.readyState === WebSocket.OPEN) return;
      await once(socket, 'open');
    },
    send(type, payload) {
      socket.send(JSON.stringify({ v: 1, type, payload }));
    },
    waitFor(type, timeoutMs = 3_000) {
      const queuedIndex = queue.findIndex((message) => message.type === type);
      if (queuedIndex >= 0) return Promise.resolve(queue.splice(queuedIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {
          type,
          resolve,
          timeout: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error(`Timed out waiting for ${type}.`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
    close() {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000, 'test-complete');
    },
  };
}

try {
  await waitForServer();
  const first = createClient();
  const second = createClient();
  await Promise.all([first.open(), second.open()]);

  first.send('hello', { operation: 'create', displayName: 'Live One', clientVersion: '0.24.0' });
  const firstWelcome = await first.waitFor('welcome');
  assert.equal(firstWelcome.payload.maxPlayers, 2);
  assert.equal(firstWelcome.payload.snapshot.players.length, 1);

  second.send('hello', {
    operation: 'join',
    displayName: 'Live Two',
    inviteCode: firstWelcome.payload.roomCode,
    clientVersion: '0.24.0',
  });
  const secondWelcome = await second.waitFor('welcome');
  assert.equal(secondWelcome.payload.roomCode, firstWelcome.payload.roomCode);
  assert.notEqual(secondWelcome.payload.playerId, firstWelcome.payload.playerId);

  second.send('input', { seq: 1, dt: 50, moveX: 1, moveY: 0, facing: 'right' });
  const secondSnapshot = await second.waitFor('snapshot');
  const local = secondSnapshot.payload.players.find((player) => player.id === secondWelcome.payload.playerId);
  assert.ok(local);
  assert.ok(local.lastProcessedInputSeq >= 1);

  first.close();
  second.close();
  console.log('Live WebSocket smoke test passed: dedicated server create, join, and authoritative movement snapshot.');
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
  if (!server.killed) server.kill('SIGKILL');
}
