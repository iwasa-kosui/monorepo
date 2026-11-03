import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  assertTargetSummary,
  parseExpectedTarget,
  parsePreparationRecord,
  serializePreparationRecord,
} from '../migration-target-contract.mjs';
import { expectedTargetFixture, preparationFixture, targetSummaryFixture } from './migrationTargetFixture.js';

it('accepts an independent expected target and canonical prepared evidence', () => {
  const expected = expectedTargetFixture();
  expect(parseExpectedTarget(expected)).toEqual(expected);
  const body = serializePreparationRecord(preparationFixture());
  expect(parsePreparationRecord(body, expected).sha256).toBe(createHash('sha256').update(body).digest('hex'));
  expect(assertTargetSummary(targetSummaryFixture(), expected)).toBeTruthy();
});
it.each([
  'environment',
  'generation',
  'main_sha',
  'run_id',
  'account_id',
  'backend_bucket',
  'backend_key',
  'worker_name',
])('rejects changed identity %s', (key) => {
  const summary = targetSummaryFixture();
  Reflect.set(summary.identity, key, 'wrong');
  expect(() => assertTargetSummary(summary, expectedTargetFixture())).toThrow();
});
it.each(['d1', 'kv', 'uploads', 'transfer', 'queue', 'dlq', 'consumer'])('rejects changed resource %s', (key) => {
  const summary = targetSummaryFixture();
  Reflect.set(summary.resources, key, { id: 'wrong' });
  expect(() => assertTargetSummary(summary, expectedTargetFixture())).toThrow();
});
it('rejects extra keys, noncanonical bytes, oversized records and version/hash contradictions', () => {
  expect(() => parseExpectedTarget({ ...expectedTargetFixture(), bypass: true })).toThrow();
  const body = serializePreparationRecord(preparationFixture());
  expect(() => parsePreparationRecord(Buffer.concat([body, Buffer.from(' ')]), expectedTargetFixture())).toThrow();
  expect(() => parsePreparationRecord(Buffer.alloc(65537), expectedTargetFixture())).toThrow();
  const summary = targetSummaryFixture();
  summary.observed.worker_version_id = 'wrong';
  expect(() => assertTargetSummary(summary, expectedTargetFixture())).toThrow();
  const hash = targetSummaryFixture();
  hash.preparation.record_sha256 = '0'.repeat(64);
  expect(() => assertTargetSummary(hash, expectedTargetFixture())).toThrow();
});
it.each(['_run', 'a'.repeat(80)])('shares source safe run policy %s', (run) => {
  const target = expectedTargetFixture();
  target.identity.run_id = run;
  target.admission.runId = run;
  expect(parseExpectedTarget(target)).toBeTruthy();
});
it.each(['a.b', 'a:b', 'a'.repeat(81)])('rejects unsupported run %s', (run) => {
  const target = expectedTargetFixture();
  target.identity.run_id = run;
  target.admission.runId = run;
  expect(() => parseExpectedTarget(target)).toThrow();
});
