import { expect, it } from 'vitest';

import { inspectRouteCutoverPlan, validateRouteCutoverPlan } from '../route-cutover-plan.mjs';
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
it('keeps the validation messages while exposing the address and actions of each issue', () => {
  const plan = fixture();
  plan.resource_changes[1]!.change.after = { settings: { delivery_paused: false } };
  plan.resource_changes[2]!.change.after = { settings: { delivery_paused: false } };
  expect(inspectRouteCutoverPlan(plan, expected)).toEqual([
    { message: 'Queues must remain paused', address: 'cloudflare_queue.fedify', actions: ['no-op'] },
    { message: 'Queues must remain paused', address: 'cloudflare_queue.fedify_dlq', actions: ['no-op'] },
  ]);
  expect(validateRouteCutoverPlan(plan, expected)).toEqual(['Queues must remain paused', 'Queues must remain paused']);
});
it('exposes the selected route and imported resources, and leaves ambiguous issues without an address', () => {
  const wrong = fixture();
  wrong.resource_changes[0]!.change.after = { ...wrong.resource_changes[0]!.change.after, script: 'old-worker' };
  expect(inspectRouteCutoverPlan(wrong, expected)).toEqual([
    {
      message: 'Only the selected route may be prepared',
      address: 'cloudflare_workers_route.iori[0]',
      actions: ['create'],
    },
  ]);
  const imported = fixture();
  Object.assign(imported.resource_changes[1]!.change, { importing: { id: 'queue' } });
  expect(inspectRouteCutoverPlan(imported, expected)).toContainEqual({
    message: 'Route preparation must not import resources',
    address: 'cloudflare_queue.fedify',
    actions: ['no-op'],
  });
  const none = fixture();
  none.resource_changes.shift();
  expect(inspectRouteCutoverPlan(none, expected)).toEqual([{ message: 'Only the selected route may be prepared' }]);
  const stateless = { ...fixture(), resource_changes: undefined };
  expect(validateRouteCutoverPlan(stateless, expected)).toContain('Route state is required');
  expect(inspectRouteCutoverPlan(stateless, expected).at(-1)).toEqual({ message: 'Route state is required' });
});
