export const MIGRATION_DEADLINE_MS: number;
export const CLEANUP_MARGIN_MS: number;
export type MigrationRehearsal = {
  schema: 'iori-migration-rehearsal/v1';
  main_sha: string;
  measured_at: string;
  bytes_per_second: number;
  rows_per_second: number;
  files_per_second: number;
  ogp_per_second: number;
  d1_capacity_bytes: 500000000 | 10000000000;
};
export const REHEARSAL_D1_CAPACITY_BYTES: number;
export function hasRehearsalSample(
  estimate: Pick<MigrationEstimate, 'rows' | 'upload_count' | 'article_count'>,
): boolean;
export function parseMigrationRehearsal(input: unknown, mainSha: string): MigrationRehearsal;
export type MigrationEstimate = {
  table_bytes: number;
  upload_bytes: number;
  rows: number;
  upload_count: number;
  article_count: number;
  runner_required_bytes: number;
  source_required_bytes: number;
  source_free_bytes: number;
  source_sufficient: boolean;
};
export type MigrationBudgetSizes = {
  runnerBytes: number;
  sqlBytes: number;
  sqlFiles: number;
  uploadManifestBytes: number;
  ogpManifestBytes: number;
  d1ManifestBytes: number;
  indexBytes: number;
};
export function migrationWorkload(
  estimate: MigrationEstimate,
): { raw: number; sqlBytes: number; sqlFiles: number; fileCount: number };
export function migrationBudget(
  input: {
    estimate: MigrationEstimate;
    rehearsal: MigrationRehearsal;
    availableBytes: number | bigint;
    remainingMs?: number;
  },
): MigrationBudgetSizes & { estimatedMs: number };
export function migrationBudget(
  input: {
    estimate: MigrationEstimate;
    rehearsal?: undefined;
    d1CapacityBytes: number;
    availableBytes: number | bigint;
    remainingMs?: number;
  },
): MigrationBudgetSizes;
