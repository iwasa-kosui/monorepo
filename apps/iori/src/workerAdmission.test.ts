import { describe, expect, it, vi } from 'vitest';

import { admissionFixture } from './testing/admissionFixture.ts';
import { admitWorkerRequest, isSmokeMarker, parseAdmission, smokeMarker } from './workerAdmission.ts';

describe('Worker admission', () => {
  it('fails closed for absent, malformed and inconsistent identity', async () => {
    for (
      const env of [{}, { IORI_ADMISSION_MODE: 'active' }, { ...admissionFixture(), IORI_ADMISSION_MODE: 'unknown' }, {
        ...admissionFixture(),
        ORIGIN: 'https://other.test',
      }]
    ) {
      expect(parseAdmission(env)).toBeUndefined();
    }
  });
  it('seals anonymous reads and writes before bindings are accessed', async () => {
    const touch = vi.fn(() => {
      throw Error('binding touched');
    });
    const env = {
      ...admissionFixture(),
      IORI_ADMISSION_MODE: 'sealed',
      get DB() {
        return touch();
      },
    };
    for (const method of ['GET', 'POST']) {
      expect(await admitWorkerRequest(new Request('https://worker.test/health', { method }), env)).toBeUndefined();
    }
    expect(touch).not.toHaveBeenCalled();
  });
  it('protects workers.dev even when production is active', async () => {
    const env = { ...admissionFixture(), SMOKE_QUEUE_TOKEN: 's'.repeat(32) };
    expect(await admitWorkerRequest(new Request('https://worker.test/health'), env)).toMatchObject({
      capability: 'active',
    });
    const url = 'https://iori-production-fixture1.fixture.workers.dev/health';
    expect(await admitWorkerRequest(new Request(url), env)).toBeUndefined();
    expect(
      await admitWorkerRequest(new Request(url, { headers: { 'x-iori-smoke-token': env.SMOKE_QUEUE_TOKEN } }), env),
    ).toMatchObject({ capability: 'smoke' });
    expect(
      await admitWorkerRequest(
        new Request(url.replace('/health', '/api/v1/posts'), {
          method: 'POST',
          headers: { 'x-iori-smoke-token': env.SMOKE_QUEUE_TOKEN },
        }),
        env,
      ),
    ).toBeUndefined();
  });
  it('separates active staging access from read-only smoke', async () => {
    const env = {
      ...admissionFixture('worker.test', 'staging'),
      SMOKE_QUEUE_TOKEN: 's'.repeat(32),
      STAGING_ACCESS_TOKEN: 'a'.repeat(32),
    };
    const request = (header: string, token: string) =>
      new Request('https://worker.test/api/v1/posts', { method: 'POST', headers: { [header]: token } });
    expect(await admitWorkerRequest(request('x-iori-smoke-token', env.SMOKE_QUEUE_TOKEN), env)).toBeUndefined();
    expect(await admitWorkerRequest(request('x-iori-staging-token', env.STAGING_ACCESS_TOKEN), env)).toMatchObject({
      capability: 'active',
    });
    expect(
      await admitWorkerRequest(request('x-iori-staging-token', env.STAGING_ACCESS_TOKEN), {
        ...env,
        IORI_ADMISSION_MODE: 'smoke',
      }),
    ).toBeUndefined();
  });
  it('recognizes only the exact run-bound marker', () => {
    const identity = parseAdmission(admissionFixture())!;
    const marker = smokeMarker(identity);
    expect(isSmokeMarker(marker, identity)).toBe(true);
    for (
      const bad of [{ ...marker, runId: 'other' }, { ...marker, generation: 'other123' }, { ...marker, extra: true }, {
        type: 'iori-smoke',
      }]
    ) expect(isSmokeMarker(bad, identity)).toBe(false);
  });
});
