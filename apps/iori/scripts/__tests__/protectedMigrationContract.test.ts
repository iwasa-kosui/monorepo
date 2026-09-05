import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertD1Import } from '../convert-d1-import.mjs';
import { exportPostgres } from '../export-postgres.mjs';
import { backfillPublishedOgpImages, importR2Uploads } from '../import-r2-uploads.mjs';
import {
  assertProtectedMigrationContract,
  canonicalReceiptPayload,
  loadReceiptPublicKey,
  validateProtectedMigrationEvidence,
} from '../run-protected-migration.mjs';

const phases = [
  'import-existing-resources',
  'drain-queue',
  'export-postgres',
  'convert-and-import-d1',
  'import-r2-and-ogp',
  'verify-import',
];
const requirementKeys: Record<string, string[]> = {
  'import-existing-resources': ['terraform_import_summary'],
  'export-postgres': ['postgres_export_manifest'],
  'convert-and-import-d1': ['d1_import_manifest'],
  'import-r2-and-ogp': ['r2_import_manifest', 'ogp_import_manifest'],
  'drain-queue': ['queue_drain_report'],
  'verify-import': ['verification_summary'],
};
const digest = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
const directories: string[] = [];
const receiptKeys = generateKeyPairSync('ed25519');
const importedAddresses = [
  'cloudflare_d1_database.iori',
  'cloudflare_r2_bucket.uploads',
  'cloudflare_workers_kv_namespace.fedify',
  'cloudflare_queue.fedify',
  'cloudflare_queue.fedify_dlq',
  'cloudflare_queue_consumer.fedify',
];

