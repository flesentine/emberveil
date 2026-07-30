import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyCsrfProtection from '@fastify/csrf-protection';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { createAuth } from './auth.mjs';
import { CloudSaveRepository } from './cloud-save-repository.mjs';
import { loadAccountConfig } from './config.mjs';
import { openAccountDatabase } from './database.mjs';
import { runAccountMigrations } from './migrate.mjs';
import { registerAccountRoutes } from './routes.mjs';

export async function createAccountServer(overrides = {}) {
  const config = overrides.config ?? loadAccountConfig();
  const database = overrides.database ?? openAccountDatabase(config.databasePath);
  const fastify = Fastify({
    logger: overrides.logger ?? true,
    trustProxy: process.env.ACCOUNT_TRUST_PROXY === 'true' ? 1 : false,
    bodyLimit: 600 * 1024,
    requestTimeout: 15_000,
  });
  const auth = createAuth({ config, database, logger: fastify.log });
  await runAccountMigrations({ database, auth });

  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await fastify.register(fastifyCors, {
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed.'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 86400,
  });
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    ban: 3,
  });
  await fastify.register(fastifyCookie, {
    secret: config.csrfCookieSecret,
    hook: 'onRequest',
  });
  await fastify.register(fastifyCsrfProtection, {
    cookieKey: 'emberveil.csrf',
    cookieOpts: {
      signed: true,
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      path: '/api',
    },
    getToken: (request) => request.headers['x-csrf-token'],
    getUserInfo: (request) => request.accountSessionId ?? '',
    csrfOpts: {
      hmacKey: config.csrfHmacKey,
      validity: 30 * 60 * 1000,
    },
  });

  const repository = new CloudSaveRepository(database);
  await registerAccountRoutes(fastify, { auth, repository, config });
  fastify.get('/healthz', async () => ({ ok: true, service: 'emberveil-accounts' }));
  fastify.addHook('onClose', async () => database.close());
  return { fastify, auth, database, config };
}

async function main() {
  const { fastify, config } = await createAccountServer();
  const address = await fastify.listen({ host: config.host, port: config.port });
  fastify.log.info({ address }, 'Emberveil account service listening');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
