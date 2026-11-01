import { beforeEach, expect, it, vi } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { cutoverFailureLines } from '../cutover-diagnostics.mjs';
import { cutoverMigration } from '../cutover-migration.mjs';
// @ts-expect-error The smoke diagnostics module is executed directly by Node as ESM.
import { SMOKE_ITEM_WORDS, SMOKE_MAX_DETAIL_LINES, smokeFailureDetails } from '../smoke-diagnostics.mjs';
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
  terraformArgs: undefined as { onStage: (stage: string) => void } | undefined,
}));
vi.mock('../restore-and-verify-migration.mjs', () => ({ restoreAndVerifyMigration: mocks.restore }));
vi.mock('../migration-target-setup.mjs', () => ({ targetSetupConfiguration: mocks.setup }));
vi.mock('../reviewed-main.mjs', () => ({ assertReviewedMain: mocks.main }));
vi.mock('../source-control-ssh.mjs', () => ({ createSourceSshAdapter: async () => ({ status: mocks.status }) }));
vi.mock(
  '../target-terraform.mjs',
  () => ({
    createTargetTerraform: (args: { onStage: (stage: string) => void }) => {
      mocks.terraformArgs = args;
      return {
        initializeEstablished: mocks.established,
        changeRoute: mocks.route,
        changeQueuePause: mocks.queue,
      };
    },
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
const stages: string[] = [];
const smokeToken = 'fixture-smoke-queue-token-0123';
const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|terraform|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  stages.length = 0;
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
    mocks.terraformArgs!.onStage('route-plan');
    mocks.terraformArgs!.onStage('route-apply');
    calls.push('route');
  });
  mocks.queue.mockImplementation(async () => {
    mocks.terraformArgs!.onStage('queue-plan');
    mocks.terraformArgs!.onStage('queue-apply');
    calls.push('resume-Queue-last');
  });
  mocks.smoke.mockImplementation(async () => {
    calls.push('full-smoke');
  });
  mocks.active.mockResolvedValue({ consumerId: 'consumer' });
});
const invoke = (
  deps: Partial<Parameters<typeof cutoverMigration>[1]> = {},
  env: Record<string, string> = { IORI_PRIVATE_DIRECTORY: '/fixture', IORI_SMOKE_QUEUE_TOKEN: smokeToken },
) =>
  cutoverMigration({
    env,
    startedAt: Date.now(),
    signal: new AbortController().signal,
  }, { onStage: stage => stages.push(stage), ...deps });
const rejection = () => invoke().then(() => undefined, (error: unknown) => error);
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
const allStages = [
  'inputs',
  'main-check',
  'restore',
  'tf-init',
  'target-check',
  'source',
  'gate-smoke',
  'to-smoke',
  'smoke-worker',
  'gate-route',
  'read-smoke',
  'route-plan',
  'route-apply',
  'read-route',
  'smoke-canonical',
  'gate-active',
  'to-active',
  'gate-queue',
  'read-active',
  'queue-plan',
  'queue-apply',
  'read-resume',
  'smoke-final',
];
it('reports every cutover stage in order', async () => {
  await invoke();
  expect(stages).toEqual(allStages);
  expect(mocks.terraformArgs!.onStage).toBeTypeOf('function');
});
it.each([
  ['verify', 'restore'],
  ['source', 'gate-smoke'],
  ['smoke', 'smoke-worker'],
  ['route', 'route-plan'],
  ['active', 'to-active'],
])('stops %s failure without Queue resume or rollback and records the failed stage', async (failure, stage) => {
  if (failure === 'verify') mocks.restore.mockRejectedValueOnce(new Error('fixture'));
  if (failure === 'source') mocks.status.mockResolvedValueOnce({});
  if (failure === 'smoke') mocks.smoke.mockRejectedValueOnce(new Error('fixture'));
  if (failure === 'route') {
    mocks.route.mockImplementationOnce(async () => {
      mocks.terraformArgs!.onStage('route-plan');
      throw new Error('fixture');
    });
  }
  if (failure === 'active') {
    mocks.transition.mockResolvedValueOnce({ versionId: 'smoke-version' }).mockRejectedValueOnce(
      new Error('fixture'),
    );
  }
  await expect(invoke()).rejects.toThrow();
  expect(stages.at(-1)).toBe(stage);
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.transition.mock.calls.length).toBeLessThanOrEqual(2);
});
it('marks a consumer that differs from the prepared target as mismatch at the gate', async () => {
  mocks.active.mockResolvedValueOnce({ consumerId: 'other' });
  expect(await rejection()).toMatchObject({
    message: 'Cutover consumer mismatch.',
    diagnostic: { reason: 'mismatch' },
  });
  expect(stages.at(-1)).toBe('gate-smoke');
});
it('marks a source that is not drained as source-not-quiescent at the gate', async () => {
  const { config } = targetOutputsFixture();
  mocks.status.mockResolvedValueOnce({
    source_revision: config.mainSha,
    identity: { main_sha: config.mainSha, run_id: config.runId },
    ingress_frozen: true,
    consumer_paused: true,
    queue_failed: false,
    drained: false,
    http_inflight: 0,
    queue_depth: 1,
    dequeue_work: 0,
    enqueue_work: 0,
  });
  expect(await rejection()).toMatchObject({
    message: 'Source quiescence is unavailable.',
    diagnostic: { reason: 'source-not-quiescent' },
  });
  expect(stages.at(-1)).toBe('gate-smoke');
});
it('marks a target that differs from the prepared record as mismatch', async () => {
  const original = mocks.restore.getMockImplementation()!;
  mocks.restore.mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    return { ...result, target: { ...result.target, generation: 'other' } };
  });
  expect(await rejection()).toMatchObject({
    message: 'Cutover target mismatch.',
    diagnostic: { reason: 'mismatch' },
  });
  expect(stages.at(-1)).toBe('target-check');
});
it('marks an activated Queue consumer that differs from the prepared target as mismatch', async () => {
  for (let gate = 0; gate < 4; gate += 1) mocks.active.mockResolvedValueOnce({ consumerId: 'consumer' });
  mocks.active.mockResolvedValueOnce({ consumerId: 'other' });
  expect(await rejection()).toMatchObject({
    message: 'Activated consumer mismatch.',
    diagnostic: { reason: 'mismatch' },
  });
  expect(stages.at(-1)).toBe('read-resume');
});
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
        env: { IORI_PRIVATE_DIRECTORY: '/fixture', IORI_SMOKE_QUEUE_TOKEN: smokeToken },
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
const failedSmoke = (statusOf: (name: string) => number = () => 503, skip?: string) =>
  Object.assign(new Error('Reviewed smoke failed.'), {
    diagnostic: {
      reason: 'smoke-failed',
      details: [
        'smoke-token-ok',
        ...smokeFailureDetails(
          Object.keys(SMOKE_ITEM_WORDS).filter(name => name !== skip).map(name => ({
            name,
            ok: false,
            status: statusOf(name),
            contentType: 'text/plain',
            failure: 'status mismatch',
          })),
        ),
      ],
    },
  });
