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
      'smoke-failed',
      'plan-rejected',
      'terraform-auth',
      'terraform-unreachable',
      'terraform-lock',
      'terraform-other',
    ]
  ) {
    expect(isCutoverReason(reason)).toBe(true);
  }
  for (const reason of ['Smoke_Failed', 'https://secret.invalid', 'terraform-', 'terraform-secret', undefined, 7]) {
    expect(isCutoverReason(reason)).toBe(false);
  }
});
it('prefers abort, then the diagnostic reason, then the message', () => {
  expect(classifyFailure(failure('smoke-failed'), true)).toBe('aborted');
  expect(classifyFailure(Object.assign(failure('smoke-failed'), { name: 'TimeoutError' }))).toBe('aborted');
  expect(classifyFailure(failure('busy', 'Reviewed smoke failed.'))).toBe('busy');
  expect(classifyFailure(failure('https://secret.invalid', 'Reviewed smoke failed.'))).toBe('smoke-failed');
  expect(classifyFailure(failure(undefined, 'Reviewed smoke failed.'))).toBe('smoke-failed');
});
it('falls back to unclassified for an unknown message, a non-string message and a non-error', () => {
  expect(classifyFailure(failure())).toBe('unclassified');
  expect(classifyFailure({ message: 7 })).toBe('unclassified');
  expect(classifyFailure(undefined)).toBe('unclassified');
  expect(classifyFailure('text')).toBe('unclassified');
});
it.each([
  'Independent expected target is required.',
  'Protected workflow invocation is invalid.',
  'Executor configuration is required.',
  'Invalid zone.',
  'Target readback configuration is required.',
])('classifies the configuration message "%s" as config-invalid', (message) => {
  expect(classifyFailure(new Error(message))).toBe('config-invalid');
});
it('classifies the migration target evidence message as identity-mismatch', () => {
  expect(classifyFailure(new Error('Migration target evidence is invalid.'))).toBe('identity-mismatch');
});
