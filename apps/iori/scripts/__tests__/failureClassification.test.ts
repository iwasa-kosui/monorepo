import { expect, it } from 'vitest';

import { classifyFailure, isCutoverReason } from '../failure-classification.mjs';
import { SOURCE_REJECTION_DETAILS, SOURCE_SSH_REASONS } from '../source-transfer-protocol.mjs';

const failure = (reason?: string, message = 'fixture-secret-message') =>
  Object.assign(new Error(message), reason ? { diagnostic: { reason } } : {});
it('accepts the preparation, source and cutover words only', () => {
  for (
    const reason of [
      ...SOURCE_SSH_REASONS,
      ...SOURCE_REJECTION_DETAILS,
      'smoke-token-empty',
      'smoke-token-space',
      'smoke-token-charset',
      'smoke-token-short',
      'smoke-token-long',
    ]
  ) {
    expect(isCutoverReason(reason)).toBe(true);
  }
  for (const reason of ['Smoke_Failed', 'https://secret.invalid', 'terraform-', 'terraform-secret', undefined, 7]) {
    expect(isCutoverReason(reason)).toBe(false);
  }
});
it('prefers abort, then the diagnostic reason, then the message', () => {
  const deployFailed = 'Reviewed Worker deployment failed; retain current state.';
  expect(classifyFailure(failure('deploy-failed'), true)).toBe('aborted');
  expect(classifyFailure(Object.assign(failure('deploy-failed'), { name: 'TimeoutError' }))).toBe('aborted');
  expect(classifyFailure(failure('busy', deployFailed))).toBe('busy');
  expect(classifyFailure(failure('https://secret.invalid', deployFailed))).toBe('deploy-failed');
  expect(classifyFailure(failure(undefined, deployFailed))).toBe('deploy-failed');
});
it('falls back to unclassified for an unknown message, a non-string message and a non-error', () => {
  expect(classifyFailure(failure())).toBe('unclassified');
  expect(classifyFailure({ message: 7 })).toBe('unclassified');
  expect(classifyFailure(undefined)).toBe('unclassified');
  expect(classifyFailure('text')).toBe('unclassified');
});
