import { expect, it } from 'vitest';

import {
  ADOPT_ATTRIBUTE_WORDS,
  adoptPlanDetails,
  inspectAdoptedPlan,
  inspectRefreshPlan,
  isAdoptPlanDetail,
} from '../adopt-plan.mjs';
const expected = { hostname: 'staging.example.invalid', workerName: 'iori-staging-fixture1', zoneId: 'a'.repeat(32) };
const noop = (address: string, after: Record<string, unknown>) => ({
  address,
  change: { actions: ['no-op'], before: after, after },
});
const adoptedFixture = () => ({
  resource_changes: [
    noop('cloudflare_workers_route.iori[0]', {
      zone_id: expected.zoneId,
      pattern: `${expected.hostname}/*`,
      script: expected.workerName,
    }),
    noop('cloudflare_queue.fedify', { settings: { delivery_paused: false } }),
    noop('cloudflare_queue.fedify_dlq', { settings: { delivery_paused: true } }),
    noop('cloudflare_queue_consumer.fedify[0]', { script_name: expected.workerName }),
  ],
  output_changes: {
    worker_bindings: { actions: ['no-op'], before: { same: true }, after: { same: true } },
    target_identity: { actions: ['no-op'], before: {}, after: {} },
  },
});
const drift = (address: string, before: Record<string, unknown>, after: Record<string, unknown>) => ({
  address,
  change: { actions: ['update'], before, after },
});
const refreshFixture = (resource_drift: unknown[] = []) => ({
  resource_changes: adoptedFixture().resource_changes,
  resource_drift,
});
it('accepts a refresh plan without drift and one whose only drift is the Queue becoming active', () => {
  expect(inspectRefreshPlan(refreshFixture())).toEqual([]);
  expect(inspectRefreshPlan({ resource_changes: [] })).toEqual([]);
  expect(inspectRefreshPlan({})).toEqual([]);
  expect(
    inspectRefreshPlan(refreshFixture([
      drift(
        'cloudflare_queue.fedify',
        { modified_on: 'a', settings: { delivery_paused: true } },
        { modified_on: 'b', settings: { delivery_paused: false } },
      ),
    ])),
  ).toEqual([]);
  expect(
    inspectRefreshPlan(refreshFixture([
      drift('cloudflare_queue.fedify', { modified_on: 'a', settings: { delivery_paused: false } }, {
        modified_on: 'b',
        settings: { delivery_paused: false },
      }),
    ])),
  ).toEqual([]);
});
it('rejects a plan that is not an object or lists non-array state', () => {
  for (const plan of [null, 'text', { resource_changes: {} }, { resource_drift: {} }]) {
    expect(inspectRefreshPlan(plan)).toEqual([{ message: 'Refresh plan state is invalid' }]);
  }
  for (const plan of [null, {}, { resource_changes: {} }]) {
    expect(inspectAdoptedPlan(plan, expected)).toEqual([{ message: 'Resource state is required' }]);
  }
});
it.each([
  [
    'an update to another Queue attribute',
    drift(
      'cloudflare_queue.fedify',
      { settings: { delivery_paused: true, delivery_delay: 0 } },
      { settings: { delivery_paused: true, delivery_delay: 9 } },
    ),
    ['delivery-delay'],
  ],
  [
    'the Queue becoming paused',
    drift(
      'cloudflare_queue.fedify',
      { settings: { delivery_paused: false } },
      { settings: { delivery_paused: true } },
    ),
    ['delivery-paused'],
  ],
  [
    'the Dead Letter Queue',
    drift(
      'cloudflare_queue.fedify_dlq',
      { settings: { delivery_paused: true } },
      { settings: { delivery_paused: false } },
    ),
    ['delivery-paused'],
  ],
  ['a consumer', drift('cloudflare_queue_consumer.fedify[0]', { script_name: 'a' }, { script_name: 'b' }), [
    'script-name',
  ]],
  [
    'a route',
    drift('cloudflare_workers_route.iori[0]', { pattern: 'a/*', script: 'a' }, { pattern: 'b/*', script: 'b' }),
    [
      'pattern',
      'script',
    ],
  ],
  ['an unknown resource', drift('cloudflare_worker.iori', { name: 'a' }, { name: 'b' }), ['other']],
])('rejects drift in %s and lists the changed attributes', (_name, item, attributes) => {
  const issues = inspectRefreshPlan(refreshFixture([item]));
  expect(issues).toEqual([{
    message: 'Refresh drift is not allowed',
    address: item.address,
    actions: ['update'],
    attributes,
  }]);
});
it('rejects a drift that deletes or creates a resource', () => {
  for (const actions of [['delete'], ['create'], ['delete', 'create']]) {
    const item = { address: 'cloudflare_queue.fedify', change: { actions, before: null, after: null } };
    expect(inspectRefreshPlan(refreshFixture([item]))).toHaveLength(1);
  }
  const issues = inspectRefreshPlan(refreshFixture([{
    address: 'cloudflare_queue.fedify',
    change: { actions: ['delete'], before: { settings: {} }, after: null },
  }]));
  expect(issues[0]).toMatchObject({ actions: ['delete'], attributes: ['other'] });
});
it('rejects a refresh plan that changes or imports a resource', () => {
  const plan = refreshFixture();
  Object.assign(plan.resource_changes[1]!.change, {
    actions: ['update'],
    after: { settings: { delivery_paused: true } },
  });
  Object.assign(plan.resource_changes[0]!.change, { importing: { id: 'route' } });
  expect(inspectRefreshPlan(plan)).toEqual([
    {
      message: 'Refresh plan must not change resources',
      address: 'cloudflare_workers_route.iori[0]',
      actions: ['no-op'],
      attributes: [],
    },
    {
      message: 'Refresh plan must not change resources',
      address: 'cloudflare_queue.fedify',
      actions: ['update'],
      attributes: ['delivery-paused'],
    },
  ]);
});
it('accepts the plan that matches the selected route, an active Queue, a paused Dead Letter Queue and one consumer', () => {
  expect(inspectAdoptedPlan(adoptedFixture(), expected)).toEqual([]);
});
it('rejects the plan that changes, imports or drifts any resource, naming the attributes', () => {
  const plan = adoptedFixture();
  Object.assign(plan.resource_changes[2]!.change, {
    actions: ['update'],
    before: { settings: { delivery_paused: false } },
  });
  Object.assign(plan.resource_changes[3]!.change, { before: { script_name: 'old' } });
  Object.assign(plan.resource_changes[0]!.change, { importing: { id: 'route' } });
  expect(inspectAdoptedPlan(plan, expected)).toEqual([
    {
      message: 'Adopted plan must not change resources',
      address: 'cloudflare_workers_route.iori[0]',
      actions: ['no-op'],
      attributes: [],
    },
    {
      message: 'Adopted plan must not change resources',
      address: 'cloudflare_queue.fedify_dlq',
      actions: ['update'],
      attributes: ['delivery-paused'],
    },
    {
      message: 'Adopted plan must not change resources',
      address: 'cloudflare_queue_consumer.fedify[0]',
      actions: ['no-op'],
      attributes: ['script-name'],
    },
  ]);
});
it.each([
  ['zone', { zone_id: 'b'.repeat(32) }, ['zone-id']],
  ['pattern', { pattern: 'production.example.invalid/*' }, ['pattern']],
  ['script', { script: 'old-worker' }, ['script']],
])('rejects a route with another %s even when it is unchanged', (_name, change, attributes) => {
  const plan = adoptedFixture();
  const after = { ...plan.resource_changes[0]!.change.after, ...change };
  Object.assign(plan.resource_changes[0]!.change, { before: after, after });
  expect(inspectAdoptedPlan(plan, expected)).toEqual([{
    message: 'Only the selected route may be adopted',
    address: 'cloudflare_workers_route.iori[0]',
    actions: ['no-op'],
    attributes,
  }]);
});
it('rejects a missing, a duplicated or an unknown route without an address', () => {
  const none = adoptedFixture();
  none.resource_changes.shift();
  expect(inspectAdoptedPlan(none, expected)).toEqual([{ message: 'Only the selected route may be adopted' }]);
  const two = adoptedFixture();
  two.resource_changes.push(noop('cloudflare_workers_route.iori[1]', two.resource_changes[0]!.change.after));
  expect(inspectAdoptedPlan(two, expected)).toEqual([{ message: 'Only the selected route may be adopted' }]);
  const other = adoptedFixture();
  other.resource_changes[0]!.address = 'cloudflare_workers_route.other[0]';
  expect(inspectAdoptedPlan(other, expected)).toEqual([{
    message: 'Only the selected route may be adopted',
    address: 'cloudflare_workers_route.other[0]',
    actions: ['no-op'],
    attributes: [],
  }]);
});
it('rejects a paused Queue, an active Dead Letter Queue and a missing Queue', () => {
  const plan = adoptedFixture();
  plan.resource_changes[1] = noop('cloudflare_queue.fedify', { settings: { delivery_paused: true } });
  plan.resource_changes[2] = noop('cloudflare_queue.fedify_dlq', { settings: { delivery_paused: false } });
  expect(inspectAdoptedPlan(plan, expected)).toEqual([
    {
      message: 'Queue must be active',
      address: 'cloudflare_queue.fedify',
      actions: ['no-op'],
      attributes: ['delivery-paused'],
    },
    {
      message: 'Dead Letter Queue must remain paused',
      address: 'cloudflare_queue.fedify_dlq',
      actions: ['no-op'],
      attributes: ['delivery-paused'],
    },
  ]);
  const missing = adoptedFixture();
  missing.resource_changes.splice(1, 1);
  expect(inspectAdoptedPlan(missing, expected)).toEqual([{
    message: 'Queue must be active',
    address: 'cloudflare_queue.fedify',
  }]);
});
it('requires exactly one consumer and no output change', () => {
  const none = adoptedFixture();
  none.resource_changes.pop();
  expect(inspectAdoptedPlan(none, expected)).toEqual([{ message: 'Exactly one Queue consumer is required' }]);
  const two = adoptedFixture();
  two.resource_changes.push(noop('cloudflare_queue_consumer.fedify[1]', { script_name: expected.workerName }));
  expect(inspectAdoptedPlan(two, expected)).toEqual([{ message: 'Exactly one Queue consumer is required' }]);
  const outputs = adoptedFixture();
  Object.assign(outputs.output_changes.target_identity, { actions: ['update'] });
  expect(inspectAdoptedPlan(outputs, expected)).toEqual([{ message: 'Outputs must not change' }]);
});
it('turns issues into the plan words and fixed attribute words with the stage prefix', () => {
  const issues = [
    {
      message: 'x',
      address: 'cloudflare_queue.fedify',
      actions: ['update'],
      attributes: ['delivery-paused', 'modified-on'],
    },
    { message: 'x', address: 'cloudflare_queue_consumer.fedify[0]', actions: ['update'], attributes: ['script-name'] },
    { message: 'x', address: 'cloudflare_workers_route.iori[0]', actions: ['update'] },
    { message: 'x' },
  ];
  expect(adoptPlanDetails(issues, 'drift')).toEqual([
    'plan-queue-update',
    'plan-consumer-update',
    'plan-route-update',
    'plan-invalid',
    'drift-queue-delivery-paused',
    'drift-queue-modified-on',
    'drift-consumer-script-name',
  ]);
  expect(adoptPlanDetails(issues, 'diff').filter(detail => detail.startsWith('diff-'))).toEqual([
    'diff-queue-delivery-paused',
    'diff-queue-modified-on',
    'diff-consumer-script-name',
  ]);
  expect(() => adoptPlanDetails(issues, 'other' as never)).toThrow();
});
it('turns attributes outside the table into other and keeps at most eight words per resource with a more word', () => {
  const many = Object.fromEntries(Array.from({ length: 12 }, (_value, index) => [`unknown_${index}`, index]));
  const [unknown] = inspectRefreshPlan(refreshFixture([
    drift('cloudflare_queue.fedify', { name: 'a', ...many }, { name: 'b' }),
  ]));
  expect(unknown!.attributes).toEqual(['other']);
  const known = Object.fromEntries(
    [
      'queue_id',
      'queue_name',
      'account_id',
      'created_on',
      'modified_on',
      'consumers',
      'producers',
      'consumers_total_count',
      'producers_total_count',
    ].map((
      key,
    ) => [key, 'a']),
  );
  const changed = Object.fromEntries(Object.keys(known).map(key => [key, 'b']));
  const [capped] = inspectRefreshPlan(refreshFixture([drift('cloudflare_queue.fedify_dlq', known, changed)]));
  expect(capped!.attributes).toHaveLength(8);
  expect(capped!.attributes!.at(-1)).toBe('more');
  expect(new Set(capped!.attributes).size).toBe(8);
});
it('keeps every resource and attribute word within the public reason pattern', () => {
  for (const prefix of ['drift', 'diff']) {
    for (const [resource, words] of Object.entries(ADOPT_ATTRIBUTE_WORDS)) {
      expect(words).toContain('other');
      expect(words).toContain('more');
      for (const word of words) {
        const detail = `${prefix}-${resource}-${word}`;
        expect(detail).toMatch(/^[a-z0-9-]{1,40}$/);
        expect(isAdoptPlanDetail(detail)).toBe(true);
      }
    }
  }
  for (
    const detail of ['drift-queue', 'drift-queue-unknown', 'diff-route-delivery-paused', 'drift_queue_other', 7, null]
  ) {
    expect(isAdoptPlanDetail(detail)).toBe(false);
  }
});
it('never puts a value of the plan into an issue or a detail', () => {
  const secret = 'private-value-0123';
  const issues = inspectRefreshPlan(refreshFixture([
    drift('cloudflare_queue_consumer.fedify[0]', { script_name: secret, extra: secret }, {
      script_name: `${secret}-new`,
      extra: `${secret}-new`,
    }),
  ]));
  expect(JSON.stringify(issues)).not.toContain(secret);
  expect(JSON.stringify(adoptPlanDetails(issues, 'drift'))).not.toContain(secret);
});
