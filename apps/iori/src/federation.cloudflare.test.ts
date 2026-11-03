import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createActorDispatcher } from './adaptor/fedify/actorDispatcherFactory.ts';
import { createOutboxDispatcher } from './adaptor/fedify/outboxDispatcherFactory.ts';
import { ActorId } from './domain/actor/actorId.ts';
import { Instant } from './domain/instant/instant.ts';
import { Post } from './domain/post/post.ts';
import { UserId } from './domain/user/userId.ts';
import { Username } from './domain/user/username.ts';
import {
  createCloudflareFederation,
  createCloudflareFederationRuntime,
  processCloudflareFedifyMessages,
} from './federation.cloudflare.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const workerEnv = {
  DB: {} as never,
  FEDIFY_KV: {} as never,
  FEDIFY_QUEUE: {} as never,
  UPLOADS: {} as never,
  ORIGIN: 'https://worker.example.invalid',
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
} satisfies IoriWorkerEnv;

const parseRuntimePath = async (path: string) => {
  const { federation } = await createCloudflareFederationRuntime(workerEnv, vi.fn());
  const context = federation.createContext(new URL(workerEnv.ORIGIN), undefined);
  return context.parseUri(new URL(`${workerEnv.ORIGIN}${path}`));
};

describe('createCloudflareFederation', () => {
  it('builds a federation with Cloudflare stores', async () => {
    const federation = await createCloudflareFederation({
      origin: 'https://worker.example.invalid',
      kv: {} as never,
      queue: {} as never,
    });

    expect(federation).toBeDefined();
  });

  it('dispatches actor and outbox resources using public user paths', async () => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const username = Username.orThrow('kosui');
    const actor = {
      id: actorId,
      userId,
      type: 'local' as const,
      uri: 'https://worker.example.invalid/users/kosui',
      inboxUrl: 'https://worker.example.invalid/users/kosui/inbox',
    };
    const post = Post.createPost(Instant.now())({
      actorId,
      userId,
      content: 'Hello ActivityPub',
    }).aggregateState;
    const context = {
      getActorKeyPairs: async () => [],
      getActorUri: (identifier: string) => new URL(`https://worker.example.invalid/users/${identifier}`),
      getInboxUri: (identifier?: string) =>
        new URL(`https://worker.example.invalid${identifier === undefined ? '/inbox' : `/users/${identifier}/inbox`}`),
      getOutboxUri: (identifier: string) => new URL(`https://worker.example.invalid/users/${identifier}/outbox`),
      getFollowersUri: (identifier: string) => new URL(`https://worker.example.invalid/users/${identifier}/followers`),
      getObjectUri: (_type: unknown, values: { identifier: string; id: string }) =>
        new URL(`https://worker.example.invalid/users/${values.identifier}/posts/${values.id}`),
    };
    const userResolverByUsername = { resolve: async () => RA.ok({ id: userId, username }) };
    const actorResolverByUserId = { resolve: async () => RA.ok(actor) };
    const actorDispatcher = createActorDispatcher({ userResolverByUsername, actorResolverByUserId });
    const outboxDispatcher = createOutboxDispatcher({
      userResolverByUsername,
      actorResolverByUserId,
      postsResolverByActorId: { resolve: async () => RA.ok([post]) },
    });

    const dispatchedActor = await actorDispatcher.dispatch(context as never, 'kosui');
    const outbox = await outboxDispatcher.dispatch(context as never, 'kosui');

    expect(dispatchedActor?.id?.href).toBe('https://worker.example.invalid/users/kosui');
    expect(outbox.items).toHaveLength(1);
    expect(outbox.items[0]?.objectId?.href).toBe(`https://worker.example.invalid/users/kosui/posts/${post.postId}`);
  });
});

