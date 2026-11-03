import { expect, it } from 'vitest';
import { admissionEnvironment, parseExpectedTarget } from '../migration-target-contract.mjs';
import { targetSetupConfiguration } from '../migration-target-setup.mjs';
import { expectedTargetFixture } from './migrationTargetFixture.js';

it('accepts an independent expected target', () => {
  const expected = expectedTargetFixture();
  expect(parseExpectedTarget(expected)).toEqual(expected);
});
it.each([
  'environment',
  'generation',
  'main_sha',
  'run_id',
  'account_id',
  'backend_key',
  'worker_name',
])('rejects changed identity %s', (key) => {
  const target = expectedTargetFixture();
  Reflect.set(target.identity, key, 'wrong');
  expect(() => parseExpectedTarget(target)).toThrow();
});
it.each(['d1', 'kv', 'uploads', 'transfer', 'queue', 'dlq', 'consumer'])('rejects changed resource %s', (key) => {
  const target = expectedTargetFixture();
  Reflect.set(target.resources, key, { id: 'wrong' });
  expect(() => parseExpectedTarget(target)).toThrow();
});
it('rejects extra keys and a backend bucket in the identity', () => {
  expect(() => parseExpectedTarget({ ...expectedTargetFixture(), bypass: true })).toThrow();
  const target = expectedTargetFixture();
  expect(() => parseExpectedTarget({ ...target, identity: { ...target.identity, backend_bucket: 'tf-state' } }))
    .toThrow();
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
const setupEnvironment = (target: ReturnType<typeof expectedTargetFixture>, admission: string) => ({
  IORI_ENVIRONMENT: target.identity.environment,
  IORI_GENERATION: target.identity.generation,
  CLOUDFLARE_ACCOUNT_ID: target.identity.account_id,
  MAIN_SHA: target.identity.main_sha,
  IORI_MIGRATION_RUN_ID: target.identity.run_id,
  CLOUDFLARE_ZONE_ID: 'b'.repeat(32),
  IORI_ADMISSION_IDENTITY: admission,
  ORIGIN: `https://${target.admission.hostname}`,
  CLOUDFLARE_API_TOKEN: 'fixture',
});
it('normalizes pretty or reordered admission identity', () => {
  const target = expectedTargetFixture();
  const reordered = Object.fromEntries(Object.entries(target.admission).reverse());
  const config = targetSetupConfiguration(setupEnvironment(target, JSON.stringify(reordered, null, 2)));
  expect(config.admissionEnvironment).toEqual(admissionEnvironment(target));
  expect(config.admission).toEqual(target.admission);
});
it('rejects an unknown key in the admission identity', () => {
  const target = expectedTargetFixture();
  expect(() =>
    targetSetupConfiguration(setupEnvironment(target, JSON.stringify({ ...target.admission, unknown: true })))
  )
    .toThrow();
});
