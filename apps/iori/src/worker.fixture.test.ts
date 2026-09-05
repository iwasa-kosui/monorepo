import type { ExecutionContext, Queue } from '@cloudflare/workers-types';
import { Create, exportJwk, fetchDocumentLoader, generateCryptoKeyPair } from '@fedify/fedify';
import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error Node ESM runner has no generated declaration.
import { DEFAULT_STAGING_SMOKE_CHECKS, runCloudflareSmoke } from '../scripts/run-cloudflare-smoke.mjs';
import { ImageId } from './domain/image/imageId.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const origin = 'https://worker.example.invalid';
const imageId = ImageId.generate();
const userId = crypto.randomUUID();
const actorId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const queue = { ack: vi.fn(), retry: vi.fn() };

type FixtureKey = Readonly<{
  keyId: string;
  userId: string;
  type: string;
  privateKey: string;
  publicKey: string;
}>;

type FixtureRows = {
  actor: { actorId: string; uri: string; logoUri: string | null; inboxUrl: string; type: string };
  domainEvents: unknown[];
  instanceActorKeys: Array<Pick<FixtureKey, 'keyId' | 'type' | 'privateKey' | 'publicKey'>>;
  keys: FixtureKey[];
  session: { sessionId: string; userId: string; expires: number };
  user: { userId: string; username: string };
};

/**
 * In-memory D1 fixture for the Worker integration test.  It supports the
 * seeded users, sessions, actors/local_actors, keys, and instance_actor_keys
 * SELECT rows used by the D1 adapters, plus actor-logo/key/event batch writes.
 */
class FixtureD1 {
  readonly rows: FixtureRows;

  constructor(rows: FixtureRows) {
    this.rows = rows;
  }

