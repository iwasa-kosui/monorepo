import { beforeEach, expect, it, vi } from 'vitest';

import { adoptCutoverState } from '../adopt-cutover-state.mjs';
import { adoptFailureLines } from '../adopt-diagnostics.mjs';
import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { targetOutputsFixture } from './migrationTargetFixture.js';

const codeSha = 'b'.repeat(40);
const migrationSha = 'a'.repeat(40);
const routeId = 'f'.repeat(32);
const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|terraform|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const invocationEnv = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: codeSha,
  MAIN_SHA: codeSha,
  IORI_MIGRATION_MAIN_SHA: migrationSha,
  IORI_OPERATION: 'adopt-cutover-state',
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: 'fixture1',
  IORI_MIGRATION_RUN_ID: 'production-run-001',
  IORI_PRIVATE_DIRECTORY: '/fixture',
};
const mocks = {
  setup: vi.fn(),
  main: vi.fn(),
  init: vi.fn(),
  adopt: vi.fn(),
  resources: vi.fn(),
  version: vi.fn(),
  worker: vi.fn(),
  terraformFactory: vi.fn(),
  controlFactory: vi.fn(),
};
const calls: string[] = [];
const stages: string[] = [];
const reports: string[] = [];
let fixture: ReturnType<typeof targetOutputsFixture>;
const state = (paused: boolean, route: { inState: boolean; id?: string }) => {
  const outputs = structuredClone(fixture.outputs);
  outputs.targetIdentity.queue_settings.delivery_paused = paused;
  return { ...outputs, routeInState: route.inState, routeId: route.id };
};
const cloud = () => {
  mocks.resources.mockImplementation(async () => {
    calls.push('read-resources');
    return { consumerId: 'consumer', queueId: 'queue' };
  });
  mocks.version.mockImplementation(async () => {
    calls.push('read-version');
    return 'version';
  });
  mocks.worker.mockImplementation(async () => {
    calls.push('read-worker');
    return { versionId: 'version', routeConfiguration: [{ id: routeId }] };
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  stages.length = 0;
  reports.length = 0;
  fixture = targetOutputsFixture();
  mocks.setup.mockImplementation((env: Record<string, string>) => {
    calls.push(`setup:${env.MAIN_SHA}`);
    return fixture.config;
  });
  mocks.main.mockImplementation(async (sha: string) => {
    calls.push(`main:${sha}`);
  });
  mocks.init
    .mockImplementationOnce(async () => {
      calls.push('state-read');
      return state(true, { inState: false });
    })
    .mockImplementationOnce(async (input: unknown) => {
      calls.push(`final-check:${JSON.stringify(input)}`);
      return state(false, { inState: true, id: routeId });
    });
  mocks.adopt.mockImplementation(async () => {
    calls.push('adopt-terraform');
    return { imported: true };
  });
  mocks.terraformFactory.mockImplementation((args: { onNotice: (stage: string, word: string) => void }) => ({
    initializeAdoptable: mocks.init,
    adoptCutoverState: async (input: unknown) => {
      args.onNotice('adopt-route-import', 'route-imported');
      args.onNotice('adopt-final-plan', 'plan-clean');
      return mocks.adopt(input);
    },
  }));
  mocks.controlFactory.mockReturnValue({
    readActiveResources: mocks.resources,
    readCurrentVersion: mocks.version,
    readActiveWorker: mocks.worker,
  });
  cloud();
});
const invoke = (env: Record<string, string | undefined> = invocationEnv, startedAt = Date.now()) =>
  adoptCutoverState({ env, startedAt, signal: new AbortController().signal }, {
    setup: mocks.setup,
    checkMain: mocks.main,
    terraformFactory: mocks.terraformFactory,
    controlFactory: mocks.controlFactory,
    report: (line: string) => reports.push(line),
    onStage: (stage: string) => stages.push(stage),
  });
const rejection = () => invoke().then(() => undefined, (error: unknown) => error);
it('checks the code SHA, reads state and Cloudflare, adopts, and reads both back in this order', async () => {
  await expect(invoke()).resolves.toEqual({ adopted: true });
  expect(calls).toEqual([
    `setup:${migrationSha}`,
    `main:${codeSha}`,
    'state-read',
    'read-resources',
    'read-version',
    'read-worker',
    'adopt-terraform',
    'final-check:{"paused":false}',
    'read-resources',
    'read-version',
    'read-worker',
  ]);
  expect(stages).toEqual([
    'adopt-inputs',
    'adopt-main-check',
    'adopt-tf-init',
    'adopt-cloud-read',
    'adopt-final-check',
    'adopt-cloud-reread',
  ]);
});
it('hands the Cloudflare route id and the state Worker bindings to the adoption step', async () => {
  await invoke();
  expect(mocks.adopt).toHaveBeenCalledWith({
    routeId,
    routeInState: false,
    establishedBindings: fixture.outputs.workerBindings,
  });
  expect(mocks.resources).toHaveBeenCalledWith({
    d1Id: 'db',
    kvId: 'kv',
    queueId: 'queue',
    dlqId: 'dlq',
    consumerAttached: true,
  });
  expect(mocks.worker).toHaveBeenCalledWith(
    expect.objectContaining({
      admissionEnvironment: expect.objectContaining({ IORI_ADMISSION_MODE: 'active' }),
      zoneId: fixture.config.zoneId,
      expectedVersionId: 'version',
      routePresent: true,
    }),
  );
});
it('prints the success words as public lines and ends with adopted', async () => {
  await invoke();
  expect(reports).toEqual([
    'IORI_DIAG stage=adopt-route-import program=none exit=none signal=none reason=route-imported',
    'IORI_DIAG stage=adopt-final-plan program=none exit=none signal=none reason=plan-clean',
    'IORI_DIAG stage=adopt-cloud-reread program=none exit=none signal=none reason=adopted',
  ]);
  for (const line of reports) {
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line)).toEqual([]);
  }
});
it('maps the Terraform init stage to the adoption stage and forwards the adoption stages', async () => {
  mocks.terraformFactory.mockImplementationOnce((args: { onStage: (stage: string) => void }) => {
    args.onStage('tf-init');
    args.onStage('adopt-state-read');
    return { initializeAdoptable: mocks.init, adoptCutoverState: mocks.adopt };
  });
  await invoke();
  expect(stages.slice(0, 5)).toEqual([
    'adopt-inputs',
    'adopt-main-check',
    'adopt-tf-init',
    'adopt-tf-init',
    'adopt-state-read',
  ]);
});
it('keeps the final check stage while the final Terraform read reports its own stages', async () => {
  mocks.init.mockReset();
  mocks.terraformFactory.mockImplementationOnce((args: { onStage: (stage: string) => void }) => ({
    initializeAdoptable: async (input?: unknown) => {
      args.onStage('tf-init');
      args.onStage('adopt-state-read');
      return input === undefined
        ? state(true, { inState: false })
        : state(false, { inState: true, id: 'e'.repeat(32) });
    },
    adoptCutoverState: mocks.adopt,
  }));
  const error = await rejection();
  expect(error).toMatchObject({ diagnostic: { reason: 'mismatch' } });
  expect(stages.slice(-2)).toEqual(['adopt-cloud-read', 'adopt-final-check']);
  expect(adoptFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=adopt-final-check program=none exit=none signal=none reason=mismatch',
  ]);
});
it.each([
  [
    'the Queue resources',
    () =>
      mocks.resources.mockRejectedValue(Object.assign(new Error('x'), { diagnostic: { reason: 'queues-http-403' } })),
    'queues-http-403',
  ],
  [
    'the current version',
    () => mocks.version.mockRejectedValue(Object.assign(new Error('x'), { diagnostic: { reason: 'state-mismatch' } })),
    'state-mismatch',
  ],
  [
    'the active Worker',
    () => mocks.worker.mockRejectedValue(Object.assign(new Error('x'), { diagnostic: { reason: 'worker-route' } })),
    'worker-route',
  ],
])('does not touch Terraform state after a failed read of %s', async (_name, fail, reason) => {
  fail();
  const error = await rejection();
  expect(error).toMatchObject({ diagnostic: { reason } });
  expect(mocks.adopt).not.toHaveBeenCalled();
  expect(mocks.init).toHaveBeenCalledTimes(1);
  expect(stages.at(-1)).toBe('adopt-cloud-read');
  expect(reports).toEqual([]);
  for (const line of adoptFailureLines(stages.at(-1), error, false)) expect(line).toMatch(publicLine);
});
it('does not touch Terraform state when the consumer id of Cloudflare differs from the state', async () => {
  mocks.resources.mockResolvedValue({ consumerId: 'other-consumer' });
  const error = await rejection();
  expect(error).toMatchObject({ diagnostic: { reason: 'state-mismatch', details: ['resource-consumer-id'] } });
  expect(mocks.adopt).not.toHaveBeenCalled();
  expect(mocks.worker).not.toHaveBeenCalled();
  expect(adoptFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=adopt-cloud-read program=none exit=none signal=none reason=resource-consumer-id',
    'IORI_DIAG stage=adopt-cloud-read program=none exit=none signal=none reason=state-mismatch',
  ]);
});
it.each([
  ['a short id', [{ id: 'short' }]],
  ['an upper case id', [{ id: 'F'.repeat(32) }]],
  ['a missing id', [{}]],
  ['no route', []],
  ['two routes', [{ id: routeId }, { id: 'e'.repeat(32) }]],
  ['no route list', undefined],
])('rejects %s as route-id-invalid and does not adopt', async (_name, routeConfiguration) => {
  mocks.worker.mockResolvedValue({ versionId: 'version', routeConfiguration });
  expect(await rejection()).toMatchObject({ diagnostic: { reason: 'route-id-invalid' } });
  expect(mocks.adopt).not.toHaveBeenCalled();
  expect(stages.at(-1)).toBe('adopt-cloud-read');
});
it('stops with mismatch when the route id in state after adoption differs from the Cloudflare route id', async () => {
  mocks.init.mockReset();
  mocks.init.mockResolvedValueOnce(state(true, { inState: false })).mockResolvedValueOnce(
    state(false, { inState: true, id: 'e'.repeat(32) }),
  );
  const error = await rejection();
  expect(error).toMatchObject({ diagnostic: { reason: 'mismatch' } });
  expect(stages.at(-1)).toBe('adopt-final-check');
  expect(reports.at(-1)).not.toContain('adopted');
});
it('stops with mismatch when the route is missing from state after adoption', async () => {
  mocks.init.mockReset();
  mocks.init.mockResolvedValueOnce(state(true, { inState: false })).mockResolvedValueOnce(
    state(false, { inState: false }),
  );
  expect(await rejection()).toMatchObject({ diagnostic: { reason: 'mismatch' } });
});
it('stops with mismatch when the state after adoption still describes a paused Queue', async () => {
  mocks.init.mockReset();
  mocks.init.mockResolvedValueOnce(state(true, { inState: false })).mockResolvedValueOnce(
    state(true, { inState: true, id: routeId }),
  );
  expect(await rejection()).toMatchObject({ diagnostic: { reason: 'mismatch' } });
  expect(stages.at(-1)).toBe('adopt-final-check');
});
it('stops with mismatch and does not print adopted when Cloudflare changed during the adoption', async () => {
  let reads = 0;
  mocks.version.mockImplementation(async () => `version-${reads++}`);
  mocks.worker.mockImplementation(async (input: { expectedVersionId: string }) => ({
    versionId: input.expectedVersionId,
    routeConfiguration: [{ id: routeId }],
  }));
  expect(await rejection()).toMatchObject({ diagnostic: { reason: 'mismatch' } });
  expect(stages.at(-1)).toBe('adopt-cloud-reread');
  expect(reports.some(line => line.includes('reason=adopted'))).toBe(false);
});
it('stops before reading Terraform when the reviewed main check fails', async () => {
  mocks.main.mockRejectedValue(Object.assign(new Error('Reviewed main changed.')));
  const error = await rejection();
  expect(adoptFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=adopt-main-check program=none exit=none signal=none reason=reviewed-main-changed',
  ]);
  expect(mocks.terraformFactory).not.toHaveBeenCalled();
});
it.each([
  ['another operation', { IORI_OPERATION: 'deploy-worker' }],
  ['an empty generation', { IORI_GENERATION: '' }],
  ['an empty run id', { IORI_MIGRATION_RUN_ID: '' }],
  ['a recovery value', { IORI_RECOVERY: 'destination_writes_reconciled' }],
])('stops at adopt-inputs with config-invalid for %s', async (_name, change) => {
  const error = await invoke({ ...invocationEnv, ...change }).then(() => undefined, (reason: unknown) => reason);
  expect(adoptFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=adopt-inputs program=none exit=none signal=none reason=config-invalid',
  ]);
  expect(mocks.main).not.toHaveBeenCalled();
  expect(mocks.terraformFactory).not.toHaveBeenCalled();
});
it.each([
  ['the run id', { runId: 'other-run' }],
  ['the migration SHA', { mainSha: 'c'.repeat(40) }],
  ['the generation', { identity: { ...targetOutputsFixture().config.identity, generation: 'other0001' } }],
  ['the environment', { identity: { ...targetOutputsFixture().config.identity, environment: 'staging' } }],
])('stops at adopt-inputs when the setup identity differs in %s', async (_name, change) => {
  mocks.setup.mockReturnValue({ ...fixture.config, ...change });
  const error = await rejection();
  expect(adoptFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=adopt-inputs program=none exit=none signal=none reason=config-invalid',
  ]);
  expect(mocks.main).not.toHaveBeenCalled();
  expect(mocks.terraformFactory).not.toHaveBeenCalled();
});
it('stops with job-budget-exhausted before any read when the hosted budget is spent', async () => {
  const error = await invoke(invocationEnv, Date.now() - 346 * 60_000).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(adoptFailureLines(stages.at(-1), error, false)).toEqual([
    'IORI_DIAG stage=adopt-inputs program=none exit=none signal=none reason=job-budget-exhausted',
  ]);
  expect(mocks.main).not.toHaveBeenCalled();
});
