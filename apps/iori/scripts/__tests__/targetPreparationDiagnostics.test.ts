import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import {
  CONTROL_PLANE_APIS,
  controlPlaneApi,
  isPreparationReason,
  withReason,
} from '../target-preparation-diagnostics.mjs';

const representativeReasons = [
  'workers-http-403',
  'd1-exists',
  'kv-limit',
  'queues-shape',
  'r2-too-large',
  'zones-request',
  'state-mismatch',
  'worker-input',
  'worker-resources',
  'worker-deployment',
  'worker-version',
  'worker-subdomain',
  'worker-route',
  'worker-bindings-shape',
  'worker-binding-missing',
  'worker-binding-mismatch',
  'worker-binding-extra',
  'worker-secret-missing',
  'command-failed',
  'd1-baseline-mismatch',
  'aborted',
  'result-invalid',
  'cursor-invalid',
  'identity-mismatch',
  'mismatch',
  'config-invalid',
  'credentials-missing',
  'smoke-token-empty',
  'smoke-token-space',
  'smoke-token-charset',
  'smoke-token-short',
  'smoke-token-long',
  'vapid-rejected',
  'unclassified',
];
it.each(representativeReasons)('accepts the representative reason %s', (reason) => {
  expect(isPreparationReason(reason)).toBe(true);
});
const resourceReasons = [
  'resource-input',
  'resource-d1',
  'resource-kv',
  'resource-r2',
  'resource-queue-identity',
  'resource-queue-paused',
  'resource-queue-shape',
  'resource-queue-created',
  'resource-dlq-attached',
  'resource-consumer-count',
  'resource-producer',
  'resource-consumer-type',
  'resource-consumer-script',
  'resource-consumer-dlq',
  'resource-consumer-id',
  'resource-consumer-settings',
  'resource-domain-public',
];
it.each(resourceReasons)('accepts the resource readback reason %s', (reason) => {
  expect(isPreparationReason(reason)).toBe(true);
});
it.each(['resource-', 'resource-secret', 'Resource-d1', 'resource-d1\n', 'resource-d1-extra'])(
  'rejects the resource-like reason %j',
  (reason) => {
    expect(isPreparationReason(reason)).toBe(false);
  },
);
it('accepts every control plane API with every kind', () => {
  for (const api of CONTROL_PLANE_APIS) {
    for (const kind of ['http-401', 'http-503', 'request', 'too-large', 'shape', 'limit', 'exists']) {
      expect(isPreparationReason(`${api}-${kind}`)).toBe(true);
    }
  }
});
it.each([
  'https://secret.invalid/path',
  'Target readback failed.',
  'workers-http-99',
  'workers-http-600',
  'workers-http-4030',
  'accounts-request',
  'workers-',
  'workers-request-extra',
  'Workers-request',
  'state-mismatch\nIORI_DIAG stage=x',
  '',
])('rejects the reason %j', (reason) => {
  expect(isPreparationReason(reason)).toBe(false);
});
it('rejects a reason that is not a string', () => {
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
it('maps request paths to a fixed API word', () => {
  const root = `/accounts/${'a'.repeat(32)}`;
  expect(controlPlaneApi(`${root}/workers/scripts`)).toBe('workers');
  expect(controlPlaneApi(`${root}/workers/scripts/iori-worker/versions/v1`)).toBe('workers');
  expect(controlPlaneApi(`${root}/d1/database?per_page=100&page=1`)).toBe('d1');
  expect(controlPlaneApi(`${root}/storage/kv/namespaces/kv-id`)).toBe('kv');
  expect(controlPlaneApi(`${root}/queues?per_page=100&page=1`)).toBe('queues');
  expect(controlPlaneApi(`${root}/queues/queue-id`)).toBe('queues');
  expect(controlPlaneApi(`${root}/r2/buckets/queues-bucket/domains/managed`)).toBe('r2');
  expect(controlPlaneApi(`/zones/${'b'.repeat(32)}/workers/routes`)).toBe('zones');
  expect(controlPlaneApi(`${root}/unknown/secret-value`)).toBe('other');
  expect(controlPlaneApi('https://secret.invalid')).toBe('other');
});
