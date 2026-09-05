import { z } from 'zod';
import { METADATA_BYTES, OBJECT_BYTES } from './migration-file-stream.mjs';
import { objectManifestEnvelope, serializeObjectEntry } from './migration-object-import.mjs';
import { SOURCE_LIMITS } from './source-transfer-protocol.mjs';
export const MIGRATION_DEADLINE_MS = 5 * 60 * 60_000 + 45 * 60_000;
export const CLEANUP_MARGIN_MS = 15 * 60_000;
const positive = z.number().positive().finite();
/** Protected rehearsal measurements, not operator timeout overrides. Technical caps stay fixed. */
export const parseMigrationRehearsal = (input, mainSha) => {
  const value = z.object({
    schema: z.literal('iori-migration-rehearsal/v1'),
    main_sha: z.string().regex(/^[a-f0-9]{40}$/),
    measured_at: z.iso.datetime(),
    bytes_per_second: positive,
    rows_per_second: positive,
    files_per_second: positive,
    ogp_per_second: positive,
    d1_capacity_bytes: z.union([z.literal(500_000_000), z.literal(10_000_000_000)]),
  }).strict().parse(input);
  if (value.main_sha !== mainSha) throw new Error('Rehearsal revision mismatch.');
  return value;
};
const size = (value) => Buffer.byteLength(JSON.stringify(value));
const bounded = (n) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid migration budget.');
  return n;
};
export const migrationBudget = ({ estimate, rehearsal, availableBytes, remainingMs = MIGRATION_DEADLINE_MS }) => {
  const e = estimate;
  for (
    const key of [
      'table_bytes',
      'upload_bytes',
      'rows',
      'upload_count',
      'article_count',
      'runner_required_bytes',
      'source_required_bytes',
      'source_free_bytes',
    ]
  ) bounded(e[key]);
  const raw = bounded(e.table_bytes + e.upload_bytes);
  if (
    raw > SOURCE_LIMITS.totalBytes || e.upload_count + 32 > SOURCE_LIMITS.inventoryFiles || !e.source_sufficient
    || e.source_free_bytes < e.source_required_bytes
  ) throw new Error('Source migration capacity is insufficient.');
  const sqlBytes = bounded(e.table_bytes * 24);
  const sqlFiles = Math.ceil(sqlBytes / (32 * 1024 * 1024 - 100_000));
  const uuid = 'f'.repeat(8) + '-ffff-4fff-8fff-' + 'f'.repeat(12);
  const digest = 'f'.repeat(64);
  const uploadEntry = {
    imageId: uuid,
    key: `post-images/${uuid}/original`,
    contentType: 'image/jpeg',
    checksum: digest,
  };
  const ogpEntry = { articleId: uuid, key: `og/${uuid}.png`, contentType: 'image/png', checksum: digest };
  const uploadManifestBytes = bounded(
    Buffer.byteLength(objectManifestEnvelope('uploads'))
      + e.upload_count * (Buffer.byteLength(serializeObjectEntry(uploadEntry)) + 1) + 3,
  );
  const ogpManifestBytes = bounded(
    Buffer.byteLength(objectManifestEnvelope('ogp'))
      + e.article_count * (Buffer.byteLength(serializeObjectEntry(ogpEntry)) + 1) + 3,
  );
  const d1ManifestBytes = bounded(
    32768
      + sqlFiles
        * size({ file: 'd1-import-100000.sql', checksum: digest, tables: Array(31).fill('notification_subscriptions') })
        * 2,
  );
  const fileCount = 64 + sqlFiles;
  const transferBytes = bounded(e.table_bytes + sqlBytes + 16 * METADATA_BYTES);
  const partCount = Math.ceil(transferBytes / (64 * 1024 * 1024)) + fileCount;
  const indexBytes = bounded(
    4096 + fileCount * size({ path: 'x'.repeat(120), size: Number.MAX_SAFE_INTEGER, sha256: digest, parts: [] })
      + partCount * size({ size: Number.MAX_SAFE_INTEGER, sha256: digest }),
  );
  if ([uploadManifestBytes, ogpManifestBytes, d1ManifestBytes, indexBytes].some(n => n > METADATA_BYTES)) {
    throw new Error('Migration metadata budget exceeds 16 MiB.');
  }
  const ogpBytes = bounded(e.article_count * OBJECT_BYTES);
  // Include retained OGP upper bound and bundle read/write buffers beyond Source 6a runner accounting.
  const runnerBytes = bounded(e.runner_required_bytes + ogpBytes + 256 * 1024 * 1024);
  if (BigInt(availableBytes) < BigInt(runnerBytes)) throw new Error('Runner migration capacity is insufficient.');
  // Reviewed capacity plan must cover data plus conservative index/SQLite overhead; raw-source cap is not D1 capacity.
  if (e.table_bytes * 4 > rehearsal.d1_capacity_bytes) throw new Error('D1 capacity plan is insufficient.');
  // Rehearsal measures representative complete phases; doubled estimates include operating headroom.
  // Per-file request timeouts are failure ceilings and are deliberately not multiplied into normal duration.
  const estimatedMs = Math.ceil(
    2 * 1000
      * (600 + (raw * 3 + sqlBytes) / rehearsal.bytes_per_second + e.rows * 3 / rehearsal.rows_per_second
        + (e.upload_count * 3 + fileCount * 2) / rehearsal.files_per_second
        + e.article_count / rehearsal.ogp_per_second),
  );
  if (!Number.isSafeInteger(estimatedMs) || estimatedMs + CLEANUP_MARGIN_MS > remainingMs) {
    throw new Error('Migration rehearsal time budget is insufficient.');
  }
  return {
    runnerBytes,
    sqlBytes,
    sqlFiles,
    uploadManifestBytes,
    ogpManifestBytes,
    d1ManifestBytes,
    indexBytes,
    estimatedMs,
  };
};
