import { beforeEach, expect, it, vi } from 'vitest';

import { cutoverMigration } from '../cutover-migration.mjs';
import { preparationFixture, targetOutputsFixture } from './migrationTargetFixture.js';
const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  setup: vi.fn(),
  main: vi.fn(),
  status: vi.fn(),
  established: vi.fn(),
  route: vi.fn(),
  queue: vi.fn(),
  read: vi.fn(),
  active: vi.fn(),
  worker: vi.fn(),
  transition: vi.fn(),
  smoke: vi.fn(),
}));
vi.mock('../restore-and-verify-migration.mjs', () => ({ restoreAndVerifyMigration: mocks.restore }));
vi.mock('../migration-target-setup.mjs', () => ({ targetSetupConfiguration: mocks.setup }));
vi.mock('../reviewed-main.mjs', () => ({ assertReviewedMain: mocks.main }));
vi.mock('../source-control-ssh.mjs', () => ({ createSourceSshAdapter: async () => ({ status: mocks.status }) }));
vi.mock(
  '../target-terraform.mjs',
  () => ({
    createTargetTerraform: () => ({
      initializeEstablished: mocks.established,
      changeRoute: mocks.route,
      changeQueuePause: mocks.queue,
    }),
  }),
);
vi.mock(
  '../target-control-plane.mjs',
  () => ({
    createTargetControlPlane: () => ({
      readResources: mocks.active,
      readWorkerAdmission: mocks.read,
      readActiveResources: mocks.active,
      readActiveWorker: mocks.worker,
    }),
  }),
);
vi.mock('../transition-worker-admission.mjs', () => ({ transitionWorkerAdmission: mocks.transition }));
vi.mock('../reviewed-smoke.mjs', () => ({ smokeReviewedTarget: mocks.smoke }));
const calls: string[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  const { config, outputs, target } = targetOutputsFixture();
  mocks.setup.mockReturnValue(config);
  mocks.restore.mockImplementation(async () => {
    calls.push('fresh-restore-actual-verify');
    return {
      target,
      record: preparationFixture(),
      resources: { d1Id: 'db', kvId: 'kv', queueId: 'queue', dlqId: 'dlq', consumerId: 'consumer' },
    };
  });
  mocks.established.mockResolvedValue(outputs);
  mocks.status.mockResolvedValue({
    source_revision: config.mainSha,
    identity: { main_sha: config.mainSha, run_id: config.runId },
    ingress_frozen: true,
    consumer_paused: true,
    queue_failed: false,
    drained: true,
    http_inflight: 0,
    queue_depth: 0,
    dequeue_work: 0,
    enqueue_work: 0,
  });
  mocks.transition.mockImplementation(async input => {
    calls.push(input.mode);
    return { versionId: `${input.mode}-version` };
  });
  mocks.route.mockImplementation(async () => {
    calls.push('route');
  });
  mocks.queue.mockImplementation(async () => {
    calls.push('resume-Queue-last');
  });
  mocks.smoke.mockImplementation(async () => {
    calls.push('full-smoke');
  });
  mocks.active.mockResolvedValue({ consumerId: 'consumer' });
});
const invoke = () =>
  cutoverMigration({
    env: { IORI_PRIVATE_DIRECTORY: '/fixture' },
    startedAt: Date.now(),
    signal: new AbortController().signal,
  });
it('freshly verifies in the same invocation and retains the exact version chain through Queue-last', async () => {
  await invoke();
  expect(calls).toEqual([
    'fresh-restore-actual-verify',
    'smoke',
    'full-smoke',
    'route',
    'full-smoke',
    'active',
    'resume-Queue-last',
    'full-smoke',
  ]);
  expect(mocks.transition.mock.calls[0][0].expectedVersionId).toBe('version');
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({
    expectedVersionId: 'smoke-version',
    routePresent: true,
    admissionEnvironment: { IORI_ADMISSION_MODE: 'smoke' },
  });
  expect(mocks.worker).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 'active-version' }));
});
it.each(['verify', 'source', 'smoke', 'route', 'active'])(
  'stops %s failure without Queue resume or rollback',
  async failure => {
    if (failure === 'verify') mocks.restore.mockRejectedValueOnce(new Error('fixture'));
    if (failure === 'source') mocks.status.mockResolvedValueOnce({});
    if (failure === 'smoke') mocks.smoke.mockRejectedValueOnce(new Error('fixture'));
    if (failure === 'route') mocks.route.mockRejectedValueOnce(new Error('fixture'));
    if (failure === 'active') {
      mocks.transition.mockResolvedValueOnce({ versionId: 'smoke-version' }).mockRejectedValueOnce(
        new Error('fixture'),
      );
    }
    await expect(invoke()).rejects.toThrow();
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.transition.mock.calls.length).toBeLessThanOrEqual(2);
  },
);
it('does not allocate all job time to restoration or restart the first-step clock', async () => {
  await expect(
    cutoverMigration({ env: {}, startedAt: Date.now() - 331 * 60_000, signal: new AbortController().signal }),
  ).rejects.toThrow('budget');
  expect(mocks.restore).not.toHaveBeenCalled();
});
it('refuses activation when fresh verification consumes its reserved budget', async () => {
  const startedAt = Date.now();
  const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
  const original = mocks.restore.getMockImplementation()!;
  mocks.restore.mockImplementation(async (...args) => {
    const result = await original(...args);
    now.mockReturnValue(startedAt + 331 * 60_000);
    return result;
  });
  try {
    await expect(
      cutoverMigration({
        env: { IORI_PRIVATE_DIRECTORY: '/fixture' },
        startedAt,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('budget');
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled();
  } finally {
    now.mockRestore();
  }
});
it('requires canonical full smoke while still in smoke mode before any active or Queue operation', async () => {
  mocks.smoke.mockResolvedValueOnce({ checks: 13 }).mockRejectedValueOnce(new Error('canonical fixture failure'));
  await expect(invoke()).rejects.toThrow('canonical fixture failure');
  expect(mocks.smoke.mock.calls[1][0].hostname).toBe('blog.test');
  expect(mocks.transition).toHaveBeenCalledTimes(1);
  expect(mocks.transition.mock.calls[0][0].mode).toBe('smoke');
  expect(mocks.route).toHaveBeenCalledTimes(1);
  expect(mocks.queue).not.toHaveBeenCalled();
});
