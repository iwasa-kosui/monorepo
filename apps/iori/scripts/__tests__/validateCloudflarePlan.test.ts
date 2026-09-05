import { describe, expect, it } from 'vitest';
import { validateCloudflarePlan } from '../validate-cloudflare-plan.mjs';

describe('validateCloudflarePlan', () => {
  it('rejects deletion and replacement of durable production resources', () => {
    expect(validateCloudflarePlan({
      operation: 'reconcile',
      resource_changes: [
        { address: 'cloudflare_d1_database.iori', change: { actions: ['delete', 'create'] } },
        { address: 'cloudflare_r2_bucket.uploads', change: { actions: ['delete'] } },
        { address: 'cloudflare_workers_kv_namespace.fedify', change: { actions: ['delete', 'create'] } },
        { address: 'cloudflare_queue.fedify', change: { actions: ['delete', 'create'] } },
        { address: 'cloudflare_queue.fedify_dlq', change: { actions: ['delete', 'create'] } },
        { address: 'cloudflare_workers_route.iori[0]', change: { actions: ['delete', 'create'] } },
      ],
    })).toEqual([
      'cloudflare_d1_database.iori must not be replaced',
      'cloudflare_r2_bucket.uploads must not be deleted',
      'cloudflare_workers_kv_namespace.fedify must not be replaced',
      'cloudflare_queue.fedify must not be replaced',
      'cloudflare_queue.fedify_dlq must not be replaced',
      'cloudflare_workers_route.iori[0] must not be replaced',
    ]);
  });

  it.each(
    [
      ['reconcile', { address: 'cloudflare_workers_route.iori[0]', change: { actions: ['no-op'] } }],
      ['consumer-replacement', { address: 'cloudflare_d1_database.iori', change: { actions: ['no-op'] } }],
      ['route-cutover', { address: 'cloudflare_queue_consumer.fedify', change: { actions: ['no-op'] } }],
    ] as const,
  )('allows a Terraform-owned no-op in %s', (operation, change) => {
    expect(validateCloudflarePlan({ operation, resource_changes: [change] })).toEqual([]);
  });

  it('rejects any changed Terraform Worker binding output before resource operation checks', () => {
    expect(validateCloudflarePlan({
      operation: 'route-cutover',
      allowProductionRoute: true,
      output_changes: {
        worker_bindings: {
          actions: ['update'],
          before: { d1_database_id: 'before' },
          after: { d1_database_id: 'after' },
        },
      },
      resource_changes: [{ address: 'cloudflare_workers_route.iori[0]', change: { actions: ['create'] } }],
    })).toEqual(['worker_bindings output must not change']);
  });

  it('requires an explicit no-op Worker binding output for Worker deployment gates', () => {
    const noOutput = validateCloudflarePlan({
      operation: 'reconcile',
      requireWorkerBindingsNoop: true,
      resource_changes: [],
    });
    expect(noOutput).toEqual(['worker_bindings output must be an explicit no-op']);

    const changed = validateCloudflarePlan({
      operation: 'consumer-replacement',
      requireWorkerBindingsNoop: true,
      output_changes: { worker_bindings: { actions: ['update'], before: { d1: 'old' }, after: { d1: 'new' } } },
      planned_values: { outputs: { worker_bindings: { value: { d1: 'new' } } } },
      resource_changes: [],
    });
    expect(changed).toEqual(['worker_bindings output must not change']);

    expect(validateCloudflarePlan({
      operation: 'reconcile',
      requireWorkerBindingsNoop: true,
      output_changes: { worker_bindings: { actions: ['no-op'], after: { d1: 'stable' } } },
      planned_values: { outputs: { worker_bindings: { value: { d1: 'stable' } } } },
      resource_changes: [],
    })).toEqual([]);
  });

  it('rejects Worker version resources and a route in reconcile', () => {
    expect(validateCloudflarePlan({
      operation: 'reconcile',
      resource_changes: [
        { address: 'cloudflare_worker_version.iori', change: { actions: ['create'] } },
        { address: 'cloudflare_worker_route.iori[0]', change: { actions: ['create'] } },
      ],
    })).toEqual([
      'cloudflare_worker_version.iori is not Terraform-owned',
      'cloudflare_worker_route.iori[0] is not allowed for reconcile',
    ]);
  });

  it('protects an existing cutover route in non-route operations', () => {
    const routeDeletion = { address: 'cloudflare_workers_route.iori[0]', change: { actions: ['delete'] } };

    expect(validateCloudflarePlan({ operation: 'reconcile', resource_changes: [routeDeletion] }))
      .toContain('cloudflare_workers_route.iori[0] must not be deleted');
    expect(validateCloudflarePlan({ operation: 'consumer-replacement', resource_changes: [routeDeletion] }))
      .toContain('cloudflare_workers_route.iori[0] must not be deleted');
  });

  it('limits consumer replacement to the consumer and dead-letter queue', () => {
    expect(validateCloudflarePlan({
      operation: 'consumer-replacement',
      resource_changes: [
        { address: 'cloudflare_queue_consumer.fedify', change: { actions: ['delete', 'create'] } },
        { address: 'cloudflare_queue.fedify_dlq', change: { actions: ['delete', 'create'] } },
        { address: 'cloudflare_d1_database.iori', change: { actions: ['update'] } },
      ],
    })).toEqual([
      'cloudflare_queue.fedify_dlq must not be replaced',
      'cloudflare_d1_database.iori is not allowed for consumer-replacement',
    ]);
  });

  it('requires the explicit route flag and rejects non-route changes during cutover', () => {
    const route = { address: 'cloudflare_workers_route.iori[0]', change: { actions: ['create'] } };

    expect(validateCloudflarePlan({ operation: 'route-cutover', resource_changes: [route] }))
      .toContain('cloudflare_workers_route.iori[0] requires the cutover plan');
    expect(validateCloudflarePlan({
      operation: 'route-cutover',
      allowProductionRoute: true,
      resource_changes: [
        route,
        { address: 'cloudflare_queue_consumer.fedify', change: { actions: ['update'] } },
      ],
    })).toEqual([
      'cloudflare_queue_consumer.fedify is not allowed for route-cutover',
    ]);
  });
});
