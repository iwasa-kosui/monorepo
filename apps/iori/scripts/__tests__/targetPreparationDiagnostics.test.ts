import { expect, it } from 'vitest';

import { isPreparationReason, withReason } from '../target-preparation-diagnostics.mjs';

it.each(['resource-', 'resource-secret', 'Resource-d1', 'resource-d1\n', 'resource-d1-extra'])(
  'rejects the resource-like reason %j',
  (reason) => {
    expect(isPreparationReason(reason)).toBe(false);
  },
);
it.each([
  'https://secret.invalid/path',
  'Target readback failed.',
  'workers-http-99',
  'accounts-request',
  'workers-request-extra',
  'state-mismatch\nIORI_DIAG stage=x',
])('rejects the reason %j', (reason) => {
  expect(isPreparationReason(reason)).toBe(false);
});
it('rejects a reason that is not a string', () => {
  expect(isPreparationReason('workers-http-403')).toBe(true);
  for (const reason of [undefined, null, 403, {}, ['workers-request']]) {
    expect(isPreparationReason(reason)).toBe(false);
  }
});
it('attaches a reason once without replacing an existing diagnostic', () => {
  const first = withReason(new Error('x'), 'vapid-rejected');
  expect(first.diagnostic).toEqual({ reason: 'vapid-rejected' });
  expect(withReason(first, 'unclassified').diagnostic).toEqual({ reason: 'vapid-rejected' });
  expect(withReason('text', 'mismatch').diagnostic).toEqual({ reason: 'mismatch' });
});