const validContract = async (artifactBodies: Record<string, unknown> = {}) => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'iori-migration-evidence-'));
  directories.push(directory);
  const main_sha = 'a'.repeat(40);
  const run_id = 'production-run-001';
  let previous_evidence_hash = digest(`${main_sha}:${run_id}`);
  const phaseEntries: Array<any> = [];

  for (const name of phases) {
    const artifacts = Object.fromEntries(
      await Promise.all(requirementKeys[name].map(async (key) => {
        const generatedManifestDefaults: Record<string, unknown> = {
          postgres_export_manifest: {
            schemaVersion: 1,
            exportedAt: '2026-01-02T03:04:05.000Z',
            complete: true,
            tables: {},
          },
          d1_import_manifest: {
            schemaVersion: 1,
            complete: true,
            schemaChecksum: digest('schema'),
            tables: {},
            files: [],
          },
          r2_import_manifest: { schemaVersion: 1, objects: [] },
          ogp_import_manifest: { objects: [] },
        };
        const body = JSON.stringify(
          artifactBodies[key] ?? generatedManifestDefaults[key] ?? {
            schema: `iori-migration-phase-artifact/v1/${key}`,
            status: 'completed',
            ...(key === 'terraform_import_summary'
              ? { resources: importedAddresses.map((address) => ({ address, status: 'completed' })) }
              : {}),
            ...(key === 'queue_drain_report' ? { queue: 'fedify', depth: 0 } : {}),
            ...(key === 'verification_summary'
              ? {
                manifest_digests: Object.fromEntries([
                  ['postgres_export_manifest', phaseEntries[2].artifacts.postgres_export_manifest.sha256],
                  ['d1_import_manifest', phaseEntries[3].artifacts.d1_import_manifest.sha256],
                  ['r2_import_manifest', phaseEntries[4].artifacts.r2_import_manifest.sha256],
                  ['ogp_import_manifest', phaseEntries[4].artifacts.ogp_import_manifest.sha256],
                ]),
              }
              : {}),
          },
        );
        const path = join(directory, `${name}-${key}`);
        await writeFile(path, body, { mode: 0o600 });
        return [key, { path, size: Buffer.byteLength(body), sha256: digest(body) }];
      })),
    );
    const receipt = {
      schema: 'iori-protected-executor-receipt/v1',
      phase: name,
      command: {
        'import-existing-resources': 'terraform-import-existing-resources',
        'export-postgres': 'export-postgres',
        'convert-and-import-d1': 'convert-and-import-d1',
        'import-r2-and-ogp': 'import-r2-and-ogp',
        'drain-queue': 'drain-queue',
        'verify-import': 'verify-import',
      }[name],
      status: 'completed',
      exit_code: 0,
      argv_sha256: digest(`fixed:${name}`),
      completed_at: '2026-08-16T00:00:00.000Z',
      main_sha,
      run_id,
      artifacts_sha256: digest(JSON.stringify(artifacts)),
      queue_drain_depth: name === 'drain-queue' ? 0 : null,
    };
    const evidence = {
      schema: `iori-migration-evidence/v2/${name}`,
      phase: name,
      status: 'completed',
      main_sha,
      run_id,
      previous_evidence_hash,
      artifacts,
      executor: 'iori-protected-migration/v1',
      executor_receipt: {
        ...receipt,
        signature: sign(null, Buffer.from(canonicalReceiptPayload(receipt)), receiptKeys.privateKey).toString('base64'),
      },
      ...(name === 'drain-queue' ? { queue_drain_depth: 0 } : {}),
    };
    const body = JSON.stringify(evidence);
    const path = join(directory, `${name}.json`);
    await writeFile(path, body, { mode: 0o600 });
    const artifact = {
      path,
      size: Buffer.byteLength(body),
      sha256: digest(body),
      schema: `iori-migration-evidence/v2/${name}`,
      phase: name,
    };
    phaseEntries.push({
      name,
      status: 'completed',
      previous_evidence_hash,
      artifacts,
      ...(name === 'drain-queue' ? { queue_drain_depth: 0 } : {}),
      artifact,
    });
    previous_evidence_hash = artifact.sha256;
  }

  return {
    schema: 'iori-protected-migration-contract/v2',
    main_sha,
    run_id,
    previous_evidence_hash: digest(`${main_sha}:${run_id}`),
    phases: phaseEntries,
  };
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('protected migration contract', () => {
  it('accepts complete ordered phase-specific evidence artifacts', async () => {
    await expect(validateProtectedMigrationEvidence(await validContract(), { receiptPublicKey: receiptKeys.publicKey }))
      .resolves.toEqual(expect.objectContaining({ phases: expect.any(Array) }));
  });

  it('accepts raw manifests emitted by the migration generators', async () => {
    const exportDirectory = await mkdtemp(join(await realpath(tmpdir()), 'iori-generated-export-'));
    const importDirectory = await mkdtemp(join(await realpath(tmpdir()), 'iori-generated-import-'));
    directories.push(exportDirectory, importDirectory);
    await exportPostgres({
      connectionString: 'postgres://fixture.invalid/iori',
      outputDir: exportDirectory,
      queueDrained: true,
      createClient: async () => ({
        connect: async () => undefined,
        end: async () => undefined,
        query: async () => ({ rows: [] }),
      }),
    });
    await convertD1Import({
      manifestPath: join(exportDirectory, 'export-manifest.json'),
      schemaPath: new URL('../../drizzle-d1/0000_boring_xavin.sql', import.meta.url).pathname,
      outputDir: importDirectory,
    });
    await importR2Uploads({
      sourceDir: exportDirectory,
      bucket: { put: async () => undefined },
      manifestPath: join(exportDirectory, 'export-manifest.json'),
      outputDir: importDirectory,
    });
    await backfillPublishedOgpImages({
      articles: [{ articleId: '55555555-5555-4555-8555-555555555555', status: 'published', title: 'fixture' }],
      bucket: { put: async () => undefined },
      generate: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      outputDir: importDirectory,
    });
    const rawManifests = Object.fromEntries(
      await Promise.all([
        ['postgres_export_manifest', join(exportDirectory, 'export-manifest.json')],
        ['d1_import_manifest', join(importDirectory, 'd1-import-manifest.json')],
        ['r2_import_manifest', join(importDirectory, 'r2-import-manifest.json')],
        ['ogp_import_manifest', join(importDirectory, 'ogp-import-manifest.json')],
      ].map(async ([name, path]) => [name, JSON.parse(await readFile(path, 'utf8'))])),
    );

    await expect(validateProtectedMigrationEvidence(
      await validContract(rawManifests),
      { receiptPublicKey: receiptKeys.publicKey },
    )).resolves.toEqual(expect.objectContaining({ phases: expect.any(Array) }));
  });

  it('rejects the former ordering that drains the queue after export', async () => {
    const contract = await validContract();
    [contract.phases[1], contract.phases[2]] = [contract.phases[2], contract.phases[1]];
    expect(() => assertProtectedMigrationContract(contract)).toThrow('contract');
  });

  it('rejects nonexistent or empty evidence artifacts', async () => {
    const contract = await validContract();
    contract.phases[0].artifact.path = join(await realpath(tmpdir()), 'missing-migration-evidence.json');
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('rejects reordered, incomplete, or checksum-mismatched evidence', async () => {
    const reordered = await validContract();
    [reordered.phases[0], reordered.phases[1]] = [reordered.phases[1], reordered.phases[0]];
    expect(() => assertProtectedMigrationContract(reordered)).toThrow('contract');

    const incomplete = await validContract();
    incomplete.phases[2].status = 'pending';
    expect(() => assertProtectedMigrationContract(incomplete)).toThrow('contract');

    const mismatched = await validContract();
    mismatched.phases[3].artifact.sha256 = '0'.repeat(64);
    await expect(validateProtectedMigrationEvidence(mismatched, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('contract');
  });

  it('rejects self-declared empty or mismatched phase proof', async () => {
    const empty = await validContract();
    delete (empty.phases[0] as { artifacts?: unknown }).artifacts;
    expect(() => assertProtectedMigrationContract(empty)).toThrow('contract');

    const mismatched = await validContract();
    mismatched.phases[1].previous_evidence_hash = '0'.repeat(64);
    expect(() => assertProtectedMigrationContract(mismatched)).toThrow('contract');
  });

  it('binds the contract main SHA and run ID to the protected invocation', async () => {
    const contract = await validContract();
    await expect(validateProtectedMigrationEvidence(contract, {
      receiptPublicKey: receiptKeys.publicKey,
      expectedMainSha: 'b'.repeat(40),
      expectedRunId: 'production-run-001',
    })).rejects.toThrow('contract');
    await expect(validateProtectedMigrationEvidence(contract, {
      receiptPublicKey: receiptKeys.publicKey,
      expectedMainSha: 'a'.repeat(40),
      expectedRunId: 'different-run',
    })).rejects.toThrow('contract');
  });

  it('rejects evidence that does not bind to the mounted import manifests', async () => {
    const contract = await validContract();
    const postgres = contract.phases.find((phase) => phase.name === 'export-postgres')!;
    await expect(validateProtectedMigrationEvidence(contract, {
      receiptPublicKey: receiptKeys.publicKey,
      expectedMountedArtifacts: {
        'export-postgres': {
          postgres_export_manifest: {
            ...postgres.artifacts.postgres_export_manifest,
            path: join(await realpath(tmpdir()), 'other-private-manifest'),
          },
        },
      },
    })).rejects.toThrow('evidence');
  });

  it('rejects empty or malformed phase artifact reports', async () => {
    const contract = await validContract();
    const report = contract.phases.find((phase) => phase.name === 'drain-queue')!.artifacts.queue_drain_report;
    await writeFile(report.path, '{}', { mode: 0o600 });
    report.size = 2;
    report.sha256 = digest('{}');
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('rejects a modified signed executor receipt', async () => {
    const contract = await validContract();
    const artifact = contract.phases.at(-1)!.artifact;
    const evidence = JSON.parse(await readFile(artifact.path, 'utf8'));
    evidence.executor_receipt.signature = 'A'.repeat(evidence.executor_receipt.signature.length);
    const body = JSON.stringify(evidence);
    await writeFile(artifact.path, body, { mode: 0o600 });
    artifact.size = Buffer.byteLength(body);
    artifact.sha256 = digest(body);
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('pins the protected receipt key bytes before parsing the key', async () => {
    const directory = await mkdtemp(join(await realpath(tmpdir()), 'iori-migration-evidence-'));
    directories.push(directory);
    const key = Buffer.from(receiptKeys.publicKey.export({ type: 'spki', format: 'pem' }));
    const path = join(directory, 'receipt-public-key.pem');
    await writeFile(path, key, { mode: 0o600 });
    await expect(loadReceiptPublicKey(path, digest(key))).resolves.toBeDefined();
    await expect(loadReceiptPublicKey(path, '0'.repeat(64))).rejects.toThrow('receipt key');
  });
});
