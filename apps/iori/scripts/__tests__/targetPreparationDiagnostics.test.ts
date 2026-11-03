import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import {
  CONTROL_PLANE_APIS,
  controlPlaneApi,
  isPreparationReason,
  planRejectionDetails,
  PREPARATION_STAGES,
  preparationDetailLines,
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
  'route-id-invalid',
  'queue-not-paused',
  'not-sealed',
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
  'state-present',
  'plan-rejected',
  'plan-invalid',
  'plan-bindings-changed',
  'plan-queue-update',
  'plan-transfer-domain-replace',
  'output-mismatch',
  'output-invalid',
  'result-invalid',
  'identity-mismatch',
  'mismatch',
  'config-invalid',
  'credentials-missing',
  'smoke-token-empty',
  'smoke-token-space',
  'smoke-token-charset',
  'smoke-token-short',
  'smoke-token-long',
  'credential-not-distinct',
  'vapid-rejected',
  'terraform-auth',
  'terraform-unreachable',
  'terraform-lock',
  'terraform-other',
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
    'deploy-read',
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
it.each(resourceReasons)('accepts the resource readback reason %s as a public detail line', (reason) => {
  expect(isPreparationReason(reason)).toBe(true);
  const lines = preparationDetailLines('attach-read', { diagnostic: { reason: 'state-mismatch', details: [reason] } });
  expect(lines).toEqual([`IORI_DIAG stage=prepare-attach-read program=none exit=none signal=none reason=${reason}`]);
  expect(lines[0]).toMatch(publicLine);
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
it.each([
  ['cloudflare_d1_database.iori', 'd1'],
  ['cloudflare_r2_bucket.uploads', 'uploads'],
  ['cloudflare_workers_kv_namespace.fedify', 'kv'],
  ['cloudflare_queue.fedify', 'queue'],
  ['cloudflare_queue.fedify_dlq', 'dlq'],
  ['cloudflare_r2_bucket.migration', 'transfer'],
  ['cloudflare_r2_managed_domain.migration', 'transfer-domain'],
  ['cloudflare_queue_consumer.fedify', 'consumer'],
  ['cloudflare_queue_consumer.fedify[0]', 'consumer'],
  ['cloudflare_workers_route.iori', 'route'],
  ['cloudflare_workers_route.iori[0]', 'route'],
  ['cloudflare_worker.iori', 'other'],
  ['https://secret.invalid/token', 'other'],
  ['toString', 'other'],
])('maps the address %s to the resource word %s', (address, word) => {
  expect(planRejectionDetails([{ message: 'x', address, actions: ['update'] }])).toEqual([`plan-${word}-update`]);
});
it.each([
  [['create'], 'create'],
  [['update'], 'update'],
  [['delete'], 'delete'],
  [['no-op'], 'no-op'],
  [['delete', 'create'], 'replace'],
  [['create', 'delete'], 'replace'],
  [['read'], 'other'],
  [['create', 'update'], 'other'],
  [['delete', 'create', 'update'], 'other'],
  [[], 'other'],
  [undefined, 'other'],
])('maps the actions %j to the action word %s', (actions, word) => {
  expect(planRejectionDetails([{ message: 'x', address: 'cloudflare_queue.fedify', actions }])).toEqual([
    `plan-queue-${word}`,
  ]);
});
it('maps issues without an address to plan-invalid and removes duplicates', () => {
  expect(
    planRejectionDetails([
      { message: 'Invalid preparation plan' },
      { message: 'a', address: 'cloudflare_queue.fedify', actions: ['update'] },
      { message: 'b', address: 'cloudflare_queue.fedify', actions: ['update'] },
      { message: 'worker_bindings output must not change' },
    ]),
  ).toEqual(['plan-invalid', 'plan-queue-update']);
  expect(planRejectionDetails([])).toEqual([]);
});
it('accepts plan reasons only with a known resource word and action word', () => {
  for (const reason of ['plan-queue-update', 'plan-transfer-domain-replace', 'plan-other-other', 'plan-d1-no-op']) {
    expect(isPreparationReason(reason)).toBe(true);
  }
  for (
    const reason of [
      'plan-secret-update',
      'plan-queue-modify',
      'plan-queue-',
      'plan--update',
      'plan-queue-update\n',
      'plan-queue-update\nIORI_DIAG stage=x',
      'plan-queue-update-extra',
      'Plan-queue-update',
    ]
  ) expect(isPreparationReason(reason)).toBe(false);
});
const detailsOf = (details: unknown) => ({ diagnostic: { reason: 'plan-rejected', details } });
it('builds public lines from the details before the failure line shape', () => {
  const lines = preparationDetailLines('attach-tf-plan', detailsOf(['plan-queue-update', 'plan-bindings-changed']));
  expect(lines).toEqual([
    'IORI_DIAG stage=prepare-attach-tf-plan program=none exit=none signal=none reason=plan-queue-update',
    'IORI_DIAG stage=prepare-attach-tf-plan program=none exit=none signal=none reason=plan-bindings-changed',
  ]);
  for (const line of lines) expect(line).toMatch(publicLine);
});
it('limits the detail lines to eight and removes duplicates', () => {
  const resources = ['d1', 'uploads', 'kv', 'queue', 'dlq', 'transfer', 'transfer-domain', 'consumer', 'route'];
  const details = [...resources, ...resources, 'plan-queue-update'].map((word) =>
    word.startsWith('plan-') ? word : `plan-${word}-create`
  );
  const lines = preparationDetailLines('tf-plan', detailsOf(details));
  expect(lines).toHaveLength(8);
  expect(new Set(lines).size).toBe(8);
  expect(lines[0]).toMatch(/reason=plan-d1-create$/);
  expect(lines[7]).toMatch(/reason=plan-consumer-create$/);
  expect(preparationDetailLines('tf-plan', detailsOf(['plan-queue-update', 'plan-queue-update']))).toHaveLength(1);
});
it('drops details outside the vocabulary and returns nothing for missing or empty details', () => {
  const lines = preparationDetailLines(
    'tf-plan',
    detailsOf([
      'plan-secret-update',
      'plan-queue-update\nIORI_DIAG stage=x',
      403,
      null,
      'https://secret.invalid',
      'plan-d1-create',
    ]),
  );
  expect(lines).toEqual(['IORI_DIAG stage=prepare-tf-plan program=none exit=none signal=none reason=plan-d1-create']);
  expect(preparationDetailLines('tf-plan', detailsOf([]))).toEqual([]);
  expect(preparationDetailLines('tf-plan', detailsOf('plan-d1-create'))).toEqual([]);
  expect(preparationDetailLines('tf-plan', reasonOf('plan-rejected'))).toEqual([]);
  expect(preparationDetailLines('tf-plan', new Error('x'))).toEqual([]);
  expect(preparationDetailLines('tf-plan', undefined)).toEqual([]);
});
it('uses prepare-unclassified for a detail line outside the stage list', () => {
  const lines = preparationDetailLines('https://secret.invalid', detailsOf(['plan-d1-create']));
  expect(lines).toEqual([
    'IORI_DIAG stage=prepare-unclassified program=none exit=none signal=none reason=plan-d1-create',
  ]);
  expect(lines[0]).toMatch(publicLine);
});
