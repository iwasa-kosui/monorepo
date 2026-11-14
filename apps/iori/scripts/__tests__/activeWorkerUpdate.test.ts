import { beforeEach, expect, it, vi } from 'vitest';

import { operationFailureLines } from '../operation-diagnostics.mjs';
import { updateActiveWorker } from '../update-active-worker.mjs';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  worker: vi.fn(),
  version: vi.fn(),
  deploy: vi.fn(),
}));
vi.mock(
  '../target-control-plane.mjs',
  () => ({
    createTargetControlPlane: () => ({
      readActiveResources: mocks.read,
      readActiveWorker: mocks.worker,
      readCurrentVersion: mocks.version,
    }),
  }),
);
vi.mock('../deploy-reviewed-worker-version.mjs', () => ({ deployReviewedWorkerVersion: mocks.deploy }));
import { expectedTargetFixture } from './migrationTargetFixture.js';
const target = expectedTargetFixture();
const resource = {
  consumerId: target.resources.consumer.id,
  queuePaused: false,
  queueConfiguration: {
    settings: { delivery_paused: false },
    consumers: [{ id: 'same' }],
    producers: [{ name: 'same' }],
  },
  dlqConfiguration: { settings: { delivery_paused: true } },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(resource);
  mocks.worker.mockResolvedValue({ routeConfiguration: [{ id: 'same', pattern: 'example/*' }] });
  mocks.version.mockResolvedValue('previous');
  mocks.deploy.mockResolvedValue('next');
});
const options = () => ({
  expectedTarget: target,
  currentCodeSha: 'b'.repeat(40),
  token: 'fixture',
  zoneId: 'a'.repeat(32),
  signal: new AbortController().signal,
  checkMain: vi.fn(async () => {}),
});
it.each(['consumer', 'Queue', 'route', 'deploy'])(
  'stops %s uncertainty without retry or automatic restoration',
  async failure => {
    if (failure === 'consumer') mocks.read.mockResolvedValueOnce({ ...resource, consumerId: 'other' });
    if (failure === 'Queue') {
      mocks.read.mockResolvedValueOnce(resource).mockResolvedValueOnce({
        ...resource,
        queueConfiguration: { settings: { delivery_paused: true } },
      });
    }
    if (failure === 'route') {
      mocks.worker.mockResolvedValueOnce({ routeConfiguration: [{ id: 'same' }] }).mockResolvedValueOnce({
        routeConfiguration: [{ id: 'other' }],
      });
    }
    if (failure === 'deploy') mocks.deploy.mockRejectedValueOnce(new Error('uncertain'));
    await expect(updateActiveWorker(options())).rejects.toThrow();
    expect(mocks.deploy.mock.calls.length).toBeLessThanOrEqual(1);
  },
);
it.each([
  ['the Queue read before deploy', 'deploy-worker-before'],
  ['the Queue read after deploy', 'deploy-worker-after'],
  ['the deploy itself', 'deploy-worker-deploy'],
])('reports the stage for a failure in %s', async (failure, expected) => {
  if (failure === 'the Queue read before deploy') mocks.read.mockRejectedValueOnce(new Error('read'));
  if (failure === 'the Queue read after deploy') {
    mocks.read.mockResolvedValueOnce(resource).mockRejectedValueOnce(new Error('read'));
  }
  if (failure === 'the deploy itself') mocks.deploy.mockRejectedValueOnce(new Error('uncertain'));
  let stage = 'deploy-worker-before';
  await expect(updateActiveWorker({ ...options(), onStage: next => (stage = next) })).rejects.toThrow();
  expect(stage).toBe(expected);
});
it('reports the D1 migration stage and does not read the Worker after the migration fails', async () => {
  mocks.deploy.mockImplementationOnce(async ({ onStage }: { onStage: (stage: string) => void }) => {
    onStage('deploy-worker-migrate');
    throw Object.assign(new Error('D1 migration failed; retain current state.'), {
      diagnostic: { reason: 'command-failed' },
    });
  });
  let stage = 'deploy-worker-before';
  const failure = await updateActiveWorker({ ...options(), onStage: next => (stage = next) }).catch(
    (error: unknown) => error,
  );
  expect(stage).toBe('deploy-worker-migrate');
  expect(operationFailureLines(stage, failure)).toEqual([
    'IORI_DIAG stage=deploy-worker-migrate program=none exit=none signal=none reason=command-failed',
  ]);
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
