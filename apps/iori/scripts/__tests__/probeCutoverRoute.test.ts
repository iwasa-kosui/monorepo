import { beforeEach, expect, it, vi } from 'vitest';

import { probeFailureLines, ProbeRestoreFailure } from '../cutover-diagnostics.mjs';
import { rehearsalTargetKey } from '../migration-target-contract.mjs';
import { probeCutoverRoute } from '../probe-cutover-route.mjs';
import { preparationFixture, targetOutputsFixture } from './migrationTargetFixture.js';

const mocks = {
  setup: vi.fn(),
  loadTarget: vi.fn(),
  getIfExists: vi.fn(),
  storageFactory: vi.fn(),
  readRecord: vi.fn(),
  readSealed: vi.fn(),
  readVersion: vi.fn(),
  established: vi.fn(),
  planRoute: vi.fn(),
  planQueueResume: vi.fn(),
  changeRoute: vi.fn(),
  changeQueuePause: vi.fn(),
  prepare: vi.fn(),
  transition: vi.fn(),
  smoke: vi.fn(),
  terraformArgs: undefined as { onStage: (stage: string) => void } | undefined,
};
const calls: string[] = [];
const stages: string[] = [];
const readTerraformKeys: string[] = [];
const terraformFactory = (args: { onStage: (stage: string) => void }) => {
  mocks.terraformArgs = args;
  return new Proxy({
    initializeEstablished: mocks.established,
    planRoute: mocks.planRoute,
    planQueueResume: mocks.planQueueResume,
    changeRoute: mocks.changeRoute,
    changeQueuePause: mocks.changeQueuePause,
    prepare: mocks.prepare,
  }, {
    get: (fakes, key) => {
      readTerraformKeys.push(String(key));
      return Reflect.get(fakes, key);
    },
  });
};
const resources = { d1Id: 'db', kvId: 'kv', queueId: 'queue', dlqId: 'dlq', consumerId: 'consumer' };
beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === 'function') mock.mockReset();
  calls.length = 0;
  stages.length = 0;
  readTerraformKeys.length = 0;
  const { config, outputs, target } = targetOutputsFixture();
  mocks.setup.mockReturnValue({ ...config, token: 'cloudflare-token' });
  mocks.loadTarget.mockResolvedValue(target);
  mocks.getIfExists.mockResolvedValue(Buffer.from('{}'));
  mocks.storageFactory.mockReturnValue({ getIfExists: mocks.getIfExists });
  mocks.readRecord.mockResolvedValue({ record: preparationFixture(), sha256: 'x' });
  mocks.readSealed.mockImplementation(async () => {
    calls.push('read-sealed');
    return { resources, worker: {} };
  });
  mocks.readVersion.mockImplementation(async () => {
    calls.push('read-version');
    return 'current-version';
  });
  mocks.established.mockResolvedValue(outputs);
  mocks.planRoute.mockImplementation(async () => {
    mocks.terraformArgs!.onStage('route-plan');
    calls.push('plan-route');
    return { path: 'route' };
  });
  mocks.planQueueResume.mockImplementation(async () => {
    mocks.terraformArgs!.onStage('queue-plan');
    calls.push('plan-queue');
    return { path: 'queue' };
  });
  mocks.transition.mockImplementation(async input => {
    calls.push(input.mode);
    return { versionId: `${input.mode}-version` };
  });
  mocks.smoke.mockImplementation(async () => {
    calls.push('smoke');
  });
});
const invoke = (signal: AbortSignal = new AbortController().signal) =>
  probeCutoverRoute({
    env: {
      IORI_PRIVATE_DIRECTORY: '/fixture',
      IORI_SMOKE_QUEUE_TOKEN: 'smoke-token',
      IORI_MIGRATION_EXPECTED_TARGET_PATH: '/target.json',
    },
    startedAt: Date.now(),
    signal,
  }, {
    setup: mocks.setup,
    loadTarget: mocks.loadTarget,
    storageFactory: mocks.storageFactory,
    readRecord: mocks.readRecord,
    readSealed: mocks.readSealed,
    readVersion: mocks.readVersion,
    terraformFactory: terraformFactory as never,
    transition: mocks.transition,
    smoke: mocks.smoke,
    onStage: stage => stages.push(stage),
  });
