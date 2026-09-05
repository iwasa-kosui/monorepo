import type { ExecutionContext } from '@cloudflare/workers-types';
import { expect, it, vi } from 'vitest';

import { processCloudflareFedifyQueueBatch } from './federation.cloudflare.ts';
import { createWorkerRuntimePorts } from './runtime/workerRuntime.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import { parseAdmission, smokeMarker } from './workerAdmission.ts';
vi.mock('./runtime/workerRuntime.ts', () => ({ createWorkerRuntimePorts: vi.fn() }));
vi.mock('./federation.cloudflare.ts', () => ({ processCloudflareFedifyQueueBatch: vi.fn() }));
it('does not construct runtime for malformed, sealed or unauthenticated smoke requests and retries sealed Queue deliveries', async () => {
  const retryAll = vi.fn();
  for (const mode of ['sealed', 'smoke', 'invalid']) {
    const env = { ...admissionFixture(), IORI_ADMISSION_MODE: mode } as never;
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch(
        new Request('https://worker.test/health', { method }),
        env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    await worker.queue({ queue: 'iori-production-fixture1-fedify', messages: [{ body: {} }], retryAll } as never, env);
  }
  expect(retryAll).toHaveBeenCalledTimes(3);
  expect(createWorkerRuntimePorts).not.toHaveBeenCalled();
  expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
});
it('handles only the exact active marker as a no-op and retries reserved near-matches', async () => {
  const env = admissionFixture();
  const identity = parseAdmission(env)!;
  const ack = vi.fn();
  const retry = vi.fn();
  await worker.queue(
    { queue: 'iori-production-fixture1-fedify', messages: [{ body: smokeMarker(identity), ack }] } as never,
    env as never,
  );
  expect(ack).toHaveBeenCalledOnce();
  expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
  await worker.queue(
    {
      queue: 'iori-production-fixture1-fedify',
      messages: [{ body: { ...smokeMarker(identity), runId: 'different' }, ack, retry }],
    } as never,
    env as never,
  );
  expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
  expect(retry).toHaveBeenCalledOnce();
  expect(ack).toHaveBeenCalledOnce();
});
it.each([undefined, 'old-wrong-generation-fedify'])(
  'retries a missing or mismatched active Queue identity (%s) before marker acknowledgement',
  async (queue) => {
    vi.clearAllMocks();
    const env = admissionFixture();
    const ack = vi.fn();
    const retryAll = vi.fn();
    await worker.queue(
      { queue, messages: [{ body: smokeMarker(parseAdmission(env)!), ack }], retryAll } as never,
      env as never,
    );
    expect(retryAll).toHaveBeenCalledOnce();
    expect(ack).not.toHaveBeenCalled();
    expect(createWorkerRuntimePorts).not.toHaveBeenCalled();
    expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
  },
);
it('accepts the exact explicit local fixture Queue identity', async () => {
  vi.clearAllMocks();
  const env = { ...admissionFixture('localhost', 'local'), ORIGIN: 'http://localhost:8787' };
  const ack = vi.fn();
  const retryAll = vi.fn();
  await worker.queue(
    {
      queue: 'iori-local-fixture1-fedify',
      messages: [{ body: smokeMarker(parseAdmission(env)!), ack }],
      retryAll,
    } as never,
    env as never,
  );
  expect(ack).toHaveBeenCalledOnce();
  expect(retryAll).not.toHaveBeenCalled();
  expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
});