describe('createCloudflareFederationRuntime', () => {
  it.each(
    [
      ['/users/kosui', 'actor'],
      ['/users/kosui/followers', 'followers'],
      ['/users/kosui/outbox', 'outbox'],
      ['/users/kosui/inbox', 'inbox'],
      ['/inbox', 'inbox'],
      ['/users/kosui/posts/019aeb2e-9841-7b49-8329-b144ed0a5a7f', 'object'],
      ['/users/kosui/articles/019aeb2e-9841-7b49-8329-b144ed0a5a7f', 'object'],
    ] as const,
  )('registers the Worker-compatible ActivityPub route %s', async (path, type) => {
    const parsed = await parseRuntimePath(path);

    expect(parsed?.type).toBe(type);
  });

  it('serves NodeInfo 2.1 for iori', async () => {
    const { federation } = await createCloudflareFederationRuntime(workerEnv, vi.fn());

    const response = await federation.fetch(new Request(`${workerEnv.ORIGIN}/nodeinfo/2.1`), {
      contextData: undefined,
      onNotFound: () => new Response('not found', { status: 404 }),
      onNotAcceptable: () => new Response('not acceptable', { status: 406 }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      software: { name: 'iori' },
      protocols: ['activitypub'],
      openRegistrations: false,
      usage: { users: { total: 1 } },
    });
  });
});

describe('Cloudflare Fedify message queue', () => {
  it('does not call sendBatch for an empty enqueueMany and forwards non-empty batches', async () => {
    const sendBatch = vi.fn(async () => undefined);
    const { queue } = await createCloudflareFederationRuntime({
      ...workerEnv,
      FEDIFY_QUEUE: { sendBatch } as never,
    }, vi.fn());

    await queue.enqueueMany?.([]);
    expect(sendBatch).not.toHaveBeenCalled();

    await queue.enqueueMany?.([{ type: 'outbox' }]);
    expect(sendBatch).toHaveBeenCalledOnce();
  });

  describe('enqueueMany batching', () => {
    const outboxMessage = (index: number, size: number) => ({
      type: 'outbox' as const,
      id: `message-${index}`,
      activityType: 'Create',
      inbox: `https://remote${index}.example.invalid/inbox`,
      keys: [{ jwk: 'k'.repeat(size) }],
    });
    const estimate = (message: unknown) => new TextEncoder().encode(JSON.stringify(message)).byteLength + 256;
    const outboxMessageOfBytes = (index: number, bytes: number) =>
      outboxMessage(index, bytes - estimate(outboxMessage(index, 0)));
    const bodiesOf = (sendBatch: ReturnType<typeof vi.fn>) =>
      sendBatch.mock.calls.map((call) => (call[0] as { body: { id: string } }[]).map((request) => request.body));

    it('splits 72 messages of about 7 KB into batches within the count and size limits', async () => {
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());
      const messages = Array.from({ length: 72 }, (_, index) => outboxMessage(index, 7_000));

      await queue.enqueueMany?.(messages);

      const batches = bodiesOf(sendBatch);
      expect(batches.length).toBeGreaterThan(1);
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(100);
        expect(batch.reduce((sum, body) => sum + estimate(body), 0)).toBeLessThanOrEqual(240_000);
      }
      expect(batches.flat().map((body) => body.id)).toEqual(messages.map((message) => message.id));
    });

    it('splits 150 small messages into 100 and 50', async () => {
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());

      await queue.enqueueMany?.(Array.from({ length: 150 }, (_, index) => ({ type: 'outbox', id: `${index}` })));

      expect(bodiesOf(sendBatch).map((batch) => batch.length)).toEqual([100, 50]);
    });

    it('passes contentType json and delaySeconds to every batch', async () => {
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());

      await queue.enqueueMany?.(
        Array.from({ length: 101 }, (_, index) => ({ type: 'outbox', id: `${index}` })),
        { delay: { total: () => 5 } as never },
      );

      expect(sendBatch).toHaveBeenCalledTimes(2);
      for (const call of sendBatch.mock.calls) {
        expect((call[0] as { contentType: string }[])[0]?.contentType).toBe('json');
        expect(call[1]).toEqual({ delaySeconds: 5 });
      }
    });

    it('does not call sendBatch for zero messages', async () => {
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());

      await queue.enqueueMany?.([]);

      expect(sendBatch).not.toHaveBeenCalled();
    });

    it('drops a message over 120,000 bytes with a fixed log and sends the rest', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());
      const oversized = {
        ...outboxMessage(1, 130_000),
        activityId: 'https://worker.example.invalid/users/kosui/posts/abc',
      };

      await expect(queue.enqueueMany?.([outboxMessage(0, 100), oversized, outboxMessage(2, 100)])).resolves
        .toBeUndefined();

      expect(bodiesOf(sendBatch).flat().map((body) => body.id)).toEqual(['message-0', 'message-2']);
      expect(error).toHaveBeenCalledOnce();
      expect(error).toHaveBeenCalledWith('Fedify queue message too large; dropped.', {
        bytes: estimate(oversized),
        type: 'outbox',
        id: 'message-1',
        activityType: 'Create',
        activityId: 'https://worker.example.invalid/users/kosui/posts/abc',
      });
      expect(JSON.stringify(error.mock.calls)).not.toMatch(/kkkk|remote1\.example|jwk/);
      error.mockRestore();
    });

    it('stops after a failed batch, logs a fixed message and rethrows', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      sendBatch.mockResolvedValueOnce(undefined);
      sendBatch.mockRejectedValueOnce(new TypeError('x'.repeat(600)));
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());

      await expect(
        queue.enqueueMany?.(Array.from({ length: 350 }, (_, index) => ({ type: 'outbox', id: `${index}` }))),
      ).rejects.toThrow(TypeError);

      expect(sendBatch).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith('Fedify queue batch send failed.', {
        sentBatches: 1,
        totalBatches: 4,
        name: 'TypeError',
        message: 'x'.repeat(500),
      });
      error.mockRestore();
    });

    it('does not send a single message over 120,000 bytes from enqueue and returns normally', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const send = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { send } as never,
      }, vi.fn());

      await expect(queue.enqueue(outboxMessage(1, 130_000))).resolves.toBeUndefined();

      expect(send).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith('Fedify queue message too large; dropped.', {
        bytes: estimate(outboxMessage(1, 130_000)),
        type: 'outbox',
        id: 'message-1',
        activityType: 'Create',
      });
      error.mockRestore();
    });

    it('sends a message whose estimated size is exactly 120,000 bytes', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());
      const message = outboxMessageOfBytes(0, 120_000);
      expect(estimate(message)).toBe(120_000);

      await queue.enqueueMany?.([message]);

      expect(bodiesOf(sendBatch).flat().map((body) => body.id)).toEqual(['message-0']);
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });

    it('sends messages whose estimated sizes total exactly 240,000 bytes in one sendBatch', async () => {
      const sendBatch = vi.fn(async (..._args: unknown[]) => undefined);
      const { queue } = await createCloudflareFederationRuntime({
        ...workerEnv,
        FEDIFY_QUEUE: { sendBatch } as never,
      }, vi.fn());
      const messages = Array.from({ length: 4 }, (_, index) => outboxMessageOfBytes(index, 60_000));
      expect(messages.reduce((sum, message) => sum + estimate(message), 0)).toBe(240_000);

      await queue.enqueueMany?.(messages);

      expect(bodiesOf(sendBatch).map((batch) => batch.length)).toEqual([4]);
    });
  });

  it('registers enqueue and enqueueMany promises with waitUntil', async () => {
    const send = vi.fn(async () => undefined);
    const sendBatch = vi.fn(async () => undefined);
    const waitUntil = vi.fn();
    const { queue } = await createCloudflareFederationRuntime({
      ...workerEnv,
      FEDIFY_QUEUE: { send, sendBatch } as never,
    }, waitUntil);

    const enqueued = queue.enqueue({ type: 'outbox' });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
    await enqueued;

    const enqueuedMany = queue.enqueueMany?.([{ type: 'outbox' }]);
    expect(waitUntil).toHaveBeenCalledTimes(2);
    expect(waitUntil.mock.calls[1]?.[0]).toBeInstanceOf(Promise);
    await enqueuedMany;
    expect(send).toHaveBeenCalledOnce();
    expect(sendBatch).toHaveBeenCalledOnce();
  });

  it('logs the error name and truncated message without the stack when a fire-and-forget enqueue fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const waitUntil = vi.fn();
    const { queue } = await createCloudflareFederationRuntime({
      ...workerEnv,
      FEDIFY_QUEUE: {
        send: async () => {
          throw new TypeError('x'.repeat(600), { cause: new Error('hidden cause') });
        },
      } as never,
    }, waitUntil);

    void queue.enqueue({ type: 'outbox', secret: 'queue-body' });
    await waitUntil.mock.calls[0]?.[0];
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Fedify queue send failed.', {
      name: 'TypeError',
      message: 'x'.repeat(500),
    });
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/stack|hidden cause|queue-body/);
    error.mockRestore();
  });

  it('propagates the failure to a caller that awaits enqueue', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { queue } = await createCloudflareFederationRuntime({
      ...workerEnv,
      FEDIFY_QUEUE: {
        send: async () => {
          throw new Error('send rejected');
        },
      } as never,
    }, vi.fn());

    await expect(queue.enqueue({ type: 'outbox' })).rejects.toThrow('send rejected');
    error.mockRestore();
  });
});

