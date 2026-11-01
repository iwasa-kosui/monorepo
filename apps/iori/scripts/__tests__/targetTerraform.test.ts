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
