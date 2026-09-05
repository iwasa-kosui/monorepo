import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdir, readdir, statfs, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExternalMigrationRoot, isMigrationArtifactReference } from './migration-path-safety.mjs';
import { parseExpectedTarget, targetHash, targetIdentity } from './migration-target-contract.mjs';
import { loadExpectedTarget } from './migration-target-input.mjs';
import { METADATA_BYTES, readPrivateBounded } from './migration-file-stream.mjs';
import { readPreparationRecord } from './target-preparation-record.mjs';
import { readSealedMigrationTarget } from './read-sealed-migration-target.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';
import { validateSourceEstimate, validateSourceInventory, validateSourceState } from './source-transfer-protocol.mjs';
import { MIGRATION_DEADLINE_MS, migrationBudget, parseMigrationRehearsal } from './migration-budget.mjs';
import {
  canonicalReceiptPayload,
  loadReceiptPublicKey,
  protectedPhaseCommands,
  requiredPhases,
  validateProtectedMigrationEvidence,
} from './run-protected-migration.mjs';
import { convertD1Import } from './convert-d1-import.mjs';
import { importMigrationD1, reviewedD1Schema } from './migration-d1-import.mjs';
import { importMigrationOgp, importMigrationUploads } from './migration-object-import.mjs';
import { createMigrationR2Writer } from './migration-r2-writer.mjs';
import { transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { createCloudflareImportTransport } from './cloudflare-import-provider.mjs';
import {
  createCloudflareImportProvider,
  createManifestExpectedProvider,
  verifyCloudflareImportWithProviders,
} from './verify-cloudflare-import.mjs';
import { publishMigrationBundle } from './migration-bundle.mjs';
import { loadNodeOgFont } from '../src/adaptor/node/ogImageFont.ts';
import { renderNodeOgImage } from '../src/adaptor/node/ogImageRenderer.ts';

export const executionReservationKey = (input) => {
  const { identity: i } = parseExpectedTarget(input);
  return `iori-migration/v1/${i.environment}/${i.main_sha}/${i.run_id}/execution-reservation`;
};
const freeBytes = async (root) => {
  const stat = await statfs(root, { bigint: true });
  return stat.bavail * stat.bsize;
};
const assertSigner = (privateKey, publicKey) => {
  if (
    privateKey?.asymmetricKeyType !== 'ed25519' || publicKey?.asymmetricKeyType !== 'ed25519'
    || !createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(
      publicKey.export({ type: 'spki', format: 'der' }),
    )
  ) throw new Error('Migration signing key mismatch.');
};
/** Fixed phase engine. Adapter injection is a test seam, never an executable-module environment input. */
export const executeProtectedMigration = async (options) => {
  const target = parseExpectedTarget(options.expectedTarget);
  const { root, source, storage, receiptPrivateKey, receiptPublicKey, bucket, actualProvider } = options;
  assertSigner(receiptPrivateKey, receiptPublicKey);
  const rehearsal = parseMigrationRehearsal(options.rehearsal, target.identity.main_sha);
  await assertExternalMigrationRoot(root);
  if ((await readdir(root)).length) throw new Error('Migration requires an empty private root.');
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error('Migration deadline exceeded.')), MIGRATION_DEADLINE_MS);
  const started = performance.now();
  const checkBudget = async () => {
    signal.throwIfAborted();
    const { source_revision, ...estimate } = await source.estimate(signal);
    if (source_revision !== target.identity.main_sha) throw new Error('Source revision mismatch.');
    validateSourceEstimate(estimate);
    migrationBudget({
      estimate,
      rehearsal,
      availableBytes: await (options.availableBytes ?? freeBytes)(root),
      remainingMs: MIGRATION_DEADLINE_MS - (performance.now() - started),
    });
  };
  const initialHash = targetHash(`${target.identity.main_sha}:${target.identity.run_id}`);
  const contract = {
    schema: 'iori-protected-migration-contract/v3',
    main_sha: target.identity.main_sha,
    run_id: target.identity.run_id,
    previous_evidence_hash: initialHash,
    phases: [],
  };
  let previous = initialHash;
  const descriptor = async (path) => {
    const reference = relative(root, path);
    if (!isMigrationArtifactReference(reference)) throw new Error('Invalid executor artifact path.');
    const body = await readPrivateBounded(path, METADATA_BYTES, signal);
    return { path: reference, size: body.length, sha256: targetHash(body) };
  };
  const writeJson = async (reference, value) => {
    signal.throwIfAborted();
    const body = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(body) > METADATA_BYTES) throw new Error('Executor artifact exceeds bound.');
    const path = join(root, reference);
    await writeFile(path, body, { mode: 0o600, flag: 'wx', signal });
    return path;
  };
  const completePhase = async (name, paths) => {
    signal.throwIfAborted();
    if (requiredPhases[contract.phases.length] !== name) throw new Error('Executor phase order mismatch.');
    const artifacts = {};
    for (const [key, path] of Object.entries(paths)) artifacts[key] = await descriptor(path);
    const receipt = {
      executor: 'iori-protected-migration/v1',
      schema: 'iori-protected-executor-receipt/v1',
      phase: name,
      command: protectedPhaseCommands[name],
      status: 'completed',
      exit_code: 0,
      argv_sha256: targetHash(
        JSON.stringify([protectedPhaseCommands[name], target.identity.main_sha, target.identity.run_id]),
      ),
      completed_at: new Date().toISOString(),
      main_sha: target.identity.main_sha,
      run_id: target.identity.run_id,
      artifacts_sha256: targetHash(JSON.stringify(artifacts)),
      queue_drain_depth: name === 'drain-queue' ? 0 : null,
    };
    const evidence = {
      schema: `iori-migration-evidence/v3/${name}`,
      phase: name,
      status: 'completed',
      main_sha: target.identity.main_sha,
      run_id: target.identity.run_id,
      previous_evidence_hash: previous,
      artifacts,
      executor: 'iori-protected-migration/v1',
      executor_receipt: {
        ...receipt,
        signature: sign(null, Buffer.from(canonicalReceiptPayload(receipt)), receiptPrivateKey).toString('base64'),
      },
      ...(name === 'drain-queue' ? { queue_drain_depth: 0 } : {}),
    };
    const path = await writeJson(`evidence/${name}.json`, evidence);
    const artifact = { ...await descriptor(path), schema: evidence.schema, phase: name };
    contract.phases.push({
      name,
      status: 'completed',
      previous_evidence_hash: previous,
      artifact,
      artifacts,
      ...(name === 'drain-queue' ? { queue_drain_depth: 0 } : {}),
    });
    previous = artifact.sha256;
  };
  const summary = (name, fields) => ({
    schema: `iori-migration-phase-artifact/v1/${name}`,
    status: 'completed',
    ...fields,
  });
  try {
    signal.throwIfAborted();
    await mkdir(join(root, 'evidence'), { mode: 0o700 });
    const prepared = await readPreparationRecord({ storage, expectedTarget: target });
    await options.readTarget({ expectedTarget: target, record: prepared.record, signal });
    const fontData = await options.loadFont(signal);
    await checkBudget();
    const reservation = Buffer.from(
      JSON.stringify({
        schema: 'iori-migration-execution-reservation/v1',
        identity: target.identity,
        preparation_sha256: prepared.sha256,
      }) + '\n',
    );
    await storage.putNew(executionReservationKey(target), reservation);
    const reserved = await storage.get(executionReservationKey(target), 65536);
    if (!reserved.equals(reservation)) throw new Error('Execution reservation readback failed.');
    const { schema: _schema, ...recordFields } = prepared.record;
    await completePhase('prepare-target-resources', {
      terraform_target_summary: await writeJson(
        'evidence/target.json',
        summary('terraform_target_summary', {
          ...recordFields,
          preparation: { record_sha256: prepared.sha256, record: prepared.record },
        }),
      ),
    });
    await source.freeze(signal);
    const drained = validateSourceState(await source.drain(300_000, signal));
    if (
      !drained.drained || drained.source_revision !== target.identity.main_sha
      || drained.identity?.main_sha !== target.identity.main_sha || drained.identity.run_id !== target.identity.run_id
    ) throw new Error('Source did not drain.');
    await completePhase('drain-queue', {
      queue_drain_report: await writeJson(
        'evidence/drain.json',
        summary('queue_drain_report', {
          queue: 'fedify',
          depth: drained.queue_depth,
          ingress_frozen: drained.ingress_frozen,
          http_inflight: drained.http_inflight,
          enqueue_work: drained.enqueue_work,
          dequeue_work: drained.dequeue_work,
          consumer_paused: drained.consumer_paused,
          source_revision: drained.source_revision,
          identity: drained.identity,
        }),
      ),
    });
    await checkBudget();
    const inventory = validateSourceInventory(await source.export(signal));
    if (
      inventory.identity.main_sha !== target.identity.main_sha || inventory.identity.run_id !== target.identity.run_id
    ) throw new Error('Source inventory identity mismatch.');
    const restored = await source.restore(join(root, 'source'), signal);
    await completePhase('export-postgres', { postgres_export_manifest: restored.manifestPath });
    const sqlRoot = join(root, 'sql');
    await convertD1Import({
      manifestPath: restored.manifestPath,
      schemaPath: reviewedD1Schema,
      outputDir: sqlRoot,
      signal,
      maxFileBytes: options.maxSqlFileBytes,
    });
    const d1ManifestPath = join(sqlRoot, 'd1-import-manifest.json');
    await options.readTarget({ expectedTarget: target, record: prepared.record, signal });
    await options.importD1({ expectedTarget: target, manifestPath: d1ManifestPath, signal });
    await completePhase('convert-and-import-d1', { d1_import_manifest: d1ManifestPath });
    await options.readTarget({ expectedTarget: target, record: prepared.record, signal });
    const uploads = await importMigrationUploads({
      sourceDir: restored.uploadDir,
      manifestPath: restored.manifestPath,
      outputDir: join(root, 'objects'),
      bucket,
      signal,
    });
    const ogp = await importMigrationOgp({
      manifestPath: restored.manifestPath,
      outputDir: join(root, 'objects'),
      bucket,
      generate: (title) => options.render({ title, fontData }),
      signal,
    });
    await completePhase('import-r2-and-ogp', {
      r2_import_manifest: uploads.manifestPath,
      ogp_import_manifest: ogp.manifestPath,
    });
    signal.throwIfAborted();
    await options.readTarget({ expectedTarget: target, record: prepared.record, signal });
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: restored.manifestPath,
      d1ImportManifestPath: d1ManifestPath,
      uploadManifestPath: uploads.manifestPath,
      ogpManifestPath: ogp.manifestPath,
      signal,
    });
    const failures = await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider });
    if (failures.length) throw new Error('Live migration verification failed.');
    const manifest_digests = Object.fromEntries(
      ['postgres_export_manifest', 'd1_import_manifest', 'r2_import_manifest', 'ogp_import_manifest'].map(
        name => [name, contract.phases.find(phase => phase.artifacts[name]).artifacts[name].sha256],
      ),
    );
    await completePhase('verify-import', {
      verification_summary: await writeJson(
        'evidence/verification.json',
        summary('verification_summary', { manifest_digests }),
      ),
    });
    await writeJson('contract.json', contract);
    const bundleOptions = {
      root,
      contractPath: 'contract.json',
      environment: target.identity.environment,
      expectedMainSha: target.identity.main_sha,
      expectedRunId: target.identity.run_id,
      expectedTarget: target,
      receiptPublicKey,
      storage,
      signal,
    };
    await validateProtectedMigrationEvidence(contract, bundleOptions);
    await publishMigrationBundle(bundleOptions);
    return { status: 'published', contractPath: join(root, 'contract.json') };
  } finally {
    clearTimeout(timer);
  }
};

