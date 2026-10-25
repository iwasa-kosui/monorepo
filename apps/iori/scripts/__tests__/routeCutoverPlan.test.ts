import { expect, it } from 'vitest';

import { validateRouteCutoverPlan } from '../route-cutover-plan.mjs';
const expected = { hostname: 'staging.example.invalid', workerName: 'iori-staging-fixture1', zoneId: 'a'.repeat(32) };
const fixture = () => ({
  resource_changes: [
    {
      address: 'cloudflare_workers_route.iori[0]',
      change: {
        actions: ['create'],
        before: null,
        after: { zone_id: expected.zoneId, pattern: `${expected.hostname}/*`, script: expected.workerName },
      },
    },
    ...['fedify', 'fedify_dlq'].map(name => ({
      address: `cloudflare_queue.${name}`,
      change: {
        actions: ['no-op'],
        before: { settings: { delivery_paused: true } },
        after: { settings: { delivery_paused: true } },
      },
    })),
  ],
  output_changes: { worker_bindings: { actions: ['no-op'], before: { same: true }, after: { same: true } } },
  planned_values: { outputs: { worker_bindings: { value: { same: true } } } },
});
it('permits only the selected hostname route with both Queues still paused', () => {
  expect(validateRouteCutoverPlan(fixture(), expected)).toEqual([]);
});
it.each(['hostname', 'script', 'pause', 'extra'])('rejects %s drift', failure => {
  const plan = fixture();
  if (failure === 'hostname') {
    plan.resource_changes[0].change.after = {
      ...plan.resource_changes[0].change.after,
      pattern: 'production.example.invalid/*',
    };
  }
  if (failure === 'script') {
    plan.resource_changes[0].change.after = { ...plan.resource_changes[0].change.after, script: 'old-worker' };
  }
  if (failure === 'pause') plan.resource_changes[1].change.after = { settings: { delivery_paused: false } };
  if (failure === 'extra') {
    plan.resource_changes.push(
      {
        address: 'cloudflare_workers_route.other[0]',
        change: { actions: ['create'], before: null, after: {} },
      } as never,
    );
  }
  expect(validateRouteCutoverPlan(plan, expected).length).toBeGreaterThan(0);
});
