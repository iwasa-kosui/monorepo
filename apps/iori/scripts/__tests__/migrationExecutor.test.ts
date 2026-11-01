import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { executeProtectedMigration, executionReservationKey } from '../execute-protected-migration.mjs';
import { APPLICATION_TABLE_ORDER } from '../export-postgres.mjs';
import { admissionEnvironment } from '../migration-target-contract.mjs';
import { createManifestExpectedProvider, verifyCloudflareImportWithProviders } from '../verify-cloudflare-import.mjs';
import { restoreMigrationBundle } from '../migration-bundle.mjs';
import { directory, fixture, missingUploadId, removeExecutorRoots } from './migrationExecutorFixture.js';
afterEach(removeExecutorRoots);
it('executes real export/conversion/SQL/S3/OGP/signatures and restores all files for fresh verification', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration(f.options)).resolves.toMatchObject({ status: 'published' });
    expect(f.calls.indexOf('reserve')).toBeLessThan(f.calls.indexOf('freeze'));
    const fresh = await directory();
    await restoreMigrationBundle({
      expectedTarget: f.options.expectedTarget,
      environment: 'production',
      expectedMainSha: 'a'.repeat(40),
      expectedRunId: 'production-run-001',
      receiptPublicKey: f.options.receiptPublicKey,
      storage: f.options.storage,
      root: fresh,
      contractPath: 'contract.json',
    });
    const original = await readFile(join(f.options.root, 'contract.json'));
    expect(await readFile(join(fresh, 'contract.json'))).toEqual(original);
    const contract = JSON.parse(original.toString());
    expect(JSON.parse(await readFile(join(fresh, 'evidence/drain.json'), 'utf8'))).toMatchObject({
      ingress_frozen: true,
      http_inflight: 0,
      enqueue_work: 0,
      dequeue_work: 0,
      depth: 0,
      consumer_paused: true,
      source_revision: 'a'.repeat(40),
      identity: { main_sha: 'a'.repeat(40), run_id: 'production-run-001' },
    });
    const manifest = (name: string) =>
      join(fresh, contract.phases.find((phase: any) => phase.artifacts[name]).artifacts[name].path);
    expect(JSON.parse(await readFile(manifest('d1_import_manifest'), 'utf8')).files.length).toBeGreaterThan(1);
    for (const table of APPLICATION_TABLE_ORDER) await access(join(fresh, `source/export/${table}.ndjson`));
    const uploadKeys = [
      'post-images/33333333-3333-4333-8333-333333333333/original',
      'post-images/55555555-5555-4555-8555-555555555555/original',
    ];
    expect([...f.objects.keys()].filter(key => key.startsWith('post-images/')).sort()).toEqual(uploadKeys);
    const uploadManifest = JSON.parse(await readFile(manifest('r2_import_manifest'), 'utf8'));
    expect(uploadManifest.objects.map((object: { key: string }) => object.key).sort()).toEqual(uploadKeys);
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: manifest('postgres_export_manifest'),
      d1ImportManifestPath: manifest('d1_import_manifest'),
      uploadManifestPath: manifest('r2_import_manifest'),
      ogpManifestPath: manifest('ogp_import_manifest'),
      sourceOrigin: admissionEnvironment(f.options.expectedTarget).ORIGIN,
    });
    expect(await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider: f.actualProvider })).toEqual(
      [],
    );
  } finally {
    f.close();
  }
}, 30000);
it('takes the source origin from the expected target and fails on a same-origin upload URL', async () => {
  const f = await fixture({ extraImageUrl: 'https://blog.test/uploads/99999999-9999-4999-8999-999999999999.png' });
  try {
    expect(admissionEnvironment(f.options.expectedTarget).ORIGIN).toBe('https://blog.test');
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('upload-same-origin');
    await expect(access(join(f.options.root, 'contract.json'))).rejects.toThrow();
  } finally {
    f.close();
  }
});
it('rejects metadata preflight before reservation/freeze and post-drain growth before export', async () => {
  const f = await fixture();
  try {
    f.source.estimate.mockResolvedValueOnce({ ...await f.source.estimate(), upload_count: 99000 });
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('metadata');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
  const g = await fixture();
  try {
    const estimate = await g.source.estimate();
    g.source.estimate.mockResolvedValueOnce(estimate).mockResolvedValueOnce({ ...estimate, upload_count: 99000 });
    await expect(executeProtectedMigration(g.options)).rejects.toThrow('metadata');
    expect(g.calls).toContain('freeze');
    expect(g.calls).not.toContain('export');
    expect(g.remote.has(executionReservationKey(g.options.expectedTarget))).toBe(true);
  } finally {
    g.close();
  }
});
it.each(
  [
    'upload_missing_count',
    'upload_owner_count',
    'upload_not_regular_count',
    'upload_too_large_count',
    'upload_access_count',
    'upload_other_count',
  ] as const,
)('rejects unopened uploads counted in %s before reservation and freeze', async field => {
  const f = await fixture();
  try {
    f.source.estimate.mockResolvedValue({ ...await f.source.estimate(), [field]: 1 });
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('Source upload files could not be opened.');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
});
it('rejects a consumed execution ID and missing expected target without source mutation', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({ ...f.options, expectedTarget: undefined as any })).rejects.toThrow();
    expect(f.calls).toEqual([]);
    f.remote.set(executionReservationKey(f.options.expectedTarget), Buffer.from('reserved'));
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('collision');
    expect(f.source.freeze).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
it('retains reservation and partial evidence after an uncertain D1 mutation, without later receipts', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({
      ...f.options,
      importD1: async () => {
        throw new Error('uncertain');
      },
    })).rejects.toThrow();
    expect(f.calls).toContain('freeze');
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(true);
    await access(join(f.options.root, 'evidence/export-postgres.json'));
    await expect(access(join(f.options.root, 'evidence/convert-and-import-d1.json'))).rejects.toThrow();
    await expect(access(join(f.options.root, 'contract.json'))).rejects.toThrow();
    expect([...f.remote.keys()].some(key => key.endsWith('/complete'))).toBe(false);
  } finally {
    f.close();
  }
});
it('rejects already-aborted execution before storage/source operations', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({ ...f.options, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(f.calls).toEqual([]);
  } finally {
    f.close();
  }
});
it.each([2, 3])('rechecks target at mutation boundary %s and stops before the next data write', async boundary => {
  const f = await fixture();
  let readbacks = 0;
  const put = vi.fn(f.options.bucket.put);
  try {
    await expect(executeProtectedMigration({
      ...f.options,
      bucket: { put },
      readTarget: async () => {
        readbacks++;
        if (readbacks === boundary) throw new Error('target drift');
      },
    })).rejects.toThrow('target drift');
    expect(put).not.toHaveBeenCalled();
    if (boundary === 2) {
      expect(f.calls).not.toContain('d1');
      await expect(access(join(f.options.root, 'evidence/convert-and-import-d1.json'))).rejects.toThrow();
    } else {
      expect(f.calls).toContain('d1');
      await access(join(f.options.root, 'evidence/convert-and-import-d1.json'));
    }
    await expect(access(join(f.options.root, 'evidence/import-r2-and-ogp.json'))).rejects.toThrow();
    await expect(access(join(f.options.root, 'contract.json'))).rejects.toThrow();
  } finally {
    f.close();
  }
});
it('charges hosted setup time before deciding whether source freeze fits', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({ ...f.options, deadlineMs: 1000 })).rejects.toThrow('time budget');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
});
const noticeLines = (write: { mock: { calls: unknown[][] } }) =>
  write.mock.calls.map(call => String(call[0])).filter(line => line.startsWith('IORI_NOTICE'));
