import { expect, it } from 'vitest';

import {
  CONTROL_PLANE_APIS,
  controlPlaneApi,
  isPreparationReason,
  PREPARATION_STAGES,
  preparationFailureLine,
  withReason,
} from '../target-preparation-diagnostics.mjs';

// Same pattern as the public relay in hosted-workflow.mjs.
const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const reasonOf = (reason: string) => ({ diagnostic: { reason } });
const representativeReasons = [
  'workers-http-403',
  'd1-exists',
  'kv-limit',
  'queues-shape',
  'r2-too-large',
  'zones-request',
  'state-mismatch',
  'not-sealed',
  'command-failed',
  'aborted',
  'state-present',
  'plan-rejected',
  'output-mismatch',
  'output-invalid',
  'result-invalid',
  'identity-mismatch',
  'mismatch',
  'config-invalid',
  'credentials-missing',
  'credential-not-distinct',
  'vapid-rejected',
  'unclassified',
];
it('keeps the stage vocabulary fixed', () => {
  expect(PREPARATION_STAGES).toEqual([
    'inputs',
    'vapid',
    'setup',
    'fresh-check',
    'tf-init',
    'tf-show',
    'tf-plan',
    'tf-apply',
    'resource-read',
    'deploy',
    'attach',
    'attach-tf-plan',
    'attach-tf-apply',
    'attach-read',
    'readback',
    'record',
  ]);
});
it.each(PREPARATION_STAGES)('builds a public line for stage %s with every representative reason', (stage) => {
  for (const reason of representativeReasons) {
    const line = preparationFailureLine(stage, reasonOf(reason), false);
    expect(line).toBe(`IORI_DIAG stage=prepare-${stage} program=none exit=none signal=none reason=${reason}`);
    expect(line).toMatch(publicLine);
  }
});
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
])('rejects the reason %j and reports unclassified', (reason) => {
  expect(isPreparationReason(reason)).toBe(false);
  const line = preparationFailureLine('tf-plan', reasonOf(reason), false);
  expect(line).toBe('IORI_DIAG stage=prepare-tf-plan program=none exit=none signal=none reason=unclassified');
  expect(line).toMatch(publicLine);
});
it('rejects a reason that is not a string', () => {
  for (const reason of [undefined, null, 403, {}, ['workers-request']]) {
    expect(isPreparationReason(reason)).toBe(false);
  }
  expect(preparationFailureLine('tf-plan', { diagnostic: { reason: 403 } }, false)).toMatch(/reason=unclassified$/);
});
it.each(['unknown', 'prepare-inputs', '', undefined, null, 'https://secret.invalid'])(
  'reports the stage %j outside the list as prepare-unclassified',
  (stage) => {
    const line = preparationFailureLine(stage, reasonOf('command-failed'), false);
    expect(line).toBe('IORI_DIAG stage=prepare-unclassified program=none exit=none signal=none reason=command-failed');
    expect(line).toMatch(publicLine);
  },
);
it('classifies errors without a diagnostic as aborted only for an aborted signal or abort names', () => {
  const suffix = (line: string) => line.split(' ').at(-1);
  expect(suffix(preparationFailureLine('deploy', new Error('x'), false))).toBe('reason=unclassified');
  expect(suffix(preparationFailureLine('deploy', new Error('x'), true))).toBe('reason=aborted');
  expect(suffix(preparationFailureLine('deploy', undefined, true))).toBe('reason=aborted');
  expect(suffix(preparationFailureLine('deploy', Object.assign(new Error('x'), { name: 'AbortError' }), false))).toBe(
    'reason=aborted',
  );
  expect(suffix(preparationFailureLine('deploy', Object.assign(new Error('x'), { name: 'TimeoutError' }), false))).toBe(
    'reason=aborted',
  );
  expect(suffix(preparationFailureLine('deploy', undefined, false))).toBe('reason=unclassified');
  expect(suffix(preparationFailureLine('deploy', 'https://secret.invalid', false))).toBe('reason=unclassified');
});
it('keeps a diagnostic reason when the signal is aborted', () => {
  expect(preparationFailureLine('tf-apply', reasonOf('output-mismatch'), true)).toMatch(/reason=output-mismatch$/);
});
it('never prints the error message', () => {
  const error = Object.assign(new Error('https://secret.invalid/token'), reasonOf('plan-rejected'));
  expect(preparationFailureLine('tf-plan', error, false)).not.toContain('secret');
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
