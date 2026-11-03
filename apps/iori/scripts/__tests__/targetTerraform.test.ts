import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { createTargetIdentity } from '../fresh-target.mjs';
import { createTargetTerraform } from '../target-terraform.mjs';
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
});
it('awaits an asynchronous owned command boundary before consuming Terraform output', async () => {
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${identity.accountId}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-async-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: async (_program, args) => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return { status: 0, stdout: args.includes('show') ? '{}' : '', stderr: '' };
    },
  });
  await expect(api.initializeFresh()).resolves.toMatchObject({ resourceCount: 0 });
});
it('pins actual backend initialization to the generation and rejects old state before plan/apply', async () => {
  const command = vi.fn((_bin, args) => ({
    status: 0,
    stdout: args.includes('show')
      ? JSON.stringify({ values: { root_module: { resources: [{ address: 'old' }] } } })
      : '',
    stderr: '',
  }));
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-test-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: command,
  });
  await expect(api.initializeFresh()).rejects.toThrow();
  expect(command.mock.calls[0]![1]).toContain(`-backend-config=key=${identity.backendKey}`);
  expect(command.mock.calls[0]![1]).toContain('-lockfile=readonly');
  expect(command.mock.calls.some(([, args]) => args.includes('plan') || args.includes('apply'))).toBe(false);
});
it('validates a fresh create plan before the fixed apply and returns generation-correlated outputs', async () => {
  const workerBindings = {
    d1_database_id: 'db',
    kv_namespace_id: 'kv',
    worker_name: identity.workerName,
    r2_bucket_name: identity.names.uploads,
    queue_name: identity.names.queue,
  };
  const targetIdentity = {
    account_id: identity.accountId,
    environment: identity.environment,
    generation: identity.generation,
    backend_key: identity.backendKey,
    worker_name: identity.workerName,
    queue_id: 'queue',
    dlq_id: 'dlq',
    queue_settings: { delivery_paused: true },
  };
  const command = vi.fn((_bin, args) => ({
    status: 0,
    stdout: args.includes('show')
      ? args.length > 3
        ? JSON.stringify({
          resource_changes: [{
            address: 'cloudflare_d1_database.iori',
            change: {
              actions: ['create'],
              before: null,
              after: { account_id: identity.accountId, name: identity.names.d1 },
            },
          }],
        })
        : '{}'
      : args.includes('output')
      ? JSON.stringify({
        worker_bindings: { value: workerBindings },
        target_identity: { value: targetIdentity },
        migration_storage: { value: { bucket_name: identity.names.transfer, environment: identity.environment } },
      })
      : '',
    stderr: '',
  }));
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-test-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: command,
  });
  await api.initializeFresh();
  await expect(api.prepare('resources')).resolves.toMatchObject({ workerBindings, targetIdentity });
  const commands = command.mock.calls.map(([, args]) => args[1]);
  expect(commands).toEqual(['init', 'show', 'plan', 'show', 'apply', 'output']);
});
it('reads an established backend without plan/apply and rejects a different backend output', async () => {
  const outputs = {
    worker_bindings: {
      value: {
        d1_database_id: 'db',
        kv_namespace_id: 'kv',
        worker_name: identity.workerName,
        r2_bucket_name: identity.names.uploads,
        queue_name: identity.names.queue,
      },
    },
    migration_storage: { value: { bucket_name: identity.names.transfer, environment: identity.environment } },
    target_identity: {
      value: {
        account_id: identity.accountId,
        environment: identity.environment,
        generation: identity.generation,
        backend_key: identity.backendKey,
        worker_name: identity.workerName,
        d1_database_name: identity.names.d1,
        queue_id: 'queue',
        dlq_id: 'dlq',
        queue_settings: { delivery_paused: true },
        dlq_settings: { delivery_paused: true },
        consumer: [{
          consumer_id: 'consumer',
          account_id: identity.accountId,
          queue_id: 'queue',
          script_name: identity.workerName,
          type: 'worker',
          dead_letter_queue: identity.names.dlq,
          settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
        }],
      },
    },
  };
  const command = vi.fn((_bin, args) => ({
    status: 0,
    stdout: JSON.stringify(
      args.includes('show')
        ? { values: { root_module: { resources: [{ address: 'existing' }] } } }
        : args.includes('output')
        ? outputs
        : {},
    ),
  }));
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${identity.accountId}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-read-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: command,
  });
  await expect(api.initializeEstablished()).resolves.toMatchObject({ targetIdentity: outputs.target_identity.value });
  expect(command.mock.calls.map(([, args]) => args[1])).toEqual(['init', 'show', 'output']);
  outputs.target_identity.value.backend_key = 'old';
  await expect(api.initializeEstablished()).rejects.toThrow();
});
it('selects the staging route switch without enabling the production switch and rejects missing route proof', async () => {
  const calls: string[][] = [];
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${identity.accountId}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-route-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: async (_program, args) => {
      calls.push(args);
      return { status: 0, stdout: '{}', stderr: '' };
    },
  });
  await expect(api.changeRoute({ establishedBindings: { worker_name: identity.workerName } })).rejects.toThrow();
  expect(calls[0]).toContain('-var=enable_staging_worker_route=true');
  expect(calls[0]).toContain('-var=enable_production_worker_route=false');
  expect(calls[0]).toContain('-var=queue_delivery_paused=true');
  expect(calls.some(args => args.includes('apply'))).toBe(false);
});
const terraformFailure = (reason: string) => ({
  message: 'Target Terraform operation failed.',
  diagnostic: { reason },
});
const stagedTerraform = async (runCommand: (program: string, args: string[]) => unknown) => {
  const stages: string[] = [];
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-stage-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: runCommand as never,
    onStage: (stage: string) => {
      stages.push(stage);
    },
  });
  return { api, stages };
};
const freshPlan = {
  resource_changes: [{
    address: 'cloudflare_d1_database.iori',
    change: { actions: ['create'], before: null, after: { account_id: identity.accountId, name: identity.names.d1 } },
  }],
};
const stageOutput = (plan: unknown, output: unknown) => (_program: string, args: string[]) => ({
  status: 0,
  stdout: args.includes('show') ? (args.length > 3 ? JSON.stringify(plan) : '{}') : args.includes('output')
    ? JSON.stringify(output)
    : '',
  stderr: '',
});
it('reports init, show, plan and apply stages before each fixed Terraform step', async () => {
  const workerBindings = {
    d1_database_id: 'db',
    kv_namespace_id: 'kv',
    worker_name: identity.workerName,
    r2_bucket_name: identity.names.uploads,
    queue_name: identity.names.queue,
  };
  const targetIdentity = {
    account_id: identity.accountId,
    environment: identity.environment,
    generation: identity.generation,
    backend_key: identity.backendKey,
    worker_name: identity.workerName,
    queue_id: 'queue',
    dlq_id: 'dlq',
    queue_settings: { delivery_paused: true },
  };
  const { api, stages } = await stagedTerraform(stageOutput(freshPlan, {
    worker_bindings: { value: workerBindings },
    target_identity: { value: targetIdentity },
    migration_storage: { value: { bucket_name: identity.names.transfer, environment: identity.environment } },
  }));
  await api.initializeFresh();
  await api.prepare('resources');
  expect(stages).toEqual(['tf-init', 'tf-show', 'tf-plan', 'tf-apply']);
});
it('classifies a nonzero command status and a command launch failure as command-failed', async () => {
  const failing = await stagedTerraform(() => ({ status: 1, stdout: '', stderr: 'secret' }));
  await expect(failing.api.initializeFresh()).rejects.toMatchObject(terraformFailure('command-failed'));
  expect(failing.stages).toEqual(['tf-init']);
  const rejecting = await stagedTerraform(() => Promise.reject(new Error('spawn failed')));
  await expect(rejecting.api.initializeFresh()).rejects.toMatchObject({
    message: 'spawn failed',
    diagnostic: { reason: 'command-failed' },
  });
});
it('fails with config-invalid before terraform init when the identity has no backend bucket', () => {
  const runCommand = vi.fn();
  expect(() =>
    createTargetTerraform({
      identity: { ...identity, backendBucket: undefined },
      backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
      privateDirectory: '/tmp/target-no-bucket',
      zoneId: 'c'.repeat(32),
      hostname: 'staging.test',
      runCommand: runCommand as never,
    })
  ).toThrow(expect.objectContaining(terraformFailure('config-invalid')));
  expect(runCommand).not.toHaveBeenCalled();
});
it('leaves an abort to the caller instead of labelling it command-failed', async () => {
  const controller = new AbortController();
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-abort-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    signal: controller.signal,
    runCommand: async () => {
      controller.abort();
      throw new Error('terminated');
    },
  });
  const error = await api.initializeFresh().then(() => undefined, (reason: unknown) => reason);
  expect(error).toMatchObject({ name: 'AbortError' });
  expect(error).not.toHaveProperty('diagnostic');
});
it('classifies existing state as state-present and unreadable JSON as output-invalid', async () => {
  const present = await stagedTerraform(() => ({
    status: 0,
    stdout: JSON.stringify({ values: { root_module: { resources: [{ address: 'old' }] } } }),
    stderr: '',
  }));
  await expect(present.api.initializeFresh()).rejects.toMatchObject(terraformFailure('state-present'));
  expect(present.stages).toEqual(['tf-init', 'tf-show']);
  const broken = await stagedTerraform(() => ({ status: 0, stdout: '{not json', stderr: '' }));
  await expect(broken.api.initializeFresh()).rejects.toMatchObject(terraformFailure('output-invalid'));
});
it('classifies a rejected plan as plan-rejected and a different output as output-mismatch', async () => {
  const rejected = await stagedTerraform(stageOutput({}, {}));
  await rejected.api.initializeFresh();
  await expect(rejected.api.prepare('resources')).rejects.toMatchObject(terraformFailure('plan-rejected'));
  expect(rejected.stages).toEqual(['tf-init', 'tf-show', 'tf-plan']);
  const mismatched = await stagedTerraform(stageOutput(freshPlan, {}));
  await mismatched.api.initializeFresh();
  await expect(mismatched.api.prepare('resources')).rejects.toMatchObject(terraformFailure('output-mismatch'));
  expect(mismatched.stages).toEqual(['tf-init', 'tf-show', 'tf-plan', 'tf-apply']);
});
it('prefixes the consumer stages with attach and classifies its rejected plan', async () => {
  const consumer = await stagedTerraform(stageOutput({}, {}));
  await expect(consumer.api.prepare('consumer', { establishedBindings: { worker_name: identity.workerName } }))
    .rejects.toMatchObject(terraformFailure('plan-rejected'));
  expect(consumer.stages).toEqual(['attach-tf-plan']);
  await expect(consumer.api.prepare('consumer')).rejects.toMatchObject(terraformFailure('plan-rejected'));
});
const consumerStagePlan = async (plan: unknown, establishedBindings: Record<string, string>) => {
  const command = vi.fn((_bin, args) => ({
    status: 0,
    stdout: args.includes('show') ? (args.length > 3 ? JSON.stringify(plan) : '{}') : '',
    stderr: '',
  }));
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-test-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: command,
  });
  const error = await api.prepare('consumer', { establishedBindings }).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  return { error, commands: command.mock.calls.map(([, args]) => args[1]) };
};
const consumerBindings = {
  d1_database_id: 'db',
  kv_namespace_id: 'kv',
  worker_name: identity.workerName,
  r2_bucket_name: identity.names.uploads,
  queue_name: identity.names.queue,
};
const consumerCreate = {
  address: 'cloudflare_queue_consumer.fedify[0]',
  change: {
    actions: ['create'],
    before: null,
    after: {
      account_id: identity.accountId,
      script_name: identity.workerName,
      type: 'worker',
      queue_id: 'queue',
      dead_letter_queue: identity.names.dlq,
      settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
    },
  },
};
const bindingsNoop = (before: unknown) => ({
  output_changes: {
    target_identity: { before: { queue_id: 'queue' } },
    worker_bindings: { actions: ['no-op'], before, after: before },
  },
  planned_values: { outputs: { worker_bindings: { value: before } } },
});
it('reports the rejected resource and action when the consumer stage plan updates the Queue', async () => {
  const queueUpdate = {
    address: 'cloudflare_queue.fedify',
    change: {
      actions: ['update'],
      before: { queue_name: identity.names.queue, settings: { delivery_paused: false } },
      after: {
        account_id: identity.accountId,
        queue_name: identity.names.queue,
        settings: { delivery_paused: true },
      },
    },
  };
  const { error, commands } = await consumerStagePlan(
    { resource_changes: [queueUpdate, consumerCreate], ...bindingsNoop(consumerBindings) },
    consumerBindings,
  );
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details: ['plan-queue-update'] } });
  expect(commands).toEqual(['plan', 'show']);
});
it('reports a changed Worker bindings output as plan-bindings-changed at the consumer stage', async () => {
  const { error, commands } = await consumerStagePlan(
    { resource_changes: [consumerCreate], ...bindingsNoop({ ...consumerBindings, d1_database_id: 'other' }) },
    consumerBindings,
  );
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details: ['plan-bindings-changed'] } });
  expect(commands).toEqual(['plan', 'show']);
});
it('keeps a plan-rejected diagnostic without details for rejections that predate resource inspection', async () => {
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-test-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: vi.fn(),
  });
  const error = await api.prepare('consumer').then(() => undefined, (reason: unknown) => reason);
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected' } });
  expect((error as { diagnostic: object }).diagnostic).not.toHaveProperty('details');
});
const queue = (name: string, paused: boolean, after = paused) => ({
  address: `cloudflare_queue.${name}`,
  change: {
    actions: [paused === after ? 'no-op' : 'update'],
    before: { queue_id: name, settings: { delivery_paused: paused } },
    after: { queue_id: name, settings: { delivery_paused: after } },
  },
});
const routeCreate = {
  address: 'cloudflare_workers_route.iori[0]',
  change: {
    actions: ['create'],
    before: null,
    after: { zone_id: 'c'.repeat(32), pattern: 'staging.test/*', script: identity.workerName },
  },
};
const controlPlan = async (
  method: 'changeRoute' | 'changeQueuePause',
  plan: unknown,
  establishedBindings: Record<string, string> = consumerBindings,
) => {
  const { api, stages } = await stagedTerraform((_program, args) => ({
    status: 0,
    stdout: args.includes('show') ? JSON.stringify(plan) : '',
    stderr: '',
  }));
  const outcome: { result?: unknown; error?: unknown } = await (method === 'changeRoute'
    ? api.changeRoute({ establishedBindings })
    : api.changeQueuePause({ paused: false, establishedBindings, routeEnabled: true })).then(
      (result: unknown) => ({ result }),
      (reason: unknown) => ({ error: reason }),
    );
  return { stages, ...outcome };
};
it('reports the route plan and apply stages around the fixed route steps', async () => {
  const plan = {
    resource_changes: [routeCreate, queue('fedify', true), queue('fedify_dlq', true)],
    ...bindingsNoop(consumerBindings),
  };
  const { stages, result } = await controlPlan('changeRoute', plan);
  expect(result).toEqual({ applied: true });
  expect(stages).toEqual(['route-plan', 'route-apply']);
});
it('reports the queue plan and apply stages around the fixed Queue steps', async () => {
  const plan = {
    resource_changes: [queue('fedify', true, false), queue('fedify_dlq', true)],
    ...bindingsNoop(consumerBindings),
  };
  const { stages, result } = await controlPlan('changeQueuePause', plan);
  expect(result).toEqual({ applied: true });
  expect(stages).toEqual(['queue-plan', 'queue-apply']);
});
it('does not report an apply stage for a rejected route plan and names the rejected resource', async () => {
  const plan = {
    resource_changes: [routeCreate, queue('fedify', true, false), queue('fedify_dlq', true)],
    ...bindingsNoop(consumerBindings),
  };
  const { stages, error } = await controlPlan('changeRoute', plan);
  expect(stages).toEqual(['route-plan']);
  expect(error).toMatchObject({
    diagnostic: { reason: 'plan-rejected', details: expect.arrayContaining(['plan-queue-update']) },
  });
});
it('reports a route plan without state as plan-invalid', async () => {
  const { error } = await controlPlan('changeRoute', bindingsNoop(consumerBindings));
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details: ['plan-invalid'] } });
});
it('reports a changed Worker bindings output as plan-bindings-changed for the route and Queue changes', async () => {
  const route = { resource_changes: [routeCreate, queue('fedify', true), queue('fedify_dlq', true)] };
  const resume = { resource_changes: [queue('fedify', true, false), queue('fedify_dlq', true)] };
  const changed = { ...consumerBindings, d1_database_id: 'other' };
  for (const [method, plan] of [['changeRoute', route], ['changeQueuePause', resume]] as const) {
    const { error } = await controlPlan(method, { ...plan, ...bindingsNoop(changed) });
    expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details: ['plan-bindings-changed'] } });
  }
});
it('names the Dead Letter Queue update when the Queue resume plan changes it', async () => {
  const plan = {
    resource_changes: [queue('fedify', true, false), queue('fedify_dlq', true, false)],
    ...bindingsNoop(consumerBindings),
  };
  const { stages, error } = await controlPlan('changeQueuePause', plan);
  expect(stages).toEqual(['queue-plan']);
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details: ['plan-dlq-update'] } });
});
it('keeps a plan-rejected diagnostic without details for control inputs that predate resource inspection', async () => {
  const { api, stages } = await stagedTerraform(vi.fn());
  const error = await api.changeRoute({ establishedBindings: undefined as never }).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(stages).toEqual(['route-plan']);
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected' } });
  expect((error as { diagnostic: object }).diagnostic).not.toHaveProperty('details');
});
const adoptRouteId = 'f'.repeat(32);
const adoptOutputs = {
  worker_bindings: { value: consumerBindings },
  migration_storage: { value: { bucket_name: identity.names.transfer, environment: identity.environment } },
  target_identity: {
    value: {
      account_id: identity.accountId,
      environment: identity.environment,
      generation: identity.generation,
      backend_key: identity.backendKey,
      worker_name: identity.workerName,
      d1_database_name: identity.names.d1,
      queue_id: 'queue',
      dlq_id: 'dlq',
      queue_settings: { delivery_paused: true },
      dlq_settings: { delivery_paused: true },
      consumer: [{
        consumer_id: 'consumer',
        account_id: identity.accountId,
        queue_id: 'queue',
        script_name: identity.workerName,
        type: 'worker',
        dead_letter_queue: identity.names.dlq,
        settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
      }],
    },
  },
};
const adoptNoop = (address: string, after: unknown) => ({
  address,
  change: { actions: ['no-op'], before: after, after },
});
const adoptResources = () => [
  adoptNoop('cloudflare_workers_route.iori[0]', {
    zone_id: 'c'.repeat(32),
    pattern: 'staging.test/*',
    script: identity.workerName,
  }),
  adoptNoop('cloudflare_queue.fedify', { settings: { delivery_paused: false } }),
  adoptNoop('cloudflare_queue.fedify_dlq', { settings: { delivery_paused: true } }),
  adoptNoop('cloudflare_queue_consumer.fedify[0]', { script_name: identity.workerName }),
];
const adoptOutputChanges = (bindings: unknown = consumerBindings) => ({
  worker_bindings: { actions: ['no-op'], before: bindings, after: bindings },
  target_identity: { actions: ['no-op'], before: {}, after: {} },
});
const cleanRefresh = () => ({ resource_changes: adoptResources(), resource_drift: [] });
const cleanFinal = () => ({ resource_changes: adoptResources(), output_changes: adoptOutputChanges() });
const queueDrift = (before: Record<string, unknown>, after: Record<string, unknown>) => ({
  address: 'cloudflare_queue.fedify',
  change: { actions: ['update'], before, after },
});
const adoptHarness = async (
  options: {
    routeInState?: boolean;
    refresh?: unknown;
    final?: unknown;
    finalStatus?: number;
    finalThrows?: boolean;
    paused?: boolean;
  } = {},
) => {
  const calls: string[][] = [];
  const stages: string[] = [];
  const notices: string[][] = [];
  const outputs = structuredClone(adoptOutputs);
  outputs.target_identity.value.queue_settings.delivery_paused = options.paused ?? true;
  const api = createTargetTerraform({
    identity,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-adopt-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    runCommand: (async (_program: string, args: string[]) => {
      calls.push(args);
      const reply = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });
      if (args[1] === 'show' && args.length > 3) {
        return reply(
          args[3]!.includes('adopt-refresh') ? options.refresh ?? cleanRefresh() : options.final ?? cleanFinal(),
        );
      }
      if (args[1] === 'show') {
        return reply({
          values: {
            root_module: {
              resources: [
                { address: 'cloudflare_queue.fedify' },
                ...(options.routeInState
                  ? [{ address: 'cloudflare_workers_route.iori[0]', values: { id: adoptRouteId } }]
                  : []),
              ],
            },
          },
        });
      }
      if (args[1] === 'output') return reply(outputs);
      if (args.includes('-detailed-exitcode') && options.finalThrows) {
        throw Object.assign(new Error('exit'), { exitCode: options.finalStatus });
      }
      if (args.includes('-detailed-exitcode')) return { status: options.finalStatus ?? 0, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    }) as never,
    onStage: (stage: string) => {
      stages.push(stage);
    },
    onNotice: (stage: string, word: string) => {
      notices.push([stage, word]);
    },
  });
  const adopt = (
    input: Partial<Parameters<typeof api.adoptCutoverState>[0]> = {},
  ): Promise<{ result?: unknown; error?: unknown }> =>
    api.adoptCutoverState({
      routeId: adoptRouteId,
      routeInState: false,
      establishedBindings: consumerBindings,
      ...input,
    })
      .then(
        (result: unknown) => ({ result }),
        (error: unknown) => ({ error }),
      );
  return { api, adopt, calls, stages, notices, commands: () => calls.map(args => args[1]) };
};
const adoptVariables = [
  '-var=attach_queue_consumer=true',
  '-var=queue_delivery_paused=false',
  '-var=enable_production_worker_route=false',
  '-var=enable_staging_worker_route=true',
];
const expectNoForbiddenTerraform = (calls: string[][]) => {
  for (const args of calls) {
    expect(args).not.toContain('-auto-approve');
    expect(['destroy', 'state', 'taint', 'untaint']).not.toContain(args[1]);
  }
};
it('reads the adoptable state, reports whether the route is in state and skips the pause check without a request', async () => {
  const absent = await adoptHarness();
  await expect(absent.api.initializeAdoptable()).resolves.toMatchObject({
    targetIdentity: adoptOutputs.target_identity.value,
    routeInState: false,
    routeId: undefined,
  });
  expect(absent.commands()).toEqual(['init', 'show', 'output']);
  expect(absent.stages).toEqual(['tf-init', 'adopt-state-read']);
  const present = await adoptHarness({ routeInState: true, paused: false });
  await expect(present.api.initializeAdoptable()).resolves.toMatchObject({ routeInState: true, routeId: adoptRouteId });
  await expect(present.api.initializeAdoptable({ paused: false })).resolves.toMatchObject({ routeInState: true });
  await expect(absent.api.initializeAdoptable({ paused: false })).rejects.toMatchObject(
    terraformFailure('output-mismatch'),
  );
});
it('imports the route, refreshes into a saved plan file and checks a clean final plan, in that order', async () => {
  const harness = await adoptHarness();
  await harness.api.initializeAdoptable();
  const { result } = await harness.adopt();
  expect(result).toEqual({ imported: true });
  expect(harness.commands()).toEqual(['init', 'show', 'output', 'import', 'plan', 'show', 'apply', 'plan', 'show']);
  const [, , , importArgs, refreshPlan, refreshShow, refreshApply, finalPlan, finalShow] = harness.calls;
  expect(importArgs).toEqual([
    expect.stringMatching(/^-chdir=/),
    'import',
    '-input=false',
    '-lock=true',
    ...adoptVariables,
    'cloudflare_workers_route.iori[0]',
    `${'c'.repeat(32)}/${adoptRouteId}`,
  ]);
  expect(refreshPlan).toEqual([
    expect.stringMatching(/^-chdir=/),
    'plan',
    '-refresh-only',
    '-input=false',
    '-lock=true',
    expect.stringMatching(/^-out=.*adopt-refresh\.tfplan$/),
    ...adoptVariables,
  ]);
  const refreshPath = refreshPlan![5]!.slice('-out='.length);
  expect(refreshShow).toEqual([expect.stringMatching(/^-chdir=/), 'show', '-json', refreshPath]);
  expect(refreshApply).toEqual([expect.stringMatching(/^-chdir=/), 'apply', '-input=false', '-lock=true', refreshPath]);
  expect(finalPlan).toEqual([
    expect.stringMatching(/^-chdir=/),
    'plan',
    '-detailed-exitcode',
    '-input=false',
    '-lock=true',
    expect.stringMatching(/^-out=.*adopt-final\.tfplan$/),
    ...adoptVariables,
  ]);
  expect(finalShow![3]).toBe(finalPlan![5]!.slice('-out='.length));
  expect(harness.stages).toEqual([
    'tf-init',
    'adopt-state-read',
    'adopt-route-import',
    'adopt-refresh-plan',
    'adopt-refresh-apply',
    'adopt-final-plan',
  ]);
  expect(harness.notices).toEqual([
    ['adopt-route-import', 'route-imported'],
    ['adopt-refresh-plan', 'refresh-no-drift'],
    ['adopt-refresh-apply', 'refresh-applied'],
    ['adopt-final-plan', 'plan-clean'],
  ]);
  expectNoForbiddenTerraform(harness.calls);
});
it('does not import a route that is already in state', async () => {
  const harness = await adoptHarness({ routeInState: true });
  const { routeInState } = await harness.api.initializeAdoptable();
  const { result } = await harness.adopt({ routeInState });
  expect(result).toEqual({ imported: false });
  expect(harness.commands()).toEqual(['init', 'show', 'output', 'plan', 'show', 'apply', 'plan', 'show']);
  expect(harness.notices[0]).toEqual(['adopt-route-import', 'route-in-state']);
  expectNoForbiddenTerraform(harness.calls);
});
it('applies a refresh whose only drift is the Queue becoming active and reports the allowed drift', async () => {
  const harness = await adoptHarness({
    refresh: {
      ...cleanRefresh(),
      resource_drift: [
        queueDrift(
          { modified_on: 'before', settings: { delivery_paused: true } },
          { modified_on: 'after', settings: { delivery_paused: false } },
        ),
      ],
    },
  });
  const { result } = await harness.adopt();
  expect(result).toEqual({ imported: true });
  expect(harness.commands()).toContain('apply');
  expect(harness.notices[1]).toEqual(['adopt-refresh-plan', 'refresh-drift-allowed']);
  expectNoForbiddenTerraform(harness.calls);
});
it.each([
  ['a Queue pause drift in the wrong direction', [
    queueDrift({ settings: { delivery_paused: false } }, { settings: { delivery_paused: true } }),
  ], ['plan-queue-update', 'drift-queue-delivery-paused']],
  ['a Queue drift in another attribute', [
    queueDrift({ settings: { delivery_delay: 0 } }, { settings: { delivery_delay: 5 } }),
  ], ['plan-queue-update', 'drift-queue-delivery-delay']],
  ['a Dead Letter Queue drift', [{
    address: 'cloudflare_queue.fedify_dlq',
    change: {
      actions: ['update'],
      before: { settings: { delivery_paused: true } },
      after: { settings: { delivery_paused: false } },
    },
  }], ['plan-dlq-update', 'drift-dlq-delivery-paused']],
  ['a consumer script drift', [{
    address: 'cloudflare_queue_consumer.fedify[0]',
    change: { actions: ['update'], before: { script_name: 'old' }, after: { script_name: 'new' } },
  }], ['plan-consumer-update', 'drift-consumer-script-name']],
  ['a deleted route', [{
    address: 'cloudflare_workers_route.iori[0]',
    change: { actions: ['delete'], before: { script: 'old' }, after: null },
  }], ['plan-route-delete', 'drift-route-other']],
])('rejects %s without applying the refresh', async (_name, drift, details) => {
  const harness = await adoptHarness({ refresh: { ...cleanRefresh(), resource_drift: drift } });
  const { error } = await harness.adopt();
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details } });
  expect(harness.commands()).toEqual(['import', 'plan', 'show']);
  expect(harness.stages.at(-1)).toBe('adopt-refresh-plan');
  expect(harness.notices).toEqual([['adopt-route-import', 'route-imported']]);
  expectNoForbiddenTerraform(harness.calls);
});
it('rejects a refresh plan that changes a resource or imports one, without applying it', async () => {
  const update = adoptNoop('cloudflare_queue.fedify', { settings: { delivery_paused: false } });
  Object.assign(update.change, {
    actions: ['update'],
    before: { settings: { delivery_paused: true } },
  });
  const changed = await adoptHarness({ refresh: { resource_changes: [update], resource_drift: [] } });
  expect((await changed.adopt()).error).toMatchObject({
    diagnostic: { reason: 'plan-rejected', details: ['plan-queue-update', 'drift-queue-delivery-paused'] },
  });
  const imported = adoptNoop('cloudflare_workers_route.iori[0]', { script: identity.workerName });
  Object.assign(imported.change, { importing: { id: 'route' } });
  const importing = await adoptHarness({ refresh: { resource_changes: [imported], resource_drift: [] } });
  expect((await importing.adopt()).error).toMatchObject({
    diagnostic: { reason: 'plan-rejected', details: ['plan-route-no-op'] },
  });
  for (const harness of [changed, importing]) {
    expect(harness.commands()).not.toContain('apply');
    expectNoForbiddenTerraform(harness.calls);
  }
});
it('reports the attribute of a drift with a fixed word and never prints values', async () => {
  const secret = 'private-script-name-value';
  const harness = await adoptHarness({
    refresh: {
      ...cleanRefresh(),
      resource_drift: [
        {
          address: 'cloudflare_queue_consumer.fedify[0]',
          change: {
            actions: ['update'],
            before: { script_name: secret, dead_letter_queue: secret, unknown_attribute: secret },
            after: { script_name: 'other', dead_letter_queue: 'other', unknown_attribute: 'other' },
          },
        },
        {
          address: 'cloudflare_worker.iori',
          change: { actions: ['update'], before: { unknown_attribute: secret }, after: { unknown_attribute: 'other' } },
        },
      ],
    },
  });
  const { error } = await harness.adopt();
  const details = (error as { diagnostic: { details: string[] } }).diagnostic.details;
  expect(details).toEqual([
    'plan-consumer-update',
    'plan-other-update',
    'drift-consumer-dead-letter-queue',
    'drift-consumer-script-name',
    'drift-consumer-other',
    'drift-other-other',
  ]);
  expect(JSON.stringify(error)).not.toContain(secret);
});
it('rejects a final plan with exit code 2 whether the runner returns or throws it, and names the attribute', async () => {
  const update = adoptResources();
  update[1] = {
    address: 'cloudflare_queue.fedify',
    change: {
      actions: ['update'],
      before: { settings: { delivery_paused: true } },
      after: { settings: { delivery_paused: false } },
    },
  };
  for (const finalThrows of [false, true]) {
    const harness = await adoptHarness({
      finalStatus: 2,
      finalThrows,
      final: { resource_changes: update, output_changes: adoptOutputChanges() },
    });
    const { error } = await harness.adopt();
    expect(error).toMatchObject({
      diagnostic: { reason: 'plan-rejected', details: ['plan-queue-update', 'diff-queue-delivery-paused'] },
    });
    expect(harness.commands()).toEqual(['import', 'plan', 'show', 'apply', 'plan', 'show']);
    expect(harness.stages.at(-1)).toBe('adopt-final-plan');
    expectNoForbiddenTerraform(harness.calls);
  }
  const bare = await adoptHarness({ finalStatus: 2 });
  expect((await bare.adopt()).error).toMatchObject({
    diagnostic: { reason: 'plan-rejected', details: ['plan-invalid'] },
  });
});
it('classifies another final plan exit code as command-failed', async () => {
  const harness = await adoptHarness({ finalStatus: 1, finalThrows: true });
  expect((await harness.adopt()).error).toMatchObject({ exitCode: 1, diagnostic: { reason: 'command-failed' } });
});
const finalFailure = async (mutate: (plan: ReturnType<typeof cleanFinal>) => void) => {
  const final = cleanFinal();
  mutate(final);
  const harness = await adoptHarness({ final });
  const { error } = await harness.adopt();
  expect(harness.notices.map(([, word]) => word)).not.toContain('plan-clean');
  expectNoForbiddenTerraform(harness.calls);
  return error;
};
it.each([
  ['a change in a resource', (plan: ReturnType<typeof cleanFinal>) => {
    Object.assign(plan.resource_changes[2]!.change, {
      actions: ['update'],
      before: { settings: { delivery_paused: false } },
    });
  }, ['plan-dlq-update', 'diff-dlq-delivery-paused']],
  ['a differing no-op resource', (plan: ReturnType<typeof cleanFinal>) => {
    Object.assign(plan.resource_changes[3]!.change, { before: { script_name: 'old' } });
  }, ['plan-consumer-no-op', 'diff-consumer-script-name']],
  ['an import', (plan: ReturnType<typeof cleanFinal>) => {
    Object.assign(plan.resource_changes[0]!.change, { importing: { id: 'route' } });
  }, ['plan-route-no-op']],
  ['a different route pattern', (plan: ReturnType<typeof cleanFinal>) => {
    for (const item of plan.resource_changes.slice(0, 1)) {
      Object.assign(item.change.after as object, { pattern: 'other.test/*' });
      Object.assign(item.change.before as object, { pattern: 'other.test/*' });
    }
  }, ['plan-route-no-op', 'diff-route-pattern']],
  ['a missing route', (plan: ReturnType<typeof cleanFinal>) => {
    plan.resource_changes.shift();
  }, ['plan-invalid']],
  ['a paused Queue', (plan: ReturnType<typeof cleanFinal>) => {
    plan.resource_changes[1] = adoptNoop('cloudflare_queue.fedify', { settings: { delivery_paused: true } });
  }, ['plan-queue-no-op', 'diff-queue-delivery-paused']],
  ['an active Dead Letter Queue', (plan: ReturnType<typeof cleanFinal>) => {
    plan.resource_changes[2] = adoptNoop('cloudflare_queue.fedify_dlq', { settings: { delivery_paused: false } });
  }, ['plan-dlq-no-op', 'diff-dlq-delivery-paused']],
  ['two consumers', (plan: ReturnType<typeof cleanFinal>) => {
    plan.resource_changes.push(adoptNoop('cloudflare_queue_consumer.fedify[1]', { script_name: identity.workerName }));
  }, ['plan-invalid']],
  ['a changed output', (plan: ReturnType<typeof cleanFinal>) => {
    Object.assign(plan.output_changes.target_identity, { actions: ['update'] });
  }, ['plan-invalid']],
  ['changed Worker bindings', (plan: ReturnType<typeof cleanFinal>) => {
    plan.output_changes = adoptOutputChanges({ ...consumerBindings, d1_database_id: 'other' });
  }, ['plan-bindings-changed']],
])('rejects a final plan with exit code 0 but %s', async (_name, mutate, details) => {
  const error = await finalFailure(mutate);
  expect(error).toMatchObject({ diagnostic: { reason: 'plan-rejected', details } });
});
it('rejects an invalid route id as route-id-invalid before it runs any command', async () => {
  const harness = await adoptHarness();
  for (const routeId of ['', 'short', 'F'.repeat(32), `${'f'.repeat(31)}/`, undefined, 7]) {
    const { error } = await harness.adopt({ routeId: routeId as never });
    expect(error).toMatchObject(terraformFailure('route-id-invalid'));
  }
  expect(harness.calls).toEqual([]);
  expect(harness.stages).toEqual([]);
  const missing = await harness.adopt({ routeInState: undefined as never });
  expect(missing.error).toMatchObject({ diagnostic: { reason: 'plan-rejected' } });
  expect(harness.calls).toEqual([]);
});