const uploadKeys = [
  'post-images/33333333-3333-4333-8333-333333333333/original',
  'post-images/55555555-5555-4555-8555-555555555555/original',
];
it('migrates the other uploads and records the omitted count when the allowed missing count matches', async () => {
  const f = await fixture({ missingUpload: true });
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    await expect(executeProtectedMigration({ ...f.options, allowedMissingUploads: 1 })).resolves.toMatchObject({
      status: 'published',
    });
    expect(noticeLines(write)).toEqual(['IORI_NOTICE stage=export-missing-uploads count=1\n']);
    expect([...f.objects.keys()].filter(key => key.startsWith('post-images/')).sort()).toEqual(uploadKeys);
    const root = f.options.root;
    const uploadManifestPath = join(root, 'objects/r2-import-manifest.json');
    const uploadManifest = JSON.parse(await readFile(uploadManifestPath, 'utf8'));
    expect(uploadManifest.objects).toHaveLength(2);
    expect(uploadManifest.omittedCount).toBe(1);
    expect(JSON.stringify(uploadManifest)).not.toContain(missingUploadId);
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: join(root, 'source/export/export-manifest.json'),
      d1ImportManifestPath: join(root, 'sql/d1-import-manifest.json'),
      uploadManifestPath,
      ogpManifestPath: join(root, 'objects/ogp-import-manifest.json'),
      sourceOrigin: admissionEnvironment(f.options.expectedTarget).ORIGIN,
    });
    expect(await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider: f.actualProvider })).toEqual(
      [],
    );
  } finally {
    write.mockRestore();
    f.close();
  }
}, 30000);
it.each([undefined, 0, 2])(
  'fails before reservation and freeze when the allowed missing count is %s and one upload is missing',
  async allowedMissingUploads => {
    const f = await fixture({ missingUpload: true });
    try {
      await expect(executeProtectedMigration({ ...f.options, allowedMissingUploads })).rejects.toThrow(
        'Source upload files could not be opened.',
      );
      expect(f.source.freeze).not.toHaveBeenCalled();
      expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
    } finally {
      f.close();
    }
  },
);
it.each(
  [
    'upload_owner_count',
    'upload_not_regular_count',
    'upload_too_large_count',
    'upload_access_count',
    'upload_other_count',
  ] as const,
)('fails on %s even when the allowed missing count matches', async field => {
  const f = await fixture({ missingUpload: true });
  try {
    f.source.estimate.mockResolvedValue({ ...await f.source.estimate(), [field]: 1 });
    await expect(executeProtectedMigration({ ...f.options, allowedMissingUploads: 1 })).rejects.toThrow(
      'Source upload files could not be opened.',
    );
    expect(f.source.freeze).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
it('fails after freeze and before export when the missing count changes after the drain', async () => {
  const f = await fixture({ missingUpload: true });
  try {
    const estimate = await f.source.estimate();
    f.source.estimate.mockResolvedValueOnce(estimate).mockResolvedValueOnce({ ...estimate, upload_missing_count: 2 });
    await expect(executeProtectedMigration({ ...f.options, allowedMissingUploads: 1 })).rejects.toThrow(
      'Source upload files could not be opened.',
    );
    expect(f.calls).toContain('freeze');
    expect(f.calls).not.toContain('export');
  } finally {
    f.close();
  }
});
it('fails before the transfer when the exported missing count differs from the allowed count', async () => {
  const f = await fixture({ missingUpload: true });
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const exportSource = f.source.export;
    f.source.export = async () => ({ ...await exportSource(), missingUploadCount: 2 });
    const restore = vi.fn(f.source.restore);
    f.source.restore = restore;
    await expect(executeProtectedMigration({ ...f.options, allowedMissingUploads: 1 })).rejects.toThrow(
      'Source missing upload count mismatch.',
    );
    expect(restore).not.toHaveBeenCalled();
    expect(noticeLines(write)).toEqual(['IORI_NOTICE stage=export-missing-uploads count=2\n']);
    expect(f.objects.size).toBe(0);
  } finally {
    write.mockRestore();
    f.close();
  }
});
it.each([-1, 1.5, Number.NaN])(
  'refuses the invalid allowed missing count %s before any source operation',
  async value => {
    const f = await fixture();
    try {
      await expect(executeProtectedMigration({ ...f.options, allowedMissingUploads: value })).rejects.toThrow(
        'Invalid allowed missing upload count.',
      );
      expect(f.calls).toEqual([]);
    } finally {
      f.close();
    }
  },
);
