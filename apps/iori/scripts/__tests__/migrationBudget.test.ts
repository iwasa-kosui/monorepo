import { expect, it } from 'vitest';
import { migrationBudget, parseMigrationRehearsal } from '../migration-budget.mjs';
export const rehearsalFixture = () =>
  parseMigrationRehearsal({
    schema: 'iori-migration-rehearsal/v1',
    main_sha: 'a'.repeat(40),
    measured_at: '2026-09-06T00:00:00Z',
    bytes_per_second: 10_000_000,
    rows_per_second: 10_000,
    files_per_second: 10,
    ogp_per_second: 1,
    d1_capacity_bytes: 10_000_000_000,
  }, 'a'.repeat(40));
export const estimateFixture = () => ({
  table_bytes: 1000,
  upload_bytes: 1000,
  rows: 10,
  upload_count: 1,
  article_count: 1,
  runner_required_bytes: 134_000_000,
  source_required_bytes: 64_000_000,
  source_free_bytes: 10_000_000_000,
  source_sufficient: true,
});
it('budgets ordinary 31-table migration using measured rates, not per-file timeout multiplication', () => {
  const result = migrationBudget({
    estimate: estimateFixture(),
    rehearsal: rehearsalFixture(),
    availableBytes: 10_000_000_000,
  });
  expect(result.estimatedMs).toBeLessThan(30 * 60_000);
});
it('rejects actual serialized upload metadata overflow below source file-count cap', () => {
  expect(() =>
    migrationBudget({
      estimate: { ...estimateFixture(), upload_count: 99_000 },
      rehearsal: rehearsalFixture(),
      availableBytes: 10_000_000_000,
    })
  ).toThrow('metadata');
});
it('rejects capacity and measured-time shortfall before work starts', () => {
  expect(() => migrationBudget({ estimate: estimateFixture(), rehearsal: rehearsalFixture(), availableBytes: 1 }))
    .toThrow('Runner');
  expect(() =>
    migrationBudget({
      estimate: estimateFixture(),
      rehearsal: rehearsalFixture(),
      availableBytes: 10_000_000_000,
      remainingMs: 100,
    })
  ).toThrow('time');
  expect(() =>
    migrationBudget({
      estimate: { ...estimateFixture(), table_bytes: 3_000_000_000 },
      rehearsal: rehearsalFixture(),
      availableBytes: 100_000_000_000,
    })
  ).toThrow('D1 capacity');
});
it('requires same-revision rehearsal and rejects timeout/approval overrides', () => {
  expect(() => parseMigrationRehearsal(rehearsalFixture(), 'b'.repeat(40))).toThrow();
  expect(() => parseMigrationRehearsal({ ...rehearsalFixture(), bypass: true }, 'a'.repeat(40))).toThrow();
});
it('charges one streamed OGP body instead of fictional retained images for every article', () => {
  const base = { rehearsal: rehearsalFixture(), availableBytes: 14_000_000_000 };
  const one = migrationBudget({ ...base, estimate: estimateFixture() });
  const many = migrationBudget({ ...base, estimate: { ...estimateFixture(), article_count: 500 } });
  expect(many.runnerBytes).toBe(one.runnerBytes);
});