  prepare(query: string) {
    let params: unknown[] = [];
    const resultRows = () => this.resultRows(query, params);
    const statement = {
      bind: (...values: unknown[]) => {
        params = values;
        return statement;
      },
      first: async <T>() => query.includes('SELECT 1 AS ok') ? { ok: 1 } as T : resultRows()[0] as T | null,
      all: async () => ({ results: resultRows() }),
      raw: async () => this.rawRows(query, params),
      run: async () => {
        this.applyWrite(query, params);
        return { success: true, results: [], meta: {} };
      },
    };
    return statement;
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  private resultRows(query: string, params: unknown[]) {
    if (query.includes('from "sessions"')) {
      return params[0] === this.rows.session.sessionId ? [this.rows.session] : [];
    }
    if (query.includes('from "users"')) {
      return params[0] === this.rows.user.username ? [this.rows.user] : [];
    }
    if (query.includes('from "actors"') && query.includes('"local_actors"')) {
      return params[0] === this.rows.user.userId
        ? [{ ...this.rows.actor, localActorId: this.rows.actor.actorId, userId: this.rows.user.userId }]
        : [];
    }
    if (query.includes('from "keys"')) {
      return this.rows.keys.filter((key) => key.userId === params[0]);
    }
    if (query.includes('from "instance_actor_keys"')) {
      return this.rows.instanceActorKeys.filter((key) => key.type === params[0]).slice(0, 1);
    }
    return [];
  }

  private rawRows(query: string, params: unknown[]) {
    if (query.includes('from "sessions"')) {
      const { session } = this.rows;
      return params[0] === session.sessionId ? [[session.sessionId, session.userId, session.expires]] : [];
    }
    if (query.includes('from "users"')) {
      const { user } = this.rows;
      return params[0] === user.username ? [[user.userId, user.username]] : [];
    }
    if (query.includes('from "actors"') && query.includes('"local_actors"')) {
      const { actor, user } = this.rows;
      return params[0] === user.userId
        ? [[actor.actorId, actor.uri, actor.logoUri, actor.inboxUrl, actor.type, actor.actorId, user.userId]]
        : [];
    }
    if (query.includes('from "keys"')) {
      return this.rows.keys
        .filter((key) => key.userId === params[0])
        .map((key) => [key.keyId, key.userId, key.type, key.privateKey, key.publicKey]);
    }
    if (query.includes('from "instance_actor_keys"')) {
      return this.rows.instanceActorKeys
        .filter((key) => key.type === params[0])
        .slice(0, 1)
        .map((key) => [key.keyId, key.type, key.privateKey, key.publicKey]);
    }
    return [];
  }

  private applyWrite(query: string, params: unknown[]) {
    if (query.startsWith('update "actors" set "logoUri"')) {
      if (params[1] === this.rows.actor.actorId) this.rows.actor.logoUri = String(params[0]);
      return;
    }
    if (query.startsWith('insert into "domain_events"')) {
      this.rows.domainEvents.push(params);
      return;
    }
    if (query.startsWith('insert into "keys"')) {
      const [keyId, userId, type, privateKey, publicKey] = params.map(String);
      this.rows.keys.push({ keyId, userId, type, privateKey, publicKey });
      return;
    }
    if (query.startsWith('insert into "instance_actor_keys"')) {
      const [keyId, type, privateKey, publicKey] = params.map(String);
      this.rows.instanceActorKeys.push({ keyId, type, privateKey, publicKey });
    }
  }
}

const makeSeed = async () => {
  const [rsa, ed25519] = await Promise.all([
    generateCryptoKeyPair('RSASSA-PKCS1-v1_5'),
    generateCryptoKeyPair('Ed25519'),
  ]);
  const [rsaPrivate, rsaPublic, ed25519Private, ed25519Public] = await Promise.all([
    exportJwk(rsa.privateKey),
    exportJwk(rsa.publicKey),
    exportJwk(ed25519.privateKey),
    exportJwk(ed25519.publicKey),
  ]);
  return {
    actor: {
      actorId,
      uri: `${origin}/users/fixture`,
      logoUri: null,
      inboxUrl: `${origin}/users/fixture/inbox`,
      type: 'local',
    },
    domainEvents: [],
    instanceActorKeys: [
      {
        keyId: crypto.randomUUID(),
        type: 'RSASSA-PKCS1-v1_5',
        privateKey: JSON.stringify(rsaPrivate),
        publicKey: JSON.stringify(rsaPublic),
      },
      {
        keyId: crypto.randomUUID(),
        type: 'Ed25519',
        privateKey: JSON.stringify(ed25519Private),
        publicKey: JSON.stringify(ed25519Public),
      },
    ],
    keys: [
      {
        keyId: crypto.randomUUID(),
        userId,
        type: 'RSASSA-PKCS1-v1_5',
        privateKey: JSON.stringify(rsaPrivate),
        publicKey: JSON.stringify(rsaPublic),
      },
      {
        keyId: crypto.randomUUID(),
        userId,
        type: 'Ed25519',
        privateKey: JSON.stringify(ed25519Private),
        publicKey: JSON.stringify(ed25519Public),
      },
    ],
    session: { sessionId, userId, expires: Date.now() + 60_000 },
    user: { userId, username: 'fixture' },
  } satisfies FixtureRows;
};

const makeEnv = (
  db: FixtureD1,
  { smokeQueueToken, send = async () => {} }: { smokeQueueToken?: string; send?: Queue['send'] } = {},
): IoriWorkerEnv => ({
  DB: db as unknown as IoriWorkerEnv['DB'],
  UPLOADS: {
    get: async (key: string) =>
      key.includes(String(imageId))
        ? { body: new TextEncoder().encode('image').buffer, httpMetadata: { contentType: 'image/webp' } }
        : null,
    put: async () => undefined,
    head: async () => null,
  },
  FEDIFY_KV: { get: async () => null },
  FEDIFY_QUEUE: { send, sendBatch: async () => undefined },
  ASSETS: {
    fetch: async (input: RequestInfo | URL) =>
      new URL(String(input)).pathname === '/manifest.json'
        ? new Response('{}', { status: 200 })
        : new Response('Not Found', { status: 404 }),
  },
  ...admissionFixture(new URL(origin).hostname),
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
  VAPID_PUBLIC_KEY: 'fixture-public',
  VAPID_PRIVATE_KEY: 'fixture-private',
  SMOKE_QUEUE_TOKEN: smokeQueueToken,
} as unknown as IoriWorkerEnv);

describe('Worker fixture', () => {
  it('enqueues a fixture marker only through the staging smoke route with its configured token', async () => {
    const send = vi.fn(async () => undefined);
    const env = makeEnv(new FixtureD1(await makeSeed()), { smokeQueueToken: 'fixture-smoke-token', send });
    const context = {} as ExecutionContext;

    const [disabled, unauthorized, accepted] = await Promise.all([
      worker.fetch(
        new Request(`${origin}/__smoke__/queue-enqueue`, { method: 'POST' }),
        makeEnv(new FixtureD1(await makeSeed())),
        context,
      ),
      worker.fetch(
        new Request(`${origin}/__smoke__/queue-enqueue`, {
          method: 'POST',
          headers: { 'x-iori-smoke-token': 'wrong-token' },
        }),
        env,
        context,
      ),
      worker.fetch(
        new Request(`${origin}/__smoke__/queue-enqueue`, {
          method: 'POST',
          headers: { 'x-iori-smoke-token': 'fixture-smoke-token' },
        }),
        env,
        context,
      ),
    ]);

    expect(disabled.status).toBe(503);
    expect(unauthorized.status).toBe(503);
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ accepted: true, queue: { enqueued: 1 } });
    expect(send).toHaveBeenCalledWith({
      type: 'iori-smoke',
      schema: 1,
      environment: 'production',
      generation: 'fixture1',
      mainSha: 'a'.repeat(40),
      runId: 'fixture-run',
    });
  });