const main = async () => {
  const expectedTarget = await loadExpectedTarget(process.env.IORI_MIGRATION_EXPECTED_TARGET_PATH);
  if (
    process.env.MAIN_SHA !== expectedTarget.identity.main_sha
    || process.env.IORI_MIGRATION_RUN_ID !== expectedTarget.identity.run_id
  ) throw new Error('Invocation mismatch.');
  const required = (key) => {
    if (!process.env[key]) throw new Error('Executor configuration is required.');
    return process.env[key];
  };
  const root = required('IORI_MIGRATION_ROOT');
  await assertExternalMigrationRoot(root);
  const receiptPublicKey = await loadReceiptPublicKey(
    required('IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH'),
    required('IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256'),
  );
  const receiptPrivateKey = createPrivateKey(
    await readPrivateBounded(required('IORI_MIGRATION_RECEIPT_PRIVATE_KEY_PATH'), 16384),
  );
  assertSigner(receiptPrivateKey, receiptPublicKey);
  const rehearsal = parseMigrationRehearsal(
    JSON.parse(await readPrivateBounded(required('IORI_MIGRATION_REHEARSAL_PATH'), 65536)),
    expectedTarget.identity.main_sha,
  );
  const apiToken = required('CLOUDFLARE_API_TOKEN');
  const zoneId = required('CLOUDFLARE_ZONE_ID');
  if (!/^[a-f0-9]{32}$/.test(zoneId)) throw new Error('Invalid zone.');
  const accessKeyId = required('IORI_APPLICATION_R2_ACCESS_KEY_ID');
  const secretAccessKey = required('IORI_APPLICATION_R2_SECRET_ACCESS_KEY');
  required('IORI_MIGRATION_R2_ACCESS_KEY_ID');
  required('IORI_MIGRATION_R2_SECRET_ACCESS_KEY');
  const source = await createSourceSshAdapter({
    host: required('IORI_SOURCE_SSH_HOST'),
    user: required('IORI_SOURCE_SSH_USER'),
    identityFile: required('IORI_SOURCE_SSH_IDENTITY_FILE'),
    knownHostsFile: required('IORI_SOURCE_SSH_KNOWN_HOSTS_FILE'),
    mainSha: expectedTarget.identity.main_sha,
    runId: expectedTarget.identity.run_id,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIGRATION_DEADLINE_MS);
  const signal = controller.signal;
  try {
    const storage = transferStorageFromEnvironment(process.env, targetIdentity(expectedTarget), false, signal);
    const bucket = createMigrationR2Writer({ expectedTarget, accessKeyId, secretAccessKey, signal });
    const r = expectedTarget.resources;
    const actualProvider = createCloudflareImportProvider(
      createCloudflareImportTransport({
        expectedWorkerName: expectedTarget.identity.worker_name,
        accountId: expectedTarget.identity.account_id,
        apiToken,
        accessKeyId,
        secretAccessKey,
        signal,
        bindings: {
          worker_name: expectedTarget.identity.worker_name,
          d1_database_id: r.d1.id,
          kv_namespace_id: r.kv.id,
          r2_bucket_name: r.uploads.name,
          queue_name: r.queue.name,
        },
      }),
    );
    await executeProtectedMigration({
      expectedTarget,
      root,
      receiptPublicKey,
      receiptPrivateKey,
      rehearsal,
      source,
      storage,
      bucket,
      actualProvider,
      signal,
      readTarget: (input) => readSealedMigrationTarget({ ...input, token: apiToken, zoneId }),
      loadFont: (signal) => loadNodeOgFont({ signal }),
      render: renderNodeOgImage,
      importD1: (input) => importMigrationD1({ ...input, apiToken }),
    });
  } finally {
    clearTimeout(timer);
  }
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => console.log('Protected migration bundle published.')).catch(() => {
    console.error(
      'Protected migration failed; retain source freeze, partial evidence and reservations for reviewed recovery.',
    );
    process.exitCode = 1;
  });
}
