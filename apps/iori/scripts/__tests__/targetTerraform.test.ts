import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createTargetTerraform } from '../target-terraform.mjs';
import { createTargetIdentity } from '../fresh-target.mjs';
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
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