  it('runs the unchanged full smoke checklist through real runtime with read-only capabilities', async () => {
    const db = new FixtureD1(await makeSeed());
    const prepared = vi.spyOn(db, 'prepare');
    const env = makeEnv(db, { smokeQueueToken: 'fixture-smoke-token' });
    const baseIdentity = JSON.parse(env.IORI_ADMISSION_IDENTITY!);
    const smokeEnv = {
      ...env,
      IORI_ADMISSION_MODE: 'smoke',
      IORI_ADMISSION_IDENTITY: JSON.stringify({
        ...baseIdentity,
        smoke: {
          username: 'fixture',
          uploadFilename: `${imageId}.webp`,
          articleId: '00000000-0000-4000-8000-000000000000',
        },
      }),
      UPLOADS: {
        ...env.UPLOADS,
        get: async (key: string) =>
          key.startsWith('og/') || key.startsWith('og-images/')
            ? { body: new TextEncoder().encode('png').buffer, httpMetadata: { contentType: 'image/png' } }
            : env.UPLOADS.get(key),
      },
      ASSETS: { fetch: async () => Response.json({ name: 'iori' }) },
    } as unknown as IoriWorkerEnv;
    const checks = DEFAULT_STAGING_SMOKE_CHECKS.map((check: { name: string; path: string }) => ({
      ...check,
      ...(check.name === 'WebFinger'
        ? { path: '/.well-known/webfinger?resource=acct:fixture@worker.example.invalid' }
        : {}),
      ...(check.name === 'actor' ? { path: '/users/fixture' } : {}),
      ...(check.name === 'outbox' ? { path: '/users/fixture/outbox' } : {}),
      ...(check.name === 'upload retrieval'
        ? { path: `/uploads/${imageId}.webp`, expectedContentType: 'image/webp' }
        : {}),
    }));
    const before = JSON.stringify(db.rows);
    const result = await runCloudflareSmoke({
      baseUrl: origin,
      expectedOrigin: origin,
      allowedHostname: new URL(origin).hostname,
      checks,
      smokeQueueToken: 'fixture-smoke-token',
      fetchRequest: (url: URL, init: RequestInit) =>
        worker.fetch(new Request(url, init), smokeEnv, {} as ExecutionContext),
    });
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'actor', ok: true }),
        expect.objectContaining({ name: 'outbox', ok: true }),
      ]),
    );
    expect(result.ok, JSON.stringify(result.checks)).toBe(true);
    expect(JSON.stringify(db.rows)).toBe(before);
    expect(prepared.mock.calls.length).toBeGreaterThan(3);
  });

  it('serves Worker bindings, ActivityPub and WebFinger without DATABASE_URL', async () => {
    const env = makeEnv(new FixtureD1(await makeSeed()));
    const context = {} as ExecutionContext;
    const [health, healthz, readyz, upload, actor, webfinger] = await Promise.all([
      worker.fetch(new Request(`${origin}/health`), env, context),
      worker.fetch(new Request(`${origin}/healthz`), env, context),
      worker.fetch(new Request(`${origin}/readyz`), env, context),
      worker.fetch(new Request(`${origin}/uploads/${imageId}.webp`), env, context),
      worker.fetch(
        new Request(`${origin}/users/fixture`, { headers: { Accept: 'application/activity+json' } }),
        env,
        context,
      ),
      worker.fetch(
        new Request(`${origin}/.well-known/webfinger?resource=acct:fixture@worker.example.invalid`),
        env,
        context,
      ),
    ]);

    expect([health.status, healthz.status, readyz.status, upload.status]).toEqual([200, 200, 200, 200]);
    expect(upload.headers.get('Content-Type')).toBe('image/webp');
    expect(actor.status).toBe(200);
    expect(actor.headers.get('Content-Type')).toContain('application/activity+json');
    await expect(actor.json()).resolves.toMatchObject({ type: 'Person', id: `${origin}/users/fixture` });
    expect(webfinger.status).toBe(200);
    expect(webfinger.headers.get('Content-Type')).toContain('application/jrd+json');
    await expect(webfinger.json()).resolves.toMatchObject({ subject: 'acct:fixture@worker.example.invalid' });
  });

  it('updates the seeded D1 actor logo through Worker fetch', async () => {
    const db = new FixtureD1(await makeSeed());
    const form = new FormData();
    form.set('logoUri', 'https://assets.example.invalid/fixture-logo.png');
    const response = await worker.fetch(
      new Request(`${origin}/users/fixture`, {
        method: 'POST',
        body: form,
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      makeEnv(db),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/users/fixture');
    expect(db.rows.actor.logoUri).toBe('https://assets.example.invalid/fixture-logo.png');
  });

  it('acknowledges a valid fanout and retries an invalid outbox through Worker queue', async () => {
    queue.ack.mockClear();
    queue.retry.mockClear();
    const keyPair = await generateCryptoKeyPair('Ed25519');
    const [privateKey] = await Promise.all([exportJwk(keyPair.privateKey)]);
    const activity = await new Create({
      id: new URL(`${origin}/activities/fixture`),
      actor: new URL(`${origin}/users/fixture`),
    }).toJsonLd({ format: 'compact', contextLoader: fetchDocumentLoader });
    const senderKeys = [{ keyId: `${origin}/users/fixture#main-key`, privateKey }];
    await worker.queue({
      queue: 'iori-production-fixture1-fedify',
      messages: [
        {
          body: {
            type: 'fanout',
            id: crypto.randomUUID(),
            baseUrl: origin,
            keys: senderKeys,
            inboxes: {},
            activity,
            activityId: `${origin}/activities/fixture`,
            activityType: 'https://www.w3.org/ns/activitystreams#Create',
            collectionSync: undefined,
            traceContext: {},
          },
          ack: queue.ack,
          retry: queue.retry,
        },
        {
          body: {
            type: 'outbox',
            id: crypto.randomUUID(),
            baseUrl: origin,
            keys: senderKeys,
            activity,
            activityId: `${origin}/activities/fixture`,
            activityType: 'https://www.w3.org/ns/activitystreams#Create',
            inbox: 'not a URL',
            sharedInbox: false,
            started: new Date(0).toISOString(),
            attempt: 0,
            headers: {},
            traceContext: {},
          },
          ack: queue.ack,
          retry: queue.retry,
        },
      ],
    } as never, makeEnv(new FixtureD1(await makeSeed())));
    expect(queue.ack).toHaveBeenCalledOnce();
    expect(queue.retry).toHaveBeenCalledOnce();
  });
});

it('retries near smoke markers before the real Fedify adapter can implicitly acknowledge unknown types', async () => {
  const env = { ...admissionFixture(), DB: {}, FEDIFY_KV: {}, FEDIFY_QUEUE: {} } as unknown as IoriWorkerEnv;
  const marker = {
    type: 'iori-smoke',
    schema: 1,
    environment: 'production',
    generation: 'fixture1',
    mainSha: 'a'.repeat(40),
    runId: 'fixture-run',
  };
  for (
    const body of [{ ...marker, runId: 'wrong-run' }, { ...marker, generation: 'wrong123' }, { ...marker, schema: 2 }, {
      ...marker,
      extra: true,
    }]
  ) {
    const ack = vi.fn();
    const retry = vi.fn();
    await worker.queue({ queue: 'iori-production-fixture1-fedify', messages: [{ body, ack, retry }] } as never, env);
    expect(retry).toHaveBeenCalledOnce();
    expect(ack).not.toHaveBeenCalled();
  }
});
