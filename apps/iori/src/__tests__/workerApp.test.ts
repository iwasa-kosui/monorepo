import { describe, expect, it } from 'vitest';

import { admissionFixture } from '../testing/admissionFixture.ts';
import { createWorkerApp } from '../workerApp.tsx';
import type { IoriWorkerEnv } from '../workerEnv.ts';

const env = {
  DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
  UPLOADS: { get: async () => null, put: async () => undefined, head: async () => null },
  FEDIFY_KV: { get: async () => null },
  FEDIFY_QUEUE: { send: async () => undefined },
  ASSETS: { fetch: async () => new Response('{}', { status: 200 }) },
  ...admissionFixture('example.invalid'),
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
} as unknown as IoriWorkerEnv;

describe('createWorkerApp', () => {
  it('creates a request-safe Worker app without DATABASE_URL', async () => {
    expect(env).not.toHaveProperty('DATABASE_URL');
    const app = await createWorkerApp(env);

    const response = await app.request('https://example.invalid/health');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });
});
