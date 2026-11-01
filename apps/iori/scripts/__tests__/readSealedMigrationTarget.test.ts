import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readSealedMigrationTarget } from '../read-sealed-migration-target.mjs';
import { preparationFixture, targetOutputsFixture } from './migrationTargetFixture.js';

const mocks = vi.hoisted(() => ({
  readResources: vi.fn(),
  readSealedWorker: vi.fn(),
}));
vi.mock('../target-control-plane.mjs', () => ({
  createTargetControlPlane: () => ({
    readResources: mocks.readResources,
    readSealedWorker: mocks.readSealedWorker,
  }),
}));

const deployedVersion = 'deployed-version';
const zoneId = 'b'.repeat(32);
const { target } = targetOutputsFixture();
const resources = { d1Id: 'db', kvId: 'kv', queueId: 'queue', dlqId: 'dlq', consumerId: target.resources.consumer.id };
const base = () => ({ expectedTarget: target, record: preparationFixture(), token: 'token', zoneId });

beforeEach(() => {
  mocks.readResources.mockReset();
  mocks.readSealedWorker.mockReset();
  mocks.readResources.mockResolvedValue(resources);
  mocks.readSealedWorker.mockImplementation(async ({ expectedVersionId }: { expectedVersionId: string }) => {
    if (expectedVersionId !== deployedVersion) throw new Error('worker-deployment');
    return { mode: 'sealed' };
  });
});
describe('readSealedMigrationTarget', () => {
  it('checks the deployment against the record version when no expected version is given', async () => {
    const input = base();
    await expect(readSealedMigrationTarget(input)).rejects.toThrow('worker-deployment');
    expect(input.record.observed.worker_version_id).not.toBe(deployedVersion);
    expect(mocks.readSealedWorker.mock.calls[0]![0]).toMatchObject({
      expectedVersionId: input.record.observed.worker_version_id,
    });
  });

  it('passes when the record version is the deployed version', async () => {
    const input = base();
    input.record = { ...input.record, observed: { ...input.record.observed, worker_version_id: deployedVersion } };
    await expect(readSealedMigrationTarget(input)).resolves.toMatchObject({ resources });
  });

  it('checks the deployment against the given expected version instead of the record version', async () => {
    await expect(readSealedMigrationTarget({ ...base(), expectedVersionId: deployedVersion })).resolves.toMatchObject({
      resources,
      worker: { mode: 'sealed' },
    });
    expect(mocks.readSealedWorker.mock.calls[0]![0]).toMatchObject({ expectedVersionId: deployedVersion });
  });

  it('still fails when the given expected version differs from the deployed version', async () => {
    await expect(readSealedMigrationTarget({ ...base(), expectedVersionId: 'other-version' }))
      .rejects.toThrow('worker-deployment');
  });

  it('still rejects a consumer that differs from the target', async () => {
    mocks.readResources.mockResolvedValue({ ...resources, consumerId: 'other-consumer' });
    await expect(readSealedMigrationTarget({ ...base(), expectedVersionId: deployedVersion }))
      .rejects.toThrow('Prepared consumer mismatch.');
    expect(mocks.readSealedWorker).not.toHaveBeenCalled();
  });
});
