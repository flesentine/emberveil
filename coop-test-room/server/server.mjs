import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { COOP_MAX_PACKET_BYTES, COOP_TICK_RATE } from './protocol.mjs';
import { RoomServerCore } from './room-server-core.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'client');
const port = Number.parseInt(process.env.COOP_PORT ?? '8081', 10);
const host = process.env.COOP_HOST ?? '0.0.0.0';
const allowedOrigins = new Set((process.env.COOP_ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean));
const maxConnectionsPerIp = Math.max(1, Number.parseInt(process.env.COOP_MAX_CONNECTIONS_PER_IP ?? '8', 10));
const trustProxy = process.env.COOP_TRUST_PROXY === 'true';
const connectionsByIp = new Map();
const core = new RoomServerCore();
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function ipFor(request) {
  if (trustProxy && typeof request.headers['x-forwarded-for'] === 'string') return request.headers['x-forwarded-for'].split(',')[0].trim();
  return request.socket.remoteAddress ?? 'unknown';
}
function originAllowed(origin) { return allowedOrigins.size === 0 || (typeof origin === 'string' && allowedOrigins.has(origin)); }
function serveFile(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, rooms: core.rooms.size, connections: core.sessions.size }));
    return;
  }
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = join(root, safe);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not found'); return;
  }
  response.writeHead(200, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(response);
}

const httpServer = createServer(serveFile);
const wss = new WebSocketServer({ server: httpServer, maxPayload: COOP_MAX_PACKET_BYTES, perMessageDeflate: false, verifyClient: ({ origin, req }, done) => {
  const ip = ipFor(req);
  if (!originAllowed(origin)) return done(false, 403, 'Origin not allowed');
  if ((connectionsByIp.get(ip) ?? 0) >= maxConnectionsPerIp) return done(false, 429, 'Too many connections');
  done(true);
} });

wss.on('connection', (socket, request) => {
  const connectionId = randomUUID();
  const ip = ipFor(request);
  connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
  core.connect(connectionId, {
    send: (message) => { if (socket.readyState === WebSocket.OPEN) socket.send(message); },
    close: (code, reason) => { if (socket.readyState < WebSocket.CLOSING) socket.close(code, reason); },
  });
  socket.on('message', (data, isBinary) => isBinary ? socket.close(4002, 'binary-packets-not-supported') : core.receive(connectionId, data.toString('utf8')));
  socket.on('close', () => {
    core.disconnect(connectionId);
    const remaining = Math.max(0, (connectionsByIp.get(ip) ?? 1) - 1);
    remaining ? connectionsByIp.set(ip, remaining) : connectionsByIp.delete(ip);
  });
  socket.on('error', () => {});
});

const tickMs = Math.round(1000 / COOP_TICK_RATE);
const timer = setInterval(() => core.tick(tickMs), tickMs); timer.unref?.();
httpServer.listen(port, host, () => console.log(`Emberveil co-op room server listening on http://${host}:${port}`));
function shutdown() { clearInterval(timer); for (const client of wss.clients) client.close(1001, 'server-shutdown'); wss.close(() => httpServer.close()); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
