import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExpectedTarget } from './migration-target-input.mjs';
import { targetIdentity } from './migration-target-contract.mjs';
import { METADATA_BYTES, readPrivateBounded } from './migration-file-stream.mjs';
import { loadReceiptPublicKey } from './run-protected-migration.mjs';
import { transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { restoreMigrationBundle } from './migration-bundle.mjs';
import { readSealedMigrationTarget } from './read-sealed-migration-target.mjs';
import { createCloudflareImportTransport } from './cloudflare-import-provider.mjs';
import {
  createCloudflareImportProvider,
  createManifestExpectedProvider,
  verifyCloudflareImportWithProviders,
} from './verify-cloudflare-import.mjs';
import { MIGRATION_DEADLINE_MS } from './migration-budget.mjs';
const main = async () => {
  const target = await loadExpectedTarget(process.env.IORI_MIGRATION_EXPECTED_TARGET_PATH);
  const required = (key) => {
    if (!process.env[key]) throw new Error('Fresh verification configuration is required.');
    return process.env[key];
  };
  if (
    required('MAIN_SHA') !== target.identity.main_sha || required('IORI_MIGRATION_RUN_ID') !== target.identity.run_id
  ) throw new Error('Invocation mismatch.');
  const root = required('IORI_MIGRATION_ROOT');
  const receiptPublicKey = await loadReceiptPublicKey(
    required('IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH'),
    required('IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256'),
  );
  const token = required('CLOUDFLARE_API_TOKEN');
  const zoneId = required('CLOUDFLARE_ZONE_ID');
  if (!/^[a-f0-9]{32}$/.test(zoneId)) throw new Error('Invalid zone.');
  const accessKeyId = required('IORI_APPLICATION_R2_ACCESS_KEY_ID');
  const secretAccessKey = required('IORI_APPLICATION_R2_SECRET_ACCESS_KEY');
  required('IORI_MIGRATION_R2_ACCESS_KEY_ID');
  required('IORI_MIGRATION_R2_SECRET_ACCESS_KEY');
  const signal = AbortSignal.timeout(MIGRATION_DEADLINE_MS);
  const storage = transferStorageFromEnvironment(process.env, targetIdentity(target), true, signal);
  await restoreMigrationBundle({
    expectedTarget: target,
    root,
    environment: target.identity.environment,
    expectedMainSha: target.identity.main_sha,
    expectedRunId: target.identity.run_id,
    receiptPublicKey,
    contractPath: 'contract.json',
    storage,
    signal,
  });
  const contract = JSON.parse(await readPrivateBounded(join(root, 'contract.json'), METADATA_BYTES, signal));
  const artifactPath = (name) => join(root, contract.phases.find(phase => phase.artifacts[name]).artifacts[name].path);
  const summary = JSON.parse(
    await readPrivateBounded(artifactPath('terraform_target_summary'), METADATA_BYTES, signal),
  );
  await readSealedMigrationTarget({
    expectedTarget: target,
    record: summary.preparation.record,
    token,
    zoneId,
    signal,
  });
  const r = target.resources;
  const actualProvider = createCloudflareImportProvider(
    createCloudflareImportTransport({
      accountId: target.identity.account_id,
      expectedWorkerName: target.identity.worker_name,
      apiToken: token,
      accessKeyId,
      secretAccessKey,
      signal,
      bindings: {
        worker_name: target.identity.worker_name,
        d1_database_id: r.d1.id,
        kv_namespace_id: r.kv.id,
        r2_bucket_name: r.uploads.name,
        queue_name: r.queue.name,
      },
    }),
  );
  const expectedProvider = createManifestExpectedProvider({
    exportManifestPath: artifactPath('postgres_export_manifest'),
    d1ImportManifestPath: artifactPath('d1_import_manifest'),
    uploadManifestPath: artifactPath('r2_import_manifest'),
    ogpManifestPath: artifactPath('ogp_import_manifest'),
    signal,
  });
  if ((await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider })).length) {
    throw new Error('Fresh verification failed.');
  }
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => console.log('Fresh restored migration verification passed.')).catch(() => {
    console.error('Fresh migration verification failed.');
    process.exitCode = 1;
  });
}
