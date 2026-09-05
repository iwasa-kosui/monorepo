import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error The smoke runner is executed directly by Node as ESM.
import { DEFAULT_STAGING_SMOKE_CHECKS, formatSmokeResult, runCloudflareSmoke } from '../run-cloudflare-smoke.mjs';

const fixtureBody = 'fixture response body that must never be logged';
const fixtureSmokeToken = 'fixture-smoke-token';

const send = (response: ServerResponse, status: number, contentType: string, body: unknown): void => {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const respond = (request: IncomingMessage, response: ServerResponse): void => {
  const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname;

  if (path === '/health') return send(response, 200, 'text/plain', fixtureBody);
  if (path === '/healthz') return send(response, 200, 'application/json', { ok: true, service: 'iori' });
  if (path === '/readyz') {
    return send(response, 200, 'application/json', {
      ok: true,
      bindings: { database: true, r2: true, kv: true, queue: true, assets: true, auth: true },
    });
  }
  if (path === '/manifest.json') return send(response, 200, 'application/json', { name: 'iori' });
  if (path === '/api/v1/home') return send(response, 401, 'application/json', { error: 'Unauthorized' });
  if (path === '/.well-known/webfinger') {
    return send(response, 200, 'application/jrd+json', { subject: 'acct:iori-smoke@example.invalid', links: [] });
  }
  if (path === '/users/iori-smoke') {
    return send(response, 200, 'application/activity+json', { id: 'actor', type: 'Person' });
  }
  if (path === '/users/iori-smoke/outbox') {
    return send(response, 200, 'application/activity+json', { id: 'outbox', type: 'OrderedCollection' });
  }
  if (path === '/inbox') return send(response, 405, 'application/json', { error: 'Method Not Allowed' });
  if (path === '/uploads/00000000-0000-4000-8000-000000000000.png') {
    return send(response, 200, 'image/png', 'png-fixture');
  }
  if (path === '/api/og/articles/00000000-0000-4000-8000-000000000000') {
    return send(response, 200, 'image/png', 'png-fixture');
  }
  if (path === '/__smoke__/queue-enqueue') {
    if (request.method !== 'POST') return send(response, 405, 'application/json', { error: 'Method Not Allowed' });
    if (request.headers['x-iori-smoke-token'] !== fixtureSmokeToken) {
      return send(response, 401, 'application/json', { error: 'Unauthorized' });
    }
    return send(response, 200, 'application/json', { accepted: true, queue: { enqueued: 1 } });
  }
  if (path === '/api/v1/push/vapid-public-key') {
    return send(response, 200, 'application/json', { publicKey: 'fixture-public-key' });
  }
  return send(response, 404, 'application/json', { error: 'Not Found' });
};

const servers: ReturnType<typeof createServer>[] = [];

const startFixture = async (): Promise<string> => {
  const server = createServer(respond);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server did not expose a TCP address');
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      })
    ),
  );
});

