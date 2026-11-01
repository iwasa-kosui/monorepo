import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { CUTOVER_STAGES, cutoverFailureLines, isCutoverReason } from '../cutover-diagnostics.mjs';
// @ts-expect-error The smoke diagnostics module is executed directly by Node as ESM.
import { SMOKE_ITEM_WORDS, SMOKE_MAX_DETAIL_LINES, smokeFailureDetails } from '../smoke-diagnostics.mjs';
import { SOURCE_REJECTION_DETAILS, SOURCE_SSH_REASONS } from '../source-transfer-protocol.mjs';

const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const failure = (reason?: string, details?: string[], message = 'fixture-secret-message') =>
  Object.assign(new Error(message), reason ? { diagnostic: { reason, ...(details ? { details } : {}) } } : {});
it('pins the cutover stage vocabulary', () => {
  expect(CUTOVER_STAGES).toEqual([
    'inputs',
    'main-check',
    'restore',
    'tf-init',
    'target-check',
    'source',
    'gate-smoke',
    'to-smoke',
    'smoke-worker',
    'gate-route',
    'read-smoke',
    'route-plan',
    'route-apply',
    'read-route',
    'smoke-canonical',
    'gate-active',
    'to-active',
    'gate-queue',
    'read-active',
    'queue-plan',
    'queue-apply',
    'read-resume',
    'smoke-final',
  ]);
  expect(Object.isFrozen(CUTOVER_STAGES)).toBe(true);
});
it('keeps every public stage word within the hosted workflow pattern', () => {
  for (const stage of [...CUTOVER_STAGES, 'unclassified']) {
    const [line] = cutoverFailureLines(stage, failure('mismatch'), false);
    expect(`cutover-${stage}`.length).toBeLessThanOrEqual(24);
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line!)).toEqual([]);
  }
});
it('reports the stage and a fixed reason without the message', () => {
  const lines = cutoverFailureLines('route-plan', failure('plan-rejected', ['plan-route-create']), false);
  expect(lines).toEqual([
    'IORI_DIAG stage=cutover-route-plan program=none exit=none signal=none reason=plan-route-create',
    'IORI_DIAG stage=cutover-route-plan program=none exit=none signal=none reason=plan-rejected',
  ]);
  expect(lines.join('\n')).not.toContain('fixture-secret-message');
});
it('uses cutover-unclassified for a stage outside the vocabulary', () => {
  for (const stage of ['unknown', undefined, 'prepare-inputs']) {
    expect(cutoverFailureLines(stage, failure('mismatch'), false)).toEqual([
      'IORI_DIAG stage=cutover-unclassified program=none exit=none signal=none reason=mismatch',
    ]);
  }
});
it('prints at most fourteen distinct allowed details and then the classification', () => {
  const details = [
    'plan-d1-update',
    'plan-d1-update',
    'https://secret.invalid',
    'plan-uploads-update',
    'plan-kv-update',
    'plan-queue-update',
    'plan-dlq-update',
    'plan-consumer-update',
    'plan-route-create',
    'plan-d1-delete',
    'plan-kv-delete',
    'plan-consumer-delete',
    'smoke-health-503-status-text',
    'smoke-healthz-503-status-json',
    'smoke-readyz-503-status-none',
    'smoke-asset-none-request-dns',
    'smoke-inbox-none-request-timeout',
  ];
  const lines = cutoverFailureLines('queue-plan', failure('plan-rejected', details), false);
  expect(lines.map(line => line.split('reason=')[1])).toEqual([
    'plan-d1-update',
    'plan-uploads-update',
    'plan-kv-update',
    'plan-queue-update',
    'plan-dlq-update',
    'plan-consumer-update',
    'plan-route-create',
    'plan-d1-delete',
    'plan-kv-delete',
    'plan-consumer-delete',
    'smoke-health-503-status-text',
    'smoke-healthz-503-status-json',
    'smoke-readyz-503-status-none',
    'smoke-asset-none-request-dns',
    'plan-rejected',
  ]);
  expect(lines.join('\n')).not.toContain('secret');
});
it('prints every failed smoke item word and the token class and then the smoke-failed classification', () => {
  const details = [
    'smoke-token-ok',
    ...smokeFailureDetails(
      Object.keys(SMOKE_ITEM_WORDS).map(name => ({
        name,
        ok: false,
        status: 503,
        contentType: 'text/plain',
        failure: 'status mismatch',
      })),
    ),
  ] as string[];
  expect(SMOKE_MAX_DETAIL_LINES).toBe(Object.keys(SMOKE_ITEM_WORDS).length + 1);
  expect(details).toHaveLength(SMOKE_MAX_DETAIL_LINES);
  const lines = cutoverFailureLines('smoke-worker', failure('smoke-failed', details, 'Reviewed smoke failed.'), false);
  expect(lines).toHaveLength(SMOKE_MAX_DETAIL_LINES + 1);
  expect(lines.map(line => line.split('reason=')[1])).toEqual([...details, 'smoke-failed']);
  for (const line of lines) {
    expect(line).toMatch(publicLine);
    expect(line.startsWith('IORI_DIAG stage=cutover-smoke-worker ')).toBe(true);
    expect(assertWorkflowOutput(line)).toEqual([]);
  }
});
it('prints the status content type, request cause and token class words', () => {
  const details = [
    'smoke-token-short',
    'smoke-readyz-503-status-text',
    'smoke-readyz-503-status-json',
    'smoke-readyz-503-status-html',
    'smoke-readyz-503-status-none',
    'smoke-readyz-503-status-other',
    'smoke-webfinger-none-request-timeout',
    'smoke-webfinger-none-request-abort',
    'smoke-webfinger-none-request-dns',
    'smoke-webfinger-none-request-connect',
    'smoke-webfinger-none-request-tls',
    'smoke-webfinger-none-request-redirect',
    'smoke-webfinger-none-request-other',
  ];
  const lines = cutoverFailureLines('smoke-final', failure('smoke-failed', details), false);
  expect(lines.map(line => line.split('reason=')[1])).toEqual([...details, 'smoke-failed']);
  for (const line of lines) expect(line).toMatch(publicLine);
});
it('drops smoke details outside the fixed smoke vocabulary', () => {
  const lines = cutoverFailureLines(
    'smoke-final',
    failure('smoke-failed', [
      'smoke-readyz-503-status-text',
      'smoke-readyz-99-status-text',
      'smoke-readyz-600-status-text',
      'smoke-Readyz-503-status-text',
      'smoke-secret-503-status-text',
      'smoke-readyz-503-body',
      'smoke-readyz-503-status',
      'smoke-readyz-503-status-xml',
      'smoke-inbox-none-request',
      'smoke-inbox-none-request-foo',
      'smoke-token-bad',
      'smoke-token-ok-extra',
      'readyz',
    ]),
    false,
  );
  expect(lines.map(line => line.split('reason=')[1])).toEqual(['smoke-readyz-503-status-text', 'smoke-failed']);
});
it('drops every detail that is not a fixed word', () => {
  const lines = cutoverFailureLines(
    'route-plan',
    failure('plan-rejected', ['smoke-failed', 'plan-Queue', '/home/secret'] as string[]),
    false,
  );
  expect(lines).toEqual([
    'IORI_DIAG stage=cutover-route-plan program=none exit=none signal=none reason=plan-rejected',
  ]);
});
it('accepts the preparation, source and cutover reasons only', () => {
  for (
    const reason of [
      ...SOURCE_SSH_REASONS,
      ...SOURCE_REJECTION_DETAILS,
      'mismatch',
      'plan-queue-update',
      'queues-http-503',
      'reviewed-main-required',
      'reviewed-checkout-mismatch',
      'reviewed-checkout-dirty',
      'reviewed-main-changed',
      'job-budget-exhausted',
      'smoke-failed',
      'smoke-token-empty',
      'smoke-token-space',
      'smoke-token-short',
      'smoke-token-long',
      'verify-failed',
      'deploy-failed',
      'source-not-quiescent',
      'terraform-auth',
      'terraform-unreachable',
      'terraform-lock',
      'terraform-other',
    ]
  ) expect(isCutoverReason(reason), reason).toBe(true);
  for (const reason of ['', 'Secret_Value', 'a/b', undefined, 3, 'https://x.invalid']) {
    expect(isCutoverReason(reason), String(reason)).toBe(false);
  }
});
it('classifies by aborted, then diagnostic reason, then message table, then unclassified', () => {
  const reasonOf = (error: unknown, aborted = false) =>
    cutoverFailureLines('source', error, aborted).at(-1)!.split('reason=')[1];
  expect(reasonOf(failure('mismatch'), true)).toBe('aborted');
  expect(reasonOf(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('aborted');
  expect(reasonOf(failure('source-not-quiescent', undefined, 'Reviewed smoke failed.'))).toBe('source-not-quiescent');
  expect(reasonOf(failure('Secret_Value', undefined, 'Reviewed smoke failed.'))).toBe('smoke-failed');
  expect(reasonOf(failure(undefined, undefined, 'Fresh verification failed.'))).toBe('verify-failed');
  expect(reasonOf(failure(undefined, undefined, 'something else with /secret/path'))).toBe('unclassified');
  expect(reasonOf(undefined)).toBe('unclassified');
});
it.each([
  ['Reviewed main is required.', 'reviewed-main-required'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Hosted job budget is exhausted.', 'job-budget-exhausted'],
  ['Reviewed smoke failed.', 'smoke-failed'],
  ['Fresh verification failed.', 'verify-failed'],
  ['Reviewed Worker deployment failed; retain current state.', 'deploy-failed'],
  ['Invalid source inputs.', 'config-invalid'],
  ['Fresh verification configuration is required.', 'config-invalid'],
  ['Target setup configuration is required.', 'config-invalid'],
  ['Target setup invocation is invalid.', 'config-invalid'],
])('maps the exact message %s to %s', (message, reason) => {
  expect(cutoverFailureLines('main-check', new Error(message), false)).toEqual([
    `IORI_DIAG stage=cutover-main-check program=none exit=none signal=none reason=${reason}`,
  ]);
  expect(cutoverFailureLines('main-check', new Error(`${message} extra`), false)[0]).toContain('reason=unclassified');
});
