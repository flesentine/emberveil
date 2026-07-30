import { fromNodeHeaders } from 'better-auth/node';
import { CloudSaveConflictError } from './cloud-save-core.mjs';
import { parseOrThrow, slotParamSchema, uploadSchema } from './validation.mjs';

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

export async function registerAccountRoutes(fastify, { auth, repository, config }) {
  async function resolveSession(request, reply) {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true },
    });
    if (!session) {
      reply.code(401).send({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
      return null;
    }
    request.accountSession = session;
    request.accountSessionId = session.session.id;
    return session;
  }

  async function requireSession(request, reply) {
    await resolveSession(request, reply);
  }

  function requireTrustedOrigin(request, reply, done) {
    const origin = normalizeOrigin(request.headers.origin ?? '');
    const fetchSite = request.headers['sec-fetch-site'];
    if (!origin || !config.clientOrigins.includes(origin) || (fetchSite && !['same-origin', 'same-site'].includes(fetchSite))) {
      reply.code(403).send({ error: 'Request origin is not trusted.', code: 'ORIGIN_REJECTED' });
      return;
    }
    done();
  }

  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
    async handler(request, reply) {
      try {
        const protocol = request.protocol || (config.production ? 'https' : 'http');
        const url = new URL(request.url, `${protocol}://${request.headers.host}`);
        const response = await auth.handler(
          new Request(url, {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          }),
        );
        reply.code(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        request.log.error({ error }, 'Authentication request failed');
        return reply.code(500).send({ error: 'Authentication service failure.', code: 'AUTH_FAILURE' });
      }
    },
  });

  fastify.get('/api/account/session', { preHandler: requireSession }, async (request) => ({
    user: {
      id: request.accountSession.user.id,
      email: request.accountSession.user.email,
      emailVerified: request.accountSession.user.emailVerified,
      displayLabel: request.accountSession.user.name,
    },
    sessionExpiresAt: request.accountSession.session.expiresAt,
  }));

  fastify.get('/api/csrf', { preHandler: requireSession }, async (request, reply) => ({
    token: await reply.generateCsrf({ userInfo: request.accountSessionId }),
  }));

  fastify.get('/api/cloud-saves', {
    preHandler: requireSession,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request) => ({ slots: repository.list(request.accountSession.user.id) }));

  fastify.get('/api/cloud-saves/:slotId', {
    preHandler: requireSession,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { slotId } = parseOrThrow(slotParamSchema, request.params);
    const result = repository.get(request.accountSession.user.id, slotId);
    if (!result) return reply.code(404).send({ error: 'Cloud slot is empty.', code: 'CLOUD_SLOT_EMPTY' });
    return result;
  });

  fastify.put('/api/cloud-saves/:slotId', {
    preValidation: [requireSession, requireTrustedOrigin],
    preHandler: fastify.csrfProtection,
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { slotId } = parseOrThrow(slotParamSchema, request.params);
    const body = parseOrThrow(uploadSchema, request.body);
    try {
      return repository.put(request.accountSession.user.id, { slotId, ...body });
    } catch (error) {
      if (error instanceof CloudSaveConflictError) {
        return reply.code(409).send({
          error: error.message,
          code: 'CLOUD_SAVE_CONFLICT',
          reason: error.reason,
          cloud: error.current,
        });
      }
      if (error instanceof TypeError) {
        return reply.code(400).send({
          error: 'Cloud save validation failed.',
          code: 'INVALID_CLOUD_SAVE',
          details: error.validationErrors ?? [error.message],
        });
      }
      throw error;
    }
  });

  fastify.get('/api/account/export', {
    preHandler: requireSession,
    config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const data = repository.exportPersonalData(request.accountSession.user.id);
    if (!data) return reply.code(404).send({ error: 'Account not found.', code: 'ACCOUNT_NOT_FOUND' });
    reply.header('Content-Disposition', `attachment; filename="emberveil-personal-data-${new Date().toISOString().slice(0, 10)}.json"`);
    return data;
  });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, 'Account service request failed');
    if (error.statusCode === 429) return reply.code(429).send({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
    if (error.validationErrors) return reply.code(400).send({ error: 'Request validation failed.', code: 'VALIDATION_FAILED', details: error.validationErrors });
    if (typeof error.code === 'string' && error.code.startsWith('FST_CSRF')) return reply.code(403).send({ error: 'Security token rejected. Refresh the account screen.', code: 'CSRF_REJECTED' });
    return reply.code(error.statusCode ?? 500).send({ error: 'Account service request failed.', code: 'REQUEST_FAILED' });
  });
}