describe('runCloudflareSmoke', () => {
  it('runs the complete staging checklist against local fixture D1, R2, KV, and Queue bindings', async () => {
    const baseUrl = await startFixture();

    const result = await runCloudflareSmoke({
      baseUrl,
      expectedOrigin: baseUrl,
      checks: DEFAULT_STAGING_SMOKE_CHECKS,
      smokeQueueToken: fixtureSmokeToken,
      allowLocalFixture: true,
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check: { name: string }) => check.name)).toEqual([
      'health',
      'healthz',
      'readyz',
      'static asset',
      'auth rejection',
      'WebFinger',
      'actor',
      'outbox',
      'inbox',
      'upload retrieval',
      'OGP PNG',
      'Queue enqueue',
      'Web Push public key',
    ]);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'readyz', status: 200, contentType: 'application/json' }),
      expect.objectContaining({ name: 'upload retrieval', status: 200, contentType: 'image/png' }),
      expect.objectContaining({ name: 'OGP PNG', status: 200, contentType: 'image/png' }),
    ]));
  });

  it('fails a 2xx check with the wrong content type without retaining or formatting the response body', async () => {
    const baseUrl = await startFixture();

    const result = await runCloudflareSmoke({
      baseUrl,
      expectedOrigin: baseUrl,
      checks: [...DEFAULT_STAGING_SMOKE_CHECKS, {
        name: 'wrong type',
        path: '/health',
        expectedStatus: 200,
        expectedContentType: 'application/json',
      }],
      smokeQueueToken: fixtureSmokeToken,
      allowLocalFixture: true,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: 'wrong type',
      ok: false,
      status: 200,
      contentType: 'text/plain',
      failure: 'content type mismatch',
    });
    expect(JSON.stringify(result)).not.toContain(fixtureBody);
    expect(formatSmokeResult(result)).not.toContain(fixtureBody);
  });

  it('fails a required 2xx response without exposing its response body', async () => {
    const baseUrl = await startFixture();

    const result = await runCloudflareSmoke({
      baseUrl,
      expectedOrigin: baseUrl,
      checks: [...DEFAULT_STAGING_SMOKE_CHECKS, {
        name: 'missing',
        path: '/missing',
        expectedStatus: 200,
        expectedContentType: 'application/json',
      }],
      smokeQueueToken: fixtureSmokeToken,
      allowLocalFixture: true,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: 'missing',
      ok: false,
      status: 404,
      contentType: 'application/json',
      failure: 'status mismatch',
    });
    expect(JSON.stringify(result)).not.toContain('Not Found');
  });

  it('rejects a cross-origin redirect without retaining either response body or URL', async () => {
    const redirectedOrigin = await startFixture();
    const redirectingOrigin = await startFixture();
    const redirectServer = servers.at(-1);
    if (redirectServer === undefined) throw new Error('redirect fixture server was not created');
    redirectServer.removeAllListeners('request');
    redirectServer.on('request', (_request, response) => {
      response.writeHead(302, { Location: `${redirectedOrigin}/health` });
      response.end(fixtureBody);
    });

    const result = await runCloudflareSmoke({
      baseUrl: redirectingOrigin,
      expectedOrigin: redirectingOrigin,
      checks: [...DEFAULT_STAGING_SMOKE_CHECKS, {
        name: 'redirect',
        path: '/redirect',
        expectedStatus: 200,
        expectedContentType: 'text/plain',
      }],
      smokeQueueToken: fixtureSmokeToken,
      allowLocalFixture: true,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: 'redirect',
      ok: false,
      status: null,
      contentType: null,
      failure: 'request failed',
    });
    expect(JSON.stringify(result)).not.toContain(fixtureBody);
    expect(JSON.stringify(result)).not.toContain(redirectedOrigin);
    expect(formatSmokeResult(result)).not.toContain(redirectedOrigin);
  });

  it('rejects a custom checklist that omits required health and Queue coverage', async () => {
    await expect(runCloudflareSmoke({
      baseUrl: 'https://smoke.example.invalid',
      expectedOrigin: 'https://smoke.example.invalid',
      allowedHostname: 'smoke.example.invalid',
      checks: [{ name: 'one check', path: '/health', expectedStatus: 200, expectedContentType: 'text/plain' }],
    })).rejects.toThrow('mandatory Iori smoke checklist');
  });

  it('accepts production ActivityPub, upload, and article paths without weakening their checks', async () => {
    const baseUrl = 'http://127.0.0.1';
    const checks = DEFAULT_STAGING_SMOKE_CHECKS.map((check: Record<string, unknown> & { name: string }) => {
      if (check.name === 'WebFinger') {
        return { ...check, path: '/.well-known/webfinger?resource=acct:alice@example.com' };
      }
      if (check.name === 'actor') return { ...check, path: '/users/alice' };
      if (check.name === 'outbox') return { ...check, path: '/users/alice/outbox' };
      if (check.name === 'upload retrieval') {
        return {
          ...check,
          path: '/uploads/33333333-3333-4333-8333-333333333333.webp',
          expectedContentType: 'image/webp',
        };
      }
      if (check.name === 'OGP PNG') return { ...check, path: '/api/og/articles/55555555-5555-4555-8555-555555555555' };
      return check;
    });

    await expect(runCloudflareSmoke({
      baseUrl,
      expectedOrigin: baseUrl,
      checks,
      smokeQueueToken: fixtureSmokeToken,
      allowLocalFixture: true,
      fetchRequest: async () => {
        throw new Error('network disabled fixture');
      },
    })).resolves.toEqual(expect.objectContaining({ checks: expect.any(Array) }));
  });

  it('rejects relabeling arbitrary routes as mandatory customizable checks', async () => {
    const checks = DEFAULT_STAGING_SMOKE_CHECKS.map((check: Record<string, unknown> & { name: string }) =>
      check.name === 'actor' ? { ...check, path: '/health' } : check
    );
    await expect(runCloudflareSmoke({
      baseUrl: 'https://smoke.example.invalid',
      expectedOrigin: 'https://smoke.example.invalid',
      allowedHostname: 'smoke.example.invalid',
      checks,
      smokeQueueToken: fixtureSmokeToken,
    })).rejects.toThrow('mandatory Iori smoke checklist');
  });

  it('rejects duplicate mandatory check names that split route and response validation', async () => {
    const actor = DEFAULT_STAGING_SMOKE_CHECKS.find((check: { name: string }) => check.name === 'actor');
    if (actor === undefined) throw new Error('actor smoke check fixture is missing');
    const checks = DEFAULT_STAGING_SMOKE_CHECKS.map((check: Record<string, unknown> & { name: string }) =>
      check.name === 'actor' ? { ...check, path: '/users/iori-smoke/outbox' } : check
    );
    checks.push({
      ...actor,
      path: '/users/iori-smoke',
      json: undefined,
    });

    await expect(runCloudflareSmoke({
      baseUrl: 'https://smoke.example.invalid',
      expectedOrigin: 'https://smoke.example.invalid',
      allowedHostname: 'smoke.example.invalid',
      checks,
      smokeQueueToken: fixtureSmokeToken,
    })).rejects.toThrow('mandatory Iori smoke checklist');
  });

  it.each(['http://smoke.example.invalid', 'https://127.0.0.1', 'https://169.254.169.254'])(
    'rejects unprotected smoke origin %s',
    async (origin) => {
      await expect(runCloudflareSmoke({
        baseUrl: origin,
        expectedOrigin: origin,
        allowedHostname: 'smoke.example.invalid',
        checks: DEFAULT_STAGING_SMOKE_CHECKS,
        smokeQueueToken: fixtureSmokeToken,
      })).rejects.toThrow('protected smoke origin');
    },
  );
});
