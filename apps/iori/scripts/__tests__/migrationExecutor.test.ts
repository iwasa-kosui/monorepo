import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { executeProtectedMigration, executionReservationKey } from '../execute-protected-migration.mjs';
import { APPLICATION_TABLE_ORDER } from '../export-postgres.mjs';
import { createManifestExpectedProvider, verifyCloudflareImportWithProviders } from '../verify-cloudflare-import.mjs';
import { restoreMigrationBundle } from '../migration-bundle.mjs';
import { directory, fixture, removeExecutorRoots } from './migrationExecutorFixture.js';
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
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: manifest('postgres_export_manifest'),
      d1ImportManifestPath: manifest('d1_import_manifest'),
      uploadManifestPath: manifest('r2_import_manifest'),
      ogpManifestPath: manifest('ogp_import_manifest'),
    });
    expect(await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider: f.actualProvider })).toEqual(
      [],
    );
  } finally {
    f.close();
  }
}, 30000);
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
