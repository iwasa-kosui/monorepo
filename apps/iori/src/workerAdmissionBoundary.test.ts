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
    await worker.queue({ messages: [{ body: {} }], retryAll } as never, env);
  }
  expect(retryAll).toHaveBeenCalledTimes(3);
  expect(createWorkerRuntimePorts).not.toHaveBeenCalled();
  expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
});
it('handles only the exact active marker as a no-op and retains ordinary federation handling', async () => {
  const env = admissionFixture();
  const identity = parseAdmission(env)!;
  const ack = vi.fn();
  await worker.queue({ messages: [{ body: smokeMarker(identity), ack }] } as never, env as never);
  expect(ack).toHaveBeenCalledOnce();
  expect(processCloudflareFedifyQueueBatch).not.toHaveBeenCalled();
  await worker.queue(
    { messages: [{ body: { ...smokeMarker(identity), runId: 'different' }, ack }] } as never,
    env as never,
  );
  expect(processCloudflareFedifyQueueBatch).toHaveBeenCalledOnce();
  expect(ack).toHaveBeenCalledOnce();
});
