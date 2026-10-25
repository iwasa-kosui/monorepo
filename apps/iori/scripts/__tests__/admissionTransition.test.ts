import { writeFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

import { createTargetIdentity } from '../fresh-target.mjs';
import { transitionWorkerAdmission } from '../transition-worker-admission.mjs';
const mocks = vi.hoisted(() => ({ read: vi.fn(), pause: vi.fn(), config: vi.fn() }));
vi.mock(
  '../target-control-plane.mjs',
  () => ({ createTargetControlPlane: () => ({ readWorkerAdmission: mocks.read, readQueuePause: mocks.pause }) }),
);
vi.mock('../temporary-worker-config.mjs', () => ({ createDeploymentWorkerConfig: mocks.config }));
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
});
beforeEach(() => vi.clearAllMocks());
it('does not skip sealed-to-smoke ordering or deploy after readback failure', async () => {
  const input = {
    identity,
    resources: {} as never,
    token: 'private',
    admissionEnvironment: { IORI_ADMISSION_MODE: 'sealed' },
    zoneId: 'zone',
    expectedVersionId: 'version',
    mode: 'active' as const,
  };
  await expect(transitionWorkerAdmission(input)).rejects.toThrow('invalid');
  mocks.read.mockRejectedValueOnce(new Error('readback unavailable'));
  await expect(transitionWorkerAdmission({ ...input, mode: 'smoke' })).rejects.toThrow();
  expect(mocks.config).not.toHaveBeenCalled();
});
it('uses the reviewed deployment command and rechecks the actual emitted version after transition', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'admission-test-')), 'wrangler.json');
  const admissionEnvironment = {
    IORI_ADMISSION_MODE: 'sealed',
    IORI_ADMISSION_IDENTITY: 'fixture-identity',
    ORIGIN: 'https://staging.test',
  };
  await writeFile(
    path,
    JSON.stringify({
      name: identity.workerName,
      vars: { ...admissionEnvironment, IORI_ADMISSION_MODE: 'smoke' },
      d1_databases: [{ database_id: 'db' }],
      kv_namespaces: [{ id: 'kv' }],
      r2_buckets: [{ bucket_name: identity.names.uploads }],
      queues: { producers: [{ queue: identity.names.queue }] },
    }),
  );
  mocks.config.mockResolvedValue({ path, cleanup: vi.fn() });
  mocks.read.mockResolvedValue({ mode: 'smoke' });
  const command = vi.fn(async (bin, args, options) => {
    expect(bin).toBe('pnpm');
    expect(args).toEqual(['exec', 'wrangler', 'deploy', '--config', path, '--minify']);
    writeFileSync(
      (options as { env: Record<string, string> }).env.WRANGLER_OUTPUT_FILE_PATH!,
      JSON.stringify({ type: 'deploy', version: 1, worker_name: identity.workerName, version_id: 'version2' }),
    );
    return { status: 0, stdout: 'private diagnostic', stderr: '' };
  });
  await expect(
    transitionWorkerAdmission({
      identity,
      resources: { d1Id: 'db', kvId: 'kv', queueId: 'queue' } as never,
      token: 'private',
      admissionEnvironment,
      zoneId: 'zone',
      expectedVersionId: 'version1',
      mode: 'smoke',
      runCommand: command,
    }),
  ).resolves.toEqual({ mode: 'smoke' });
  expect(mocks.read).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedVersionId: 'version2',
      admissionEnvironment: { ...admissionEnvironment, IORI_ADMISSION_MODE: 'smoke' },
    }),
  );
  expect(mocks.pause).toHaveBeenCalledWith({ queueId: 'queue', paused: true });
});
