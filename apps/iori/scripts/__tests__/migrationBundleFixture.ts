import { targetSummaryFixture } from './migrationTargetFixture.js';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { canonicalReceiptPayload } from '../run-protected-migration.mjs';

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
export const directories: string[] = [];
export const roots = new WeakMap<object, string>();
export const receiptKeys = generateKeyPairSync('ed25519');

export const validContract = async (artifactBodies: Record<string, unknown> = {}) => {
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
