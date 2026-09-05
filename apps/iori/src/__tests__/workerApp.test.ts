import { describe, expect, it } from 'vitest';

import { createWorkerApp } from '../workerApp.tsx';
import type { IoriWorkerEnv } from '../workerEnv.ts';

const env = {
  DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
  UPLOADS: { get: async () => null, put: async () => undefined, head: async () => null },
  FEDIFY_KV: { get: async () => null },
  FEDIFY_QUEUE: { send: async () => undefined },
  ASSETS: { fetch: async () => new Response('{}', { status: 200 }) },
  ORIGIN: 'https://example.invalid',
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
} as unknown as IoriWorkerEnv;

describe('createWorkerApp', () => {
  it('creates a request-safe Worker app without DATABASE_URL', async () => {
    const app = await createWorkerApp(env);

    const response = await app.request('https://example.invalid/health');

    expect(await response.text()).toBe('OK');
  });
});