describe('processCloudflareFedifyMessages', () => {
  it('acks successful messages and retries failures', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages({
      messages: [{ body: { ok: true }, ack }, { body: { fail: true }, retry }],
    } as never, async (message) => {
      if ((message as { fail?: boolean }).fail) throw new Error('fixture failure');
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Fedify queued task failed.', {
      name: 'Error',
      message: 'fixture failure',
    });
    error.mockRestore();
  });

  it('logs the error name and a message truncated to 500 characters without the stack', async () => {
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages({
      messages: [{ body: { secret: 'queue-body' }, retry }],
    } as never, async () => {
      throw new TypeError('x'.repeat(600), { cause: new Error('hidden cause') });
    });

    expect(retry).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    const [label, detail] = error.mock.calls[0] ?? [];
    expect(label).toBe('Fedify queued task failed.');
    expect(detail).toEqual({ name: 'TypeError', message: 'x'.repeat(500) });
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/stack|hidden cause|queue-body/);
    error.mockRestore();
  });

  it('logs only the type name when a non-Error value is thrown', async () => {
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages({
      messages: [{ body: {}, retry }],
    } as never, async () => {
      throw 'Authorization: Bearer secret-token';
    });

    expect(retry).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Fedify queued task failed.', { thrownType: 'string' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-token');
    error.mockRestore();
  });
});
