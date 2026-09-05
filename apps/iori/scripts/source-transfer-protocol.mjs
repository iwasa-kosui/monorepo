import { z } from 'zod';

import { APPLICATION_TABLE_ORDER } from './export-postgres-lib.mjs';

export const SOURCE_LIMITS = Object.freeze({
  totalBytes: 10 * 1024 ** 3,
  uploadBytes: 32 * 1024 ** 2,
  inventoryBytes: 32 * 1024 ** 2,
  inventoryFiles: 100_000,
  exportMs: 30 * 60_000,
  socketMs: 31 * 60_000,
  transferMs: 5 * 60_000,
  estimateMs: 60_000,
});
export const sourceIdentitySchema = z.object({
  main_sha: z.string().regex(/^[a-f0-9]{40}$/),
  run_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
}).strict();
const count = z.number().int().nonnegative().safe();
const stateSchema = z.object({
  source_revision: z.string().regex(/^[a-f0-9]{40}$/),
  identity: sourceIdentitySchema.nullable(),
  ingress_frozen: z.boolean(),
  http_inflight: count,
  queue_depth: count,
  dequeue_work: count,
  enqueue_work: count,
  consumer_paused: z.boolean(),
  queue_failed: z.boolean(),
  drained: z.boolean(),
  estimate: z.unknown().optional(),
  inventory: z.unknown().optional(),
}).strict();
export const validateSourceState = (value) => {
  const state = stateSchema.parse(value);
  if (
    state.drained
    && (!state.ingress_frozen || !state.consumer_paused || state.queue_failed || state.http_inflight
      || state.queue_depth || state.dequeue_work || state.enqueue_work || !state.identity)
  ) throw new Error('Invalid source state.');
  return state;
};
export const validateSourceEstimate = (value) => {
  const estimate = z.object({
    table_bytes: count,
    upload_bytes: count,
    rows: count,
    upload_count: count,
    article_count: count,
    source_free_bytes: count,
    source_required_bytes: count,
    runner_required_bytes: count,
    source_sufficient: z.boolean(),
    limits: z.record(z.string(), count),
  }).strict().parse(value);
  if (
    estimate.source_sufficient !== (estimate.source_free_bytes >= estimate.source_required_bytes)
    || Object.keys(estimate.limits).length !== Object.keys(SOURCE_LIMITS).length
    || Object.entries(SOURCE_LIMITS).some(([key, expected]) => estimate.limits[key] !== expected)
  ) throw new Error('Invalid source estimate.');
  return estimate;
};
const fileSchema = z.object({
  id: z.string().max(100),
  path: z.string().max(120),
  bytes: z.number().int().nonnegative().max(SOURCE_LIMITS.totalBytes),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  complete: z.literal(true),
  identity: sourceIdentitySchema,
  totalBytes: z.number().int().nonnegative().max(SOURCE_LIMITS.totalBytes),
  files: z.array(fileSchema).max(SOURCE_LIMITS.inventoryFiles),
}).strict();
export const logicalFilePath = (id) => {
  if (id === 'manifest.export') return 'export/export-manifest.json';
  if (id.startsWith('table.') && APPLICATION_TABLE_ORDER.includes(id.slice(6))) return `export/${id.slice(6)}.ndjson`;
  const upload =
    /^upload\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(gif|jpeg|jpg|png|webp)$/i
      .exec(id);
  if (upload) return `uploads/${upload[1]}.${upload[2]}`;
  throw new Error('Invalid source file.');
};
export const validateSourceInventory = (value) => {
  const inventory = inventorySchema.parse(value);
  const ids = new Set();
  let total = 0;
  for (const file of inventory.files) {
    if (
      ids.has(file.id) || logicalFilePath(file.id) !== file.path
      || (file.id.startsWith('upload.') && file.bytes > SOURCE_LIMITS.uploadBytes)
    ) throw new Error('Invalid source inventory.');
    ids.add(file.id);
    total += file.bytes;
  }
  if (
    total !== inventory.totalBytes || !ids.has('manifest.export')
    || APPLICATION_TABLE_ORDER.some((table) => !ids.has(`table.${table}`))
  ) throw new Error('Invalid source inventory.');
  return inventory;
};
