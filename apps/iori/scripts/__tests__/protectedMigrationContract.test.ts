import { expectedTargetFixture, targetSummaryFixture } from './migrationTargetFixture.js';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
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
  validateProtectedMigrationEvidence as validateEvidence,
} from '../run-protected-migration.mjs';

const phases = [
  'prepare-target-resources',
  'drain-queue',
  'export-postgres',
  'convert-and-import-d1',
  'import-r2-and-ogp',
  'verify-import',
];
const requirementKeys: Record<string, string[]> = {
  'prepare-target-resources': ['terraform_target_summary'],
  'export-postgres': ['postgres_export_manifest'],
  'convert-and-import-d1': ['d1_import_manifest'],
  'import-r2-and-ogp': ['r2_import_manifest', 'ogp_import_manifest'],
  'drain-queue': ['queue_drain_report'],
  'verify-import': ['verification_summary'],
};
const digest = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
const directories: string[] = [];
const roots = new WeakMap<object, string>();
const validateProtectedMigrationEvidence = (contract: object, options: Record<string, unknown> = {}) =>
  validateEvidence(contract, { root: roots.get(contract)!, expectedTarget: expectedTargetFixture(), ...options });
const receiptKeys = generateKeyPairSync('ed25519');

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
            ...(key === 'terraform_target_summary'
              ? targetSummaryFixture()
              : {}),
            ...(key === 'queue_drain_report'
              ? {
                queue: 'fedify',
                depth: 0,
                ingress_frozen: true,
                http_inflight: 0,
                enqueue_work: 0,
                dequeue_work: 0,
                consumer_paused: true,
                source_revision: main_sha,
                identity: { main_sha, run_id },
              }
              : {}),
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
        const path = `${name}-${key}`;
        await writeFile(join(directory, path), body, { mode: 0o600 });
        return [key, { path, size: Buffer.byteLength(body), sha256: digest(body) }];
      })),
    );
    const receipt = {
      schema: 'iori-protected-executor-receipt/v1',
      phase: name,
      command: {
        'prepare-target-resources': 'terraform-prepare-target-resources',
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
      schema: `iori-migration-evidence/v3/${name}`,
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
    const path = `${name}.json`;
    await writeFile(join(directory, path), body, { mode: 0o600 });
    const artifact = {
      path,
      size: Buffer.byteLength(body),
      sha256: digest(body),
      schema: `iori-migration-evidence/v3/${name}`,
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

  const contract = {
    schema: 'iori-protected-migration-contract/v3',
    main_sha,
    run_id,
    previous_evidence_hash: digest(`${main_sha}:${run_id}`),
    phases: phaseEntries,
  };
  roots.set(contract, directory);
  return contract;
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
    const exportParent = await mkdtemp(join(await realpath(tmpdir()), 'iori-generated-export-'));
    const exportDirectory = join(exportParent, 'export');
    const importDirectory = await mkdtemp(join(await realpath(tmpdir()), 'iori-generated-import-'));
    directories.push(exportParent, importDirectory);
    await exportPostgres({
      outputDir: exportDirectory,
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

    const contract = await validContract(rawManifests);
    const rootA = roots.get(contract)!;
    const rootB = await mkdtemp(join(await realpath(tmpdir()), 'iori-restored-'));
    directories.push(rootB);
    const bytes = JSON.stringify(contract);
    await expect(
      validateEvidence(contract, {
        root: rootA,
        expectedTarget: expectedTargetFixture(),
        receiptPublicKey: receiptKeys.publicKey,
      }),
    ).resolves
      .toBeDefined();
    await cp(rootA, rootB, { recursive: true });
    for (const phase of contract.phases) {
      expect(await readFile(join(rootB, phase.artifact.path))).toEqual(
        await readFile(join(rootA, phase.artifact.path)),
      );
    }
    await rm(rootA, { recursive: true });
    await expect(
      validateEvidence(JSON.parse(bytes), {
        root: rootB,
        expectedTarget: expectedTargetFixture(),
        receiptPublicKey: receiptKeys.publicKey,
      }),
    ).resolves
      .toBeDefined();
    expect(JSON.stringify(contract)).toBe(bytes);
  });

  it('rejects the former ordering that drains the queue after export', async () => {
    const contract = await validContract();
    [contract.phases[1], contract.phases[2]] = [contract.phases[2], contract.phases[1]];
    expect(() => assertProtectedMigrationContract(contract)).toThrow('contract');
  });

  it('rejects nonexistent or empty evidence artifacts', async () => {
    const contract = await validContract();
    contract.phases[0].artifact.path = 'missing-migration-evidence.json';
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
    await writeFile(join(roots.get(contract)!, report.path), '{}', { mode: 0o600 });
    report.size = 2;
    report.sha256 = digest('{}');
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('rejects a modified signed executor receipt', async () => {
    const contract = await validContract();
    const artifact = contract.phases.at(-1)!.artifact;
    const evidence = JSON.parse(await readFile(join(roots.get(contract)!, artifact.path), 'utf8'));
    evidence.executor_receipt.signature = 'A'.repeat(evidence.executor_receipt.signature.length);
    const body = JSON.stringify(evidence);
    await writeFile(join(roots.get(contract)!, artifact.path), body, { mode: 0o600 });
    artifact.size = Buffer.byteLength(body);
    artifact.sha256 = digest(body);
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('rejects legacy v2 contracts and evidence descriptors', async () => {
    const contract = await validContract();
    contract.schema = 'iori-protected-migration-contract/v2';
    expect(() => assertProtectedMigrationContract(contract)).toThrow('contract');
    contract.schema = 'iori-protected-migration-contract/v3';
    contract.phases[0].artifact.schema = 'iori-migration-evidence/v2/prepare-target-resources';
    expect(() => assertProtectedMigrationContract(contract)).toThrow('contract');
  });

  it.each(['/absolute', '../escape', 'a/../b', './file', 'a//b', 'a/', 'C:file', 'a\\b', ''])(
    'rejects unsafe signed reference %j without I/O',
    async (path) => {
      const contract = await validContract();
      contract.phases[0].artifact.path = path;
      expect(() => assertProtectedMigrationContract(contract)).toThrow('contract');
    },
  );

  it('requires a private explicit root and private nonempty evidence', async () => {
    const contract = await validContract();
    const root = roots.get(contract)!;
    await expect(
      validateEvidence(contract, {
        root: undefined as unknown as string,
        expectedTarget: expectedTargetFixture(),
        receiptPublicKey: receiptKeys.publicKey,
      }),
    ).rejects.toThrow('evidence');
    await chmod(root, 0o755);
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
    await chmod(root, 0o700);
    const path = join(root, contract.phases[0].artifact.path);
    await chmod(path, 0o644);
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
    await chmod(path, 0o600);
    await writeFile(path, '');
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('normalizes mounted absolute paths but rejects same basename at another location', async () => {
    const contract = await validContract();
    const root = roots.get(contract)!;
    const artifact = contract.phases[2].artifacts.postgres_export_manifest;
    const options = {
      receiptPublicKey: receiptKeys.publicKey,
      expectedMountedArtifacts: {
        'export-postgres': { postgres_export_manifest: { ...artifact, path: join(root, artifact.path) } },
      },
    };
    await expect(validateProtectedMigrationEvidence(contract, options)).resolves.toBeDefined();
    await mkdir(join(root, 'other'), { mode: 0o700 });
    await cp(join(root, artifact.path), join(root, 'other', artifact.path));
    options.expectedMountedArtifacts['export-postgres'].postgres_export_manifest.path = join(
      root,
      'other',
      artifact.path,
    );
    await expect(validateProtectedMigrationEvidence(contract, options)).rejects.toThrow('evidence');
  });

  it('rejects leaf symlinks even when the target bytes match the signed descriptor', async () => {
    const contract = await validContract();
    const root = roots.get(contract)!;
    const path = join(root, contract.phases[0].artifact.path);
    const target = join(root, 'target');
    await cp(path, target);
    await rm(path);
    await symlink(target, path);
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('rejects changed manifest bytes without trusting the signed filename', async () => {
    const contract = await validContract();
    const artifact = contract.phases[2].artifacts.postgres_export_manifest;
    const path = join(roots.get(contract)!, artifact.path);
    const bytes = await readFile(path, 'utf8');
    await writeFile(path, bytes.replace('2026', '2025'));
    await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
      .toThrow('evidence');
  });

  it('rejects legacy evidence bytes even when the outer checksum is updated', async () => {
    const contract = await validContract();
    const artifact = contract.phases.at(-1)!.artifact;
    const path = join(roots.get(contract)!, artifact.path);
    const evidence = JSON.parse(await readFile(path, 'utf8'));
    evidence.schema = 'iori-migration-evidence/v2/verify-import';
    const body = JSON.stringify(evidence);
    await writeFile(path, body);
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
it.each([
  'ingress_frozen',
  'http_inflight',
  'enqueue_work',
  'dequeue_work',
  'consumer_paused',
  'source_revision',
  'identity',
])('rejects a signed drain report missing %s', async key => {
  const artifact: Record<string, unknown> = {
    schema: 'iori-migration-phase-artifact/v1/queue_drain_report',
    status: 'completed',
    queue: 'fedify',
    depth: 0,
    ingress_frozen: true,
    http_inflight: 0,
    enqueue_work: 0,
    dequeue_work: 0,
    consumer_paused: true,
    source_revision: 'a'.repeat(40),
    identity: { main_sha: 'a'.repeat(40), run_id: 'production-run-001' },
  };
  delete artifact[key];
  const contract = await validContract({ queue_drain_report: artifact });
  await expect(validateProtectedMigrationEvidence(contract, { receiptPublicKey: receiptKeys.publicKey })).rejects
    .toThrow();
});