const retryDeps = () => ({
  sleep: vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>(async () => {}),
  report: vi.fn(),
  now: vi.fn(() => 0),
});
const workerSmokeCalls = () => {
  const { target } = targetOutputsFixture();
  return mocks.smoke.mock.calls.filter(([input]) => input.hostname === target.admission.workerHostname);
};
const retryLine = (attempt: number) =>
  `IORI_DIAG stage=cutover-smoke-worker program=none exit=none signal=none reason=smoke-retry-${attempt}-all-503`;
it.each([
  ['', 'smoke-token-empty'],
  [' padded-smoke-queue-token ', 'smoke-token-space'],
  ['short', 'smoke-token-short'],
  ['a'.repeat(1025), 'smoke-token-long'],
])('stops at inputs with %s before restoring when the smoke token is %j', async (token, reason) => {
  const error = await invoke({}, { IORI_PRIVATE_DIRECTORY: '/fixture', IORI_SMOKE_QUEUE_TOKEN: token }).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toMatchObject({ message: 'Smoke queue token is malformed.', diagnostic: { reason } });
  expect(JSON.stringify([(error as Error).message, (error as { diagnostic: unknown }).diagnostic])).not.toContain(
    'padded',
  );
  expect(mocks.restore).not.toHaveBeenCalled();
  expect(stages.at(-1)).toBe('inputs');
});
it('stops at inputs before restoring when the smoke token is missing', async () => {
  expect(await invoke({}, { IORI_PRIVATE_DIRECTORY: '/fixture' }).then(() => undefined, (thrown: unknown) => thrown))
    .toMatchObject({ diagnostic: { reason: 'smoke-token-empty' } });
  expect(mocks.restore).not.toHaveBeenCalled();
  expect(stages.at(-1)).toBe('inputs');
});
it('retries the Worker smoke while every item is 503 and keeps the stage order', async () => {
  const deps = retryDeps();
  mocks.smoke.mockRejectedValueOnce(failedSmoke()).mockRejectedValueOnce(failedSmoke());
  await invoke(deps);
  expect(workerSmokeCalls()).toHaveLength(3);
  expect(mocks.smoke).toHaveBeenCalledTimes(5);
  expect(deps.sleep.mock.calls).toEqual([[10_000, expect.any(AbortSignal)], [20_000, expect.any(AbortSignal)]]);
  expect(deps.report.mock.calls).toEqual([[retryLine(1)], [retryLine(2)]]);
  expect(stages).toEqual(allStages);
});
it('fails with the last smoke error after four attempts that were all 503', async () => {
  const deps = retryDeps();
  const last = failedSmoke();
  mocks.smoke.mockRejectedValueOnce(failedSmoke()).mockRejectedValueOnce(failedSmoke()).mockRejectedValueOnce(
    failedSmoke(),
  ).mockRejectedValueOnce(last);
  expect(await invoke(deps).then(() => undefined, (thrown: unknown) => thrown)).toBe(last);
  expect(mocks.smoke).toHaveBeenCalledTimes(4);
  expect(deps.sleep.mock.calls.map(([ms]) => ms)).toEqual([10_000, 20_000, 30_000]);
  expect(deps.report.mock.calls).toEqual([[retryLine(1)], [retryLine(2)], [retryLine(3)]]);
  expect(stages.at(-1)).toBe('smoke-worker');
  expect(mocks.route).not.toHaveBeenCalled();
});
it.each([
  ['only some items are 503', failedSmoke(() => 503, 'actor')],
  ['an item has another status', failedSmoke(name => (name === 'actor' ? 500 : 503))],
  ['the error has no details', new Error('fixture')],
  ['the smoke was aborted', Object.assign(new Error('fixture'), { name: 'AbortError' })],
])('does not retry when %s', async (_name, error) => {
  const deps = retryDeps();
  mocks.smoke.mockRejectedValueOnce(error);
  expect(await invoke(deps).then(() => undefined, (thrown: unknown) => thrown)).toBe(error);
  expect(mocks.smoke).toHaveBeenCalledTimes(1);
  expect(deps.sleep).not.toHaveBeenCalled();
  expect(deps.report).not.toHaveBeenCalled();
  expect(stages.at(-1)).toBe('smoke-worker');
});
it('does not retry when the wait would pass 120 seconds from the start', async () => {
  const deps = retryDeps();
  deps.now.mockReturnValueOnce(1_000).mockReturnValue(111_001);
  const error = failedSmoke();
  mocks.smoke.mockRejectedValueOnce(error);
  expect(await invoke(deps).then(() => undefined, (thrown: unknown) => thrown)).toBe(error);
  expect(mocks.smoke).toHaveBeenCalledTimes(1);
  expect(deps.sleep).not.toHaveBeenCalled();
  expect(deps.report).not.toHaveBeenCalled();
});
it('retries when the wait ends exactly at 120 seconds from the start', async () => {
  const deps = retryDeps();
  deps.now.mockReturnValueOnce(1_000).mockReturnValue(111_000);
  mocks.smoke.mockRejectedValueOnce(failedSmoke());
  await invoke(deps);
  expect(deps.sleep).toHaveBeenCalledTimes(1);
  expect(deps.report.mock.calls).toEqual([[retryLine(1)]]);
});
it('does not retry the canonical or the final smoke even when every item is 503', async () => {
  const canonical = failedSmoke();
  const canonicalDeps = retryDeps();
  mocks.smoke.mockResolvedValueOnce({ checks: 13 }).mockRejectedValueOnce(canonical);
  expect(await invoke(canonicalDeps).then(() => undefined, (thrown: unknown) => thrown)).toBe(canonical);
  expect(mocks.smoke).toHaveBeenCalledTimes(2);
  expect(canonicalDeps.sleep).not.toHaveBeenCalled();
  expect(canonicalDeps.report).not.toHaveBeenCalled();
  expect(stages.at(-1)).toBe('smoke-canonical');
  mocks.smoke.mockClear();
  stages.length = 0;
  const final = failedSmoke();
  const finalDeps = retryDeps();
  mocks.smoke.mockResolvedValueOnce({ checks: 13 }).mockResolvedValueOnce({ checks: 13 }).mockRejectedValueOnce(final);
  expect(await invoke(finalDeps).then(() => undefined, (thrown: unknown) => thrown)).toBe(final);
  expect(mocks.smoke).toHaveBeenCalledTimes(3);
  expect(finalDeps.sleep).not.toHaveBeenCalled();
  expect(finalDeps.report).not.toHaveBeenCalled();
  expect(stages.at(-1)).toBe('smoke-final');
});
it('keeps the smoke token out of the retry lines and passes it to every attempt', async () => {
  const deps = retryDeps();
  mocks.smoke.mockRejectedValueOnce(failedSmoke()).mockRejectedValueOnce(failedSmoke());
  await invoke(deps);
  expect(deps.report.mock.calls.flat().join('\n')).not.toContain(smokeToken);
  for (const [input] of workerSmokeCalls()) expect(input.token).toBe(smokeToken);
});
it('keeps the retry lines and the final failure lines within the line limit and the public pattern', async () => {
  const deps = retryDeps();
  mocks.smoke.mockRejectedValue(failedSmoke());
  const error = await invoke(deps).then(() => undefined, (thrown: unknown) => thrown);
  const lines = [
    ...deps.report.mock.calls.map(([line]) => line as string),
    ...cutoverFailureLines(stages.at(-1), error, false),
  ];
  expect(lines).toHaveLength(3 + SMOKE_MAX_DETAIL_LINES + 1);
  expect(lines.at(-1)).toMatch(/reason=smoke-failed$/);
  for (const line of lines) {
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line)).toEqual([]);
  }
  expect(lines.join('\n')).not.toContain(smokeToken);
});
