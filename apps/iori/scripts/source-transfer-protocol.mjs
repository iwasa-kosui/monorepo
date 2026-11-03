import { z } from 'zod';

import { APPLICATION_TABLE_ORDER } from './export-postgres-lib.mjs';
import { classifyUploadUrl } from './migration-upload-rows.mjs';

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
export const SOURCE_REJECTION_DETAILS = Object.freeze([
  'estimate-connect',
  'estimate-query',
  'estimate-upload-row',
  'estimate-upload-legacy-path',
  'estimate-upload-same-origin',
  'estimate-upload-root',
  'estimate-upload-open',
  'estimate-upload-missing',
  'estimate-upload-owner',
  'estimate-upload-not-regular',
  'estimate-upload-too-large',
  'estimate-upload-access',
  'estimate-upload-other',
  'estimate-export-owner',
  'estimate-too-large',
  'estimate-limit',
  'estimate-other',
]);
export const SOURCE_SSH_REASONS = Object.freeze([
  'not-ready',
  'busy',
  'rejected',
  'invalid-response',
  'spawn-failed',
  'aborted',
  'ssh-failed',
]);
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
  missingUploadCount: count,
  files: z.array(fileSchema).max(SOURCE_LIMITS.inventoryFiles),
}).strict();
export const logicalFilePath = (id) => {
  if (id === 'manifest.export') return 'export/export-manifest.json';
  if (id.startsWith('table.') && APPLICATION_TABLE_ORDER.includes(id.slice(6))) return `export/${id.slice(6)}.ndjson`;
  if (id.startsWith('upload.')) {
    const upload = classifyUploadUrl(`/uploads/${id.slice(7)}`);
    if (upload.kind === 'local' && upload.filename === id.slice(7)) return `uploads/${upload.filename}`;
  }
  throw new Error('Invalid source file.');
};
export const validateSourceInventory = (value) => {
  const inventory = inventorySchema.parse(value);
  const ids = new Set();
  let total = 0;
  let uploads = 0;
  for (const file of inventory.files) {
    if (
      ids.has(file.id) || logicalFilePath(file.id) !== file.path
      || (file.id.startsWith('upload.') && file.bytes > SOURCE_LIMITS.uploadBytes)
    ) throw new Error('Invalid source inventory.');
    ids.add(file.id);
    total += file.bytes;
    if (file.id.startsWith('upload.')) uploads += 1;
  }
  if (
    total !== inventory.totalBytes || uploads + inventory.missingUploadCount > SOURCE_LIMITS.inventoryFiles
    || !ids.has('manifest.export')
    || APPLICATION_TABLE_ORDER.some((table) => !ids.has(`table.${table}`))
  ) throw new Error('Invalid source inventory.');
  return inventory;
};
