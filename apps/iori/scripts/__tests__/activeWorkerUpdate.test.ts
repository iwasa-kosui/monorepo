import { beforeEach, expect, it, vi } from 'vitest';

import { updateActiveWorker } from '../update-active-worker.mjs';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  worker: vi.fn(),
  version: vi.fn(),
  record: vi.fn(),
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
vi.mock('../target-preparation-record.mjs', () => ({ readPreparationRecord: mocks.record }));
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
  storage: {} as never,
  token: 'fixture',
  zoneId: 'a'.repeat(32),
  signal: new AbortController().signal,
  checkMain: vi.fn(async () => {}),
});
it('keeps immutable migration identity while recording a different reviewed code revision', async () => {
  const input = options();
  const original = structuredClone(target);
  await expect(updateActiveWorker(input)).resolves.toMatchObject({
    currentCodeSha: input.currentCodeSha,
    migrationMainSha: target.identity.main_sha,
    previousVersion: 'previous',
    versionId: 'next',
  });
  expect(target).toEqual(original);
  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.deploy).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'active',
      admissionEnvironment: expect.objectContaining({ IORI_ADMISSION_MODE: 'active' }),
    }),
  );
  expect(input.checkMain).toHaveBeenCalledTimes(2);
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
