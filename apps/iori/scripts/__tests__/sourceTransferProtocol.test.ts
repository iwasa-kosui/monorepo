import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

import { APPLICATION_TABLE_ORDER } from '../export-postgres-lib.mjs';
import { estimateUploadFailureReason, SOURCE_LIMITS, validateSourceInventory } from '../source-transfer-protocol.mjs';

const identity = { main_sha: 'a'.repeat(40), run_id: 'fixture' };
const checksum = createHash('sha256').update('').digest('hex');
const baseFiles = [
  ...APPLICATION_TABLE_ORDER.map((table) => ({
    id: `table.${table}`,
    path: `export/${table}.ndjson`,
    bytes: 1,
    checksum,
  })),
  { id: 'manifest.export', path: 'export/export-manifest.json', bytes: 1, checksum },
];
const uploadId = '33333333-3333-4333-8333-333333333333.png';
const inventory = (overrides: Record<string, unknown> = {}, files: Record<string, unknown>[] = baseFiles) => ({
  schemaVersion: 1,
  complete: true,
  identity,
  totalBytes: files.reduce((sum, file) => sum + (file.bytes as number), 0),
  missingUploadCount: 0,
  files,
  ...overrides,
});
it('accepts an inventory with a missing upload count and the exported uploads', () => {
  const files = [...baseFiles, { id: `upload.${uploadId}`, path: `uploads/${uploadId}`, bytes: 5, checksum }];
  expect(validateSourceInventory(inventory({ missingUploadCount: 3 }, files))).toMatchObject({ missingUploadCount: 3 });
  expect(validateSourceInventory(inventory()).missingUploadCount).toBe(0);
});
it.each([undefined, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])(
  'rejects the missing upload count %s',
  (missingUploadCount) => {
    expect(() => validateSourceInventory(inventory({ missingUploadCount }))).toThrow();
  },
);
it('rejects an inventory whose uploads and missing uploads exceed the file limit', () => {
  const files = [...baseFiles, { id: `upload.${uploadId}`, path: `uploads/${uploadId}`, bytes: 5, checksum }];
  expect(() => validateSourceInventory(inventory({ missingUploadCount: SOURCE_LIMITS.inventoryFiles }, files))).toThrow(
    'Invalid source inventory.',
  );
  expect(validateSourceInventory(inventory({ missingUploadCount: SOURCE_LIMITS.inventoryFiles - 1 }, files)))
    .toBeDefined();
});
it('rejects an inventory with an unknown extra field', () => {
  expect(() => validateSourceInventory(inventory({ omittedCount: 0 }))).toThrow();
});
const estimate = {
  upload_missing_count: 0,
  upload_owner_count: 0,
  upload_not_regular_count: 0,
  upload_too_large_count: 0,
  upload_access_count: 0,
  upload_other_count: 0,
};
it('passes only when the missing count equals the allowed count and no other cause is counted', () => {
  expect(estimateUploadFailureReason(estimate)).toBeNull();
  expect(estimateUploadFailureReason(estimate, 0)).toBeNull();
  expect(estimateUploadFailureReason({ ...estimate, upload_missing_count: 3 }, 3)).toBeNull();
  expect(estimateUploadFailureReason({ ...estimate, upload_missing_count: 3 })).toBe('estimate-upload-missing');
  expect(estimateUploadFailureReason({ ...estimate, upload_missing_count: 3 }, 2)).toBe('estimate-upload-missing');
  expect(estimateUploadFailureReason({ ...estimate, upload_missing_count: 3 }, 4)).toBe('estimate-upload-missing');
  expect(estimateUploadFailureReason(estimate, 1)).toBe('estimate-upload-missing');
});
it('reports a cause other than missing before the missing count, in the fixed order', () => {
  const all = { ...estimate, upload_missing_count: 3 };
  expect(estimateUploadFailureReason({ ...all, upload_other_count: 1, upload_owner_count: 1 }, 3)).toBe(
    'estimate-upload-owner',
  );
  expect(estimateUploadFailureReason({ ...all, upload_other_count: 1, upload_access_count: 1 }, 3)).toBe(
    'estimate-upload-access',
  );
  expect(estimateUploadFailureReason({ ...all, upload_other_count: 1 }, 0)).toBe('estimate-upload-other');
});
