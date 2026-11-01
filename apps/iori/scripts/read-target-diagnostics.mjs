import { classifyFailure } from './failure-classification.mjs';

export const READ_TARGET_STEPS = Object.freeze([
  'config',
  'path',
  'tf-setup',
  'tf-init',
  'tf-show',
  'tf-output',
  'output-check',
  'expected',
  'write',
]);
const TERRAFORM_REASONS = new Set(['terraform-auth', 'terraform-unreachable', 'terraform-lock', 'terraform-other']);
const normalize = (text) =>
  String(text).slice(0, 200_000).replace(/\x1b\[[0-9;]*m/g, '').replace(/[│╷╵]/g, ' ').replace(/\s+/g, ' ');
const LOCK_PATTERNS = [
  /does not match any of the checksums recorded in the dependency lock file/,
  /Required plugins are not installed/,
  /Inconsistent dependency lock file/,
];
const AUTH_PATTERNS = [
  /\b(?:AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken)\b/,
  /\b(?:StatusCode|status code): ?40[13]\b/,
  /No valid credential sources found/,
];
const UNREACHABLE_PATTERNS = [
  /dial tcp/,
  /no such host/,
  /connection refused/,
  /connection reset by peer/,
  /i\/o timeout/,
  /context deadline exceeded/,
  /TLS handshake timeout/,
  /send request failed/,
];
export const classifyTerraformFailure = (stderr) => {
  const text = normalize(stderr);
  if (LOCK_PATTERNS.some((pattern) => pattern.test(text))) return 'terraform-lock';
  if (AUTH_PATTERNS.some((pattern) => pattern.test(text))) return 'terraform-auth';
  if (UNREACHABLE_PATTERNS.some((pattern) => pattern.test(text))) return 'terraform-unreachable';
  return 'terraform-other';
};
export const readTargetFailureLine = (step, error) => {
  const stepWord = READ_TARGET_STEPS.includes(step) ? step : 'unclassified';
  const reason = classifyFailure(error);
  const terraform = TERRAFORM_REASONS.has(reason);
  const exit = terraform && Number.isInteger(error?.exitCode) && error.exitCode >= 0 && error.exitCode <= 255
    ? String(error.exitCode)
    : 'none';
  const signal = terraform && typeof error?.signal === 'string' && /^[A-Z0-9]{1,12}$/.test(error.signal)
    ? error.signal
    : 'none';
  return `IORI_DIAG stage=target-read-${stepWord} program=${
    terraform ? 'terraform' : 'none'
  } exit=${exit} signal=${signal} reason=${reason}`;
};