const rejection = (signal?: AbortSignal) => invoke(signal).then(() => undefined, (error: unknown) => error);
const expectNoCutoverMutation = () => {
  expect(mocks.changeRoute).not.toHaveBeenCalled();
  expect(mocks.changeQueuePause).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.transition.mock.calls.map(([input]) => input.mode)).not.toContain('active');
};
it('plans the route and the Queue resume, then moves sealed to smoke and back around one smoke', async () => {
  await expect(invoke()).resolves.toEqual({ probed: true });
  expect(calls).toEqual([
    'read-version',
    'read-sealed',
    'plan-route',
    'plan-queue',
    'smoke',
    'smoke',
    'sealed',
    'read-sealed',
  ]);
  expect(mocks.transition.mock.calls[0][0]).toMatchObject({
    mode: 'smoke',
    expectedVersionId: 'current-version',
    routePresent: false,
    admissionEnvironment: { IORI_ADMISSION_MODE: 'sealed' },
  });
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({
    mode: 'sealed',
    expectedVersionId: 'smoke-version',
    routePresent: false,
    admissionEnvironment: { IORI_ADMISSION_MODE: 'smoke' },
  });
  expect(mocks.readSealed.mock.calls[1][0].expectedVersionId).toBe('sealed-version');
  expect(mocks.readSealed.mock.calls[1][0].record).toEqual(preparationFixture());
  expectNoCutoverMutation();
});
it('reports every probe stage in order', async () => {
  await invoke();
  expect(stages).toEqual([
    'inputs',
    'rehearsal-gate',
    'tf-init',
    'read-sealed',
    'route-plan',
    'queue-plan',
    'to-smoke',
    'smoke-worker',
    'to-sealed',
    'read-final',
  ]);
});
it('reads the rehearsal mark of the target generation from the transfer bucket and plans with the established bindings', async () => {
  await invoke();
  const { target, outputs } = targetOutputsFixture();
  expect(mocks.getIfExists).toHaveBeenCalledWith(rehearsalTargetKey(target), 65536);
  expect(mocks.storageFactory.mock.calls[0][2]).toBe(true);
  expect(mocks.planRoute).toHaveBeenCalledWith({ establishedBindings: outputs.workerBindings });
  expect(mocks.planQueueResume).toHaveBeenCalledWith({ establishedBindings: outputs.workerBindings });
});
it('stops without reading Terraform when the generation has no rehearsal mark', async () => {
  mocks.getIfExists.mockResolvedValue(null);
  const error = await rejection();
  expect(error).toMatchObject({ diagnostic: { reason: 'rehearsal-missing' } });
  expect(stages.at(-1)).toBe('rehearsal-gate');
  expect(mocks.established).not.toHaveBeenCalled();
  expect(mocks.readVersion).not.toHaveBeenCalled();
  expect(mocks.readSealed).not.toHaveBeenCalled();
  expect(mocks.transition).not.toHaveBeenCalled();
  expect(mocks.smoke).not.toHaveBeenCalled();
  expect(probeFailureLines('rehearsal-gate', error, false)).toEqual([
    'IORI_DIAG stage=probe-rehearsal-gate program=none exit=none signal=none reason=rehearsal-missing',
  ]);
});
it('reads the sealed state against the version now deployed instead of the version in the record', async () => {
  await invoke();
  const record = preparationFixture();
  expect(mocks.readVersion).toHaveBeenCalledTimes(1);
  expect(mocks.readVersion.mock.calls[0][0]).toMatchObject({ token: 'cloudflare-token' });
  expect(mocks.readSealed.mock.calls[0][0]).toMatchObject({ record, expectedVersionId: 'current-version' });
  expect(mocks.readSealed.mock.calls[0][0].expectedVersionId).not.toBe(record.observed.worker_version_id);
});
it('completes when the deployed version differs from the record version, as in a second probe of one generation', async () => {
  const record = preparationFixture();
  mocks.readVersion.mockResolvedValue('after-first-probe-version');
  await expect(invoke()).resolves.toEqual({ probed: true });
  expect(record.observed.worker_version_id).not.toBe('after-first-probe-version');
  expect(mocks.readSealed.mock.calls.map(([input]) => input.expectedVersionId)).toEqual([
    'after-first-probe-version',
    'sealed-version',
  ]);
  expect(mocks.transition.mock.calls[0][0]).toMatchObject({ expectedVersionId: 'after-first-probe-version' });
});
it('passes only the Worker hostname to the smoke and never the canonical hostname', async () => {
  await invoke();
  expect(mocks.smoke).toHaveBeenCalledTimes(1);
  const { target } = targetOutputsFixture();
  expect(mocks.smoke.mock.calls[0][0]).toMatchObject({
    target,
    hostname: target.admission.workerHostname,
    token: 'smoke-token',
  });
  expect(mocks.smoke.mock.calls[0][0].hostname).not.toBe(target.admission.hostname);
});
it('returns to sealed after a failed smoke and reports the smoke failure at its stage', async () => {
  const failure = new Error('Reviewed smoke failed.');
  mocks.smoke.mockRejectedValueOnce(failure);
  const error = await rejection();
  expect(error).toBe(failure);
  expect(stages.at(-1)).toBe('smoke-worker');
  expect(calls).toEqual(['read-version', 'read-sealed', 'plan-route', 'plan-queue', 'smoke', 'sealed']);
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({ mode: 'sealed', expectedVersionId: 'smoke-version' });
  expect(probeFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=probe-smoke-worker program=none exit=none signal=none reason=smoke-failed',
  ]);
  expectNoCutoverMutation();
});
it('reports the smoke failure first and then the return failure when the smoke and the return both fail', async () => {
  const smokeFailure = new Error('Reviewed smoke failed.');
  mocks.smoke.mockRejectedValueOnce(smokeFailure);
  const restoreFailure = new Error('Reviewed Worker deployment failed; retain current state.');
  mocks.transition.mockResolvedValueOnce({ versionId: 'smoke-version' }).mockRejectedValueOnce(restoreFailure);
  const error = await rejection();
  expect(error).toBeInstanceOf(ProbeRestoreFailure);
  expect(error).toMatchObject({ failure: smokeFailure, failedStage: 'smoke-worker', restoreFailure });
  expect(stages.at(-1)).toBe('to-sealed');
  expect(probeFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=probe-smoke-worker program=none exit=none signal=none reason=smoke-failed',
    'IORI_DIAG stage=probe-to-sealed program=none exit=none signal=none reason=deploy-failed',
  ]);
});
it('only reads the planning and initialization methods of the Terraform adapter', async () => {
  await invoke();
  expect([...new Set(readTerraformKeys)].sort()).toEqual(['initializeEstablished', 'planQueueResume', 'planRoute']);
  expectNoCutoverMutation();
});
it('returns to sealed from the deployed version when the move to smoke fails after the version changed', async () => {
  const failure = new Error('fixture');
  mocks.transition.mockRejectedValueOnce(failure);
  mocks.readVersion.mockResolvedValueOnce('current-version').mockResolvedValueOnce('changed-version');
  expect(await rejection()).toBe(failure);
  expect(mocks.readVersion).toHaveBeenCalledTimes(2);
  expect(mocks.transition).toHaveBeenCalledTimes(2);
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({
    mode: 'sealed',
    expectedVersionId: 'changed-version',
    routePresent: false,
    admissionEnvironment: { IORI_ADMISSION_MODE: 'smoke' },
  });
  expect(stages.at(-1)).toBe('to-smoke');
  expect(stages).toContain('to-sealed');
  expect(mocks.smoke).not.toHaveBeenCalled();
  expectNoCutoverMutation();
});
it('does not return to sealed when the move to smoke fails and the version did not change', async () => {
  const failure = new Error('fixture');
  mocks.transition.mockRejectedValueOnce(failure);
  expect(await rejection()).toBe(failure);
  expect(mocks.readVersion).toHaveBeenCalledTimes(2);
  expect(mocks.transition).toHaveBeenCalledTimes(1);
  expect(stages).not.toContain('to-sealed');
  expect(stages.at(-1)).toBe('to-smoke');
  expect(mocks.smoke).not.toHaveBeenCalled();
});
it('does not return to sealed when the move to smoke fails and the version cannot be read', async () => {
  const failure = new Error('fixture');
  mocks.transition.mockRejectedValueOnce(failure);
  mocks.readVersion.mockResolvedValueOnce('current-version').mockRejectedValueOnce(new Error('unreadable'));
  expect(await rejection()).toBe(failure);
  expect(mocks.transition).toHaveBeenCalledTimes(1);
  expect(stages).not.toContain('to-sealed');
  expect(stages.at(-1)).toBe('to-smoke');
});
it('reports the move failure first and then the return failure when the move to smoke and the return both fail', async () => {
  const failure = new Error('Reviewed Worker deployment failed; retain current state.');
  const restoreFailure = new Error('Reviewed Worker deployment failed; retain current state.');
  mocks.transition.mockRejectedValueOnce(failure).mockRejectedValueOnce(restoreFailure);
  mocks.readVersion.mockResolvedValueOnce('current-version').mockResolvedValueOnce('changed-version');
  const error = await rejection();
  expect(error).toMatchObject({ failure, failedStage: 'to-smoke', restoreFailure });
  expect(probeFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=probe-to-smoke program=none exit=none signal=none reason=deploy-failed',
    'IORI_DIAG stage=probe-to-sealed program=none exit=none signal=none reason=deploy-failed',
  ]);
});
it('returns to sealed with a signal detached from the probe after the probe signal aborted during the smoke', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  mocks.smoke.mockImplementationOnce(async () => {
    controller.abort();
    throw new Error('Reviewed smoke failed.');
  });
  await rejection(controller.signal);
  const restoreSignal = mocks.transition.mock.calls[1][0].signal as AbortSignal;
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({ mode: 'sealed' });
  expect(mocks.transition.mock.calls[0][0].signal.aborted).toBe(true);
  expect(restoreSignal.aborted).toBe(false);
  expect(timeout).toHaveBeenCalledWith(15 * 60_000);
  timeout.mockRestore();
});
it('returns to sealed with a detached signal after the probe signal aborted during a successful smoke', async () => {
  const controller = new AbortController();
  mocks.smoke.mockImplementationOnce(async () => {
    controller.abort();
  });
  await expect(invoke(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({ mode: 'sealed' });
  expect(mocks.transition.mock.calls[1][0].signal.aborted).toBe(false);
});
it('returns to sealed with a detached signal after the probe signal aborted during the move to smoke', async () => {
  const controller = new AbortController();
  mocks.transition.mockImplementationOnce(async () => {
    controller.abort();
    throw controller.signal.reason;
  });
  mocks.readVersion.mockResolvedValueOnce('current-version').mockResolvedValueOnce('changed-version');
  await rejection(controller.signal);
  expect(mocks.readVersion.mock.calls[1][0].signal.aborted).toBe(false);
  expect(mocks.transition.mock.calls[1][0]).toMatchObject({ mode: 'sealed', expectedVersionId: 'changed-version' });
  expect(mocks.transition.mock.calls[1][0].signal.aborted).toBe(false);
});
const failAt = (stage: string, mock: ReturnType<typeof vi.fn>) =>
  mock.mockImplementationOnce(async () => {
    mocks.terraformArgs!.onStage(stage);
    throw new Error('fixture');
  });
it.each([
  ['read-sealed', () => mocks.readSealed.mockRejectedValueOnce(new Error('fixture'))],
  ['route-plan', () => failAt('route-plan', mocks.planRoute)],
  ['queue-plan', () => failAt('queue-plan', mocks.planQueueResume)],
])('does not touch the Worker admission when the %s stage fails', async (stage, arrange) => {
  arrange();
  await expect(invoke()).rejects.toThrow('fixture');
  expect(stages.at(-1)).toBe(stage);
  expect(mocks.transition).not.toHaveBeenCalled();
  expect(mocks.smoke).not.toHaveBeenCalled();
});
it('rejects a target that differs from the Terraform outputs before any plan', async () => {
  const { target } = targetOutputsFixture();
  mocks.loadTarget.mockResolvedValue({
    ...target,
    resources: { ...target.resources, d1: { id: 'other', name: target.resources.d1.name } },
  });
  expect(await rejection()).toMatchObject({ diagnostic: { reason: 'mismatch' } });
  expect(stages.at(-1)).toBe('read-sealed');
  expect(mocks.planRoute).not.toHaveBeenCalled();
  expect(mocks.transition).not.toHaveBeenCalled();
});
it('rejects an invocation whose run ID differs from the target', async () => {
  const { config } = targetOutputsFixture();
  mocks.setup.mockReturnValue({ ...config, runId: 'other-run', token: 'cloudflare-token' });
  expect(await rejection()).toMatchObject({ diagnostic: { reason: 'mismatch' } });
  expect(stages.at(-1)).toBe('inputs');
  expect(mocks.getIfExists).not.toHaveBeenCalled();
});
it('stops after the final readback fails without further transitions', async () => {
  mocks.readSealed.mockResolvedValueOnce({ resources }).mockRejectedValueOnce(new Error('fixture'));
  await expect(invoke()).rejects.toThrow('fixture');
  expect(stages.at(-1)).toBe('read-final');
  expect(mocks.transition).toHaveBeenCalledTimes(2);
  expectNoCutoverMutation();
});
it('refuses to start when the hosted job budget is exhausted', async () => {
  await expect(
    probeCutoverRoute({ env: {}, startedAt: Date.now() - 331 * 60_000, signal: new AbortController().signal }, {
      setup: mocks.setup,
    }),
  ).rejects.toThrow('budget');
  expect(mocks.loadTarget).not.toHaveBeenCalled();
});
