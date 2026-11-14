import { WorkersMessageQueue } from '@fedify/cfworkers';
import { SendActivityError } from '@fedify/fedify';
import { FetchError } from '@fedify/vocab-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  createCloudflareFederationRuntime,
  decideQueueFailureAction,
  processCloudflareFedifyMessages,
  processCloudflareFedifyQueueBatch,
  type QueueMessageType,
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
      sendBatch.mock.calls.map((call) =>
        (call[0] as { body: { __fedify_payload__: { id: string } } }[]).map((request) =>
          request.body.__fedify_payload__
        )
      );

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
        errorMessage: 'x'.repeat(500),
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
      errorMessage: 'x'.repeat(500),
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
    } as never, async (message, recordMessageType) => {
      recordMessageType('outbox');
      if ((message as { fail?: boolean }).fail) throw new Error('fixture failure');
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(error).toHaveBeenCalledWith('Fedify queued task failed.', {
      name: 'Error',
      errorMessage: 'fixture failure',
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
    expect(detail).toEqual({ name: 'TypeError', errorMessage: 'x'.repeat(500) });
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

describe('decideQueueFailureAction', () => {
  const sendActivityError = (statusCode: number) =>
    new SendActivityError(new URL('https://remote.example.invalid/inbox'), statusCode, `HTTP ${statusCode}`, '');

  it.each([500, 502, 503, 408, 429])('retries a %i response with the delay of the attempt', (statusCode) => {
    expect(decideQueueFailureAction(sendActivityError(statusCode), 1, 'outbox')).toEqual({
      type: 'retry',
      delaySeconds: 60,
    });
    expect(decideQueueFailureAction(sendActivityError(statusCode), 2, 'outbox')).toEqual({
      type: 'retry',
      delaySeconds: 600,
    });
    expect(decideQueueFailureAction(sendActivityError(statusCode), 3, 'outbox')).toEqual({
      type: 'retry',
      delaySeconds: 3600,
    });
  });

  it.each([400, 401, 403, 404, 410, 422, 499])('retries a %i response once and then drops it', (statusCode) => {
    expect(decideQueueFailureAction(sendActivityError(statusCode), 1, 'outbox')).toEqual({
      type: 'retry',
      delaySeconds: 60,
    });
    expect(decideQueueFailureAction(sendActivityError(statusCode), 2, 'outbox')).toEqual({
      type: 'drop',
      reason: 'clientError',
      statusCode,
    });
    expect(decideQueueFailureAction(sendActivityError(statusCode), 3, 'outbox')).toEqual({
      type: 'drop',
      reason: 'clientError',
      statusCode,
    });
  });

  it('treats errors without a status code as retryable', () => {
    expect(decideQueueFailureAction(new TypeError('fetch failed'), 2, 'outbox')).toEqual({
      type: 'retry',
      delaySeconds: 600,
    });
    expect(decideQueueFailureAction('thrown string', 3, 'outbox')).toEqual({ type: 'retry', delaySeconds: 3600 });
  });

  it.each(['outbox', 'fanout'] as const)('applies the delay of the attempt to a %s message', (messageType) => {
    expect(decideQueueFailureAction(new TypeError('fetch failed'), 1, messageType)).toEqual({
      type: 'retry',
      delaySeconds: 60,
    });
    expect(decideQueueFailureAction(sendActivityError(403), 2, messageType)).toEqual({
      type: 'drop',
      reason: 'clientError',
      statusCode: 403,
    });
  });

  it.each(['inbox', 'task', undefined] as const)(
    'retries a %s message without a delay and never drops it',
    (messageType) => {
      for (const attempts of [1, 2, 3]) {
        expect(decideQueueFailureAction(new TypeError('fetch failed'), attempts, messageType)).toEqual({
          type: 'retry',
        });
        expect(decideQueueFailureAction(sendActivityError(403), attempts, messageType)).toEqual({ type: 'retry' });
      }
    },
  );
});

const fetchTimeout = (url = 'https://slow.example/users/a') => {
  const error = new FetchError(url, 'Timed out after 10000 ms');
  error.cause = new DOMException('The document loader timed out after 10000 ms.', 'TimeoutError');
  return error;
};

describe('decideQueueFailureAction for inbox fetch timeouts', () => {
  it('retries an inbox fetch timeout once with delaySeconds 60 and then drops it', () => {
    expect(decideQueueFailureAction(fetchTimeout(), 1, 'inbox')).toEqual({ type: 'retry', delaySeconds: 60 });
    for (const attempts of [2, 3]) {
      expect(decideQueueFailureAction(fetchTimeout(), attempts, 'inbox')).toEqual({
        type: 'drop',
        reason: 'fetchTimeout',
        url: 'https://slow.example/users/a',
      });
    }
  });

  it('keeps retrying an inbox FetchError that is not a timeout', () => {
    const notFound = new FetchError('https://slow.example/users/a', 'HTTP 500');
    expect(decideQueueFailureAction(notFound, 3, 'inbox')).toEqual({ type: 'retry' });
  });

  it.each(['task', undefined] as const)('does not drop a fetch timeout in a %s message', (messageType) => {
    expect(decideQueueFailureAction(fetchTimeout(), 3, messageType)).toEqual({ type: 'retry' });
  });

  it.each(['outbox', 'fanout'] as const)(
    'applies the delivery delays to a fetch timeout in a %s message',
    (messageType) => {
      expect(decideQueueFailureAction(fetchTimeout(), 2, messageType)).toEqual({ type: 'retry', delaySeconds: 600 });
      expect(decideQueueFailureAction(fetchTimeout(), 3, messageType)).toEqual({ type: 'retry', delaySeconds: 3600 });
    },
  );
});

describe('processCloudflareFedifyMessages retry delays', () => {
  const sendActivityError = (statusCode: number) =>
    new SendActivityError(new URL('https://remote.example.invalid/inbox'), statusCode, `HTTP ${statusCode}`, '');

  const run = async (failure: unknown, attempts?: number, messageType: QueueMessageType | undefined = 'outbox') => {
    const ack = vi.fn();
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages({
      messages: [{ body: {}, ack, retry, ...(attempts === undefined ? {} : { attempts }) }],
    } as never, async (_body, recordMessageType) => {
      recordMessageType(messageType);
      throw failure;
    });
    const logged = [...error.mock.calls];
    error.mockRestore();
    return { ack, retry, logged };
  };

  it('retries only the failed message in a batch where the first fails and the second succeeds', async () => {
    const first = { body: { fail: true }, attempts: 1, ack: vi.fn(), retry: vi.fn() };
    const second = { body: { fail: false }, attempts: 1, ack: vi.fn(), retry: vi.fn() };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages(
      { messages: [first, second] } as never,
      async (message, recordMessageType) => {
        recordMessageType('outbox');
        if ((message as { fail?: boolean }).fail) throw sendActivityError(503);
      },
    );
    error.mockRestore();

    expect(first.retry).toHaveBeenCalledOnce();
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(first.ack).not.toHaveBeenCalled();
    expect(second.ack).toHaveBeenCalledOnce();
    expect(second.retry).not.toHaveBeenCalled();
  });

  it('retries a message of unknown type without delaySeconds when the task fails before the type is recorded', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages({
      messages: [{ body: {}, ack, retry, attempts: 2 }],
    } as never, async () => {
      throw new Error('unreadable body');
    });
    error.mockRestore();

    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith();
    expect(ack).not.toHaveBeenCalled();
  });

  it('acks a 403 SendActivityError on attempt 2 without retrying and logs the status code', async () => {
    const { ack, retry, logged } = await run(sendActivityError(403), 2);

    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
    expect(logged).toContainEqual([
      'Fedify queued task dropped after a client error response.',
      { statusCode: 403, attempts: 2 },
    ]);
  });

  it('treats a message without attempts as attempt 1', async () => {
    const { retry } = await run(new Error('boom'));

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });
});

describe('processCloudflareFedifyQueueBatch', () => {
  const message = { type: 'outbox', id: 'message-1', inbox: 'https://remote.example.invalid/inbox' };
  const bodies = [
    ['an unwrapped body of the old format', message],
    ['a body wrapped by WorkersMessageQueue', { __fedify_ordering_key__: undefined, __fedify_payload__: message }],
    [
      'a body wrapped by WorkersMessageQueue with an ordering key',
      { __fedify_ordering_key__: 'remote.example.invalid', __fedify_payload__: message },
    ],
  ] as const;

  const spyOnProcessQueuedTask = async () => {
    const { federation } = await createCloudflareFederationRuntime(workerEnv, vi.fn());
    return vi.spyOn(Object.getPrototypeOf(federation), 'processQueuedTask');
  };

  it.each(bodies)('acks and passes the same message to processQueuedTask for %s', async (_name, body) => {
    const processQueuedTask = (await spyOnProcessQueuedTask()).mockResolvedValue(undefined);
    const ack = vi.fn();
    const retry = vi.fn();

    await processCloudflareFedifyQueueBatch({ messages: [{ body, ack, retry }] } as never, workerEnv, vi.fn());

    expect(processQueuedTask).toHaveBeenCalledOnce();
    expect(processQueuedTask).toHaveBeenCalledWith(undefined, message);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    processQueuedTask.mockRestore();
  });

  it('retries without delaySeconds when the body cannot be opened', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const processQueuedTask = (await spyOnProcessQueuedTask()).mockResolvedValue(undefined);
    const ack = vi.fn();
    const retry = vi.fn();
    const processMessage = vi.spyOn(WorkersMessageQueue.prototype, 'processMessage')
      .mockRejectedValue(new Error('unreadable body'));

    await processCloudflareFedifyQueueBatch(
      { messages: [{ body: 'garbage', attempts: 2, ack, retry }] } as never,
      workerEnv,
      vi.fn(),
    );

    expect(processQueuedTask).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith();
    expect(ack).not.toHaveBeenCalled();
    processMessage.mockRestore();
    processQueuedTask.mockRestore();
    error.mockRestore();
  });
});
