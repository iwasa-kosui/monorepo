import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';

const requiredPhases = [
  'import-existing-resources',
  'drain-queue',
  'export-postgres',
  'convert-and-import-d1',
  'import-r2-and-ogp',
  'verify-import',
];
const contractSchema = 'iori-protected-migration-contract/v2';
const evidenceSchema = (phase) => `iori-migration-evidence/v2/${phase}`;
const phaseArtifactRequirements = {
  'import-existing-resources': ['terraform_import_summary'],
  'export-postgres': ['postgres_export_manifest'],
  'convert-and-import-d1': ['d1_import_manifest'],
  'import-r2-and-ogp': ['r2_import_manifest', 'ogp_import_manifest'],
  'drain-queue': ['queue_drain_report'],
  'verify-import': ['verification_summary'],
};
const protectedPhaseCommands = {
  'import-existing-resources': 'terraform-import-existing-resources',
  'export-postgres': 'export-postgres',
  'convert-and-import-d1': 'convert-and-import-d1',
  'import-r2-and-ogp': 'import-r2-and-ogp',
  'drain-queue': 'drain-queue',
  'verify-import': 'verify-import',
};
const importedTerraformAddresses = [
  'cloudflare_d1_database.iori',
  'cloudflare_r2_bucket.uploads',
  'cloudflare_workers_kv_namespace.fedify',
  'cloudflare_queue.fedify',
  'cloudflare_queue.fedify_dlq',
  'cloudflare_queue_consumer.fedify',
];
const checksum = (body) => createHash('sha256').update(body).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/i;
const runIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

const validFileArtifact = (artifact) =>
  artifact !== null
  && typeof artifact === 'object'
  && typeof artifact.path === 'string'
  && artifact.path.length > 0
  && Number.isSafeInteger(artifact.size)
  && artifact.size > 0
  && typeof artifact.sha256 === 'string'
  && digestPattern.test(artifact.sha256);

const validEvidenceArtifact = (artifact, phase) =>
  validFileArtifact(artifact)
  && artifact.schema === evidenceSchema(phase)
  && artifact.phase === phase;

const artifactSetIsValid = (artifacts, phase) => {
  const required = phaseArtifactRequirements[phase];
  return artifacts !== null
    && typeof artifacts === 'object'
    && !Array.isArray(artifacts)
    && Object.keys(artifacts).length === required.length
    && required.every((key) => validFileArtifact(artifacts[key]));
};

const artifactSetsMatch = (expected, actual) =>
  Object.keys(expected).length === Object.keys(actual).length
  && Object.keys(expected).every((key) => {
    const expectedArtifact = expected[key];
    const actualArtifact = actual[key];
    return validFileArtifact(actualArtifact)
      && expectedArtifact.path === actualArtifact.path
      && expectedArtifact.size === actualArtifact.size
      && expectedArtifact.sha256 === actualArtifact.sha256;
  });

const initialEvidenceHash = ({ main_sha, run_id }) => checksum(`${main_sha}:${run_id}`);

export const canonicalReceiptPayload = ({
  executor,
  schema,
  phase,
  command,
  exit_code,
  status,
  argv_sha256,
  completed_at,
  main_sha,
  run_id,
  artifacts_sha256,
  queue_drain_depth,
}) =>
  JSON.stringify({
    executor,
    schema,
    phase,
    command,
    exit_code,
    status,
    argv_sha256,
    completed_at,
    main_sha,
    run_id,
    artifacts_sha256,
    queue_drain_depth: queue_drain_depth ?? null,
  });

/** Validates only public contract structure; mounted evidence contents are checked separately. */
export const assertProtectedMigrationContract = (contract, { expectedMainSha, expectedRunId } = {}) => {
  if (
    contract === null
    || typeof contract !== 'object'
    || contract.schema !== contractSchema
    || typeof contract.main_sha !== 'string'
    || !/^[a-f0-9]{40}$/i.test(contract.main_sha)
    || typeof contract.run_id !== 'string'
    || !runIdPattern.test(contract.run_id)
    || typeof contract.previous_evidence_hash !== 'string'
    || contract.previous_evidence_hash !== initialEvidenceHash(contract)
    || !Array.isArray(contract.phases)
    || contract.phases.length !== requiredPhases.length
    || (expectedMainSha !== undefined && contract.main_sha !== expectedMainSha)
    || (expectedRunId !== undefined && contract.run_id !== expectedRunId)
  ) throw new Error('Protected migration contract is invalid.');

  let previousEvidenceHash = contract.previous_evidence_hash;
  for (const [index, phase] of contract.phases.entries()) {
    const name = requiredPhases[index];
    const queueDepthIsValid = name !== 'drain-queue' || phase?.queue_drain_depth === 0;
    if (
      phase === null
      || typeof phase !== 'object'
      || phase.name !== name
      || phase.status !== 'completed'
      || phase.previous_evidence_hash !== previousEvidenceHash
      || !validEvidenceArtifact(phase.artifact, name)
      || !artifactSetIsValid(phase.artifacts, name)
      || !queueDepthIsValid
    ) throw new Error('Protected migration contract is invalid.');
    previousEvidenceHash = phase.artifact.sha256;
  }

  return Object.freeze({
    schema: contract.schema,
    main_sha: contract.main_sha,
    run_id: contract.run_id,
    previous_evidence_hash: contract.previous_evidence_hash,
    phases: contract.phases.map((phase) => ({
      ...phase,
      artifact: { ...phase.artifact },
      artifacts: Object.fromEntries(Object.entries(phase.artifacts).map(([key, artifact]) => [key, { ...artifact }])),
    })),
  });
};

const assertRegularPrivateFile = async (artifact) => {
  const path = await assertExternalMigrationPath(artifact.path);
  const metadata = await lstat(path);
  if (
    !metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0 || metadata.size !== artifact.size
  ) {
    throw new Error('invalid');
  }
  const body = await readFile(path);
  if (checksum(body) !== artifact.sha256) throw new Error('invalid');
  return body;
};

export const loadReceiptPublicKey = async (path, expectedSha256) => {
  try {
    if (typeof expectedSha256 !== 'string' || !digestPattern.test(expectedSha256)) throw new Error('invalid');
    const resolved = await assertExternalMigrationPath(path);
    const metadata = await lstat(resolved);
    if (
      !metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0 || metadata.size > 16_384
      || (metadata.mode & 0o077) !== 0
    ) throw new Error('invalid');
    const body = await readFile(resolved);
    if (checksum(body) !== expectedSha256) throw new Error('invalid');
    const key = createPublicKey(body);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('invalid');
    return key;
  } catch {
    throw new Error('Protected migration receipt key is invalid.');
  }
};

const assertSignedReceipt = ({ name, artifacts, queue_drain_depth }, evidence, contract, receiptPublicKey) => {
  const receipt = evidence.executor_receipt;
  if (
    receiptPublicKey === undefined
    || evidence.executor !== 'iori-protected-migration/v1'
    || receipt?.schema !== 'iori-protected-executor-receipt/v1'
    || receipt.phase !== name
    || receipt.command !== protectedPhaseCommands[name]
    || receipt.status !== 'completed'
    || receipt.exit_code !== 0
    || typeof receipt.argv_sha256 !== 'string'
    || !digestPattern.test(receipt.argv_sha256)
    || typeof receipt.completed_at !== 'string'
    || Number.isNaN(Date.parse(receipt.completed_at))
    || receipt.main_sha !== contract.main_sha
    || receipt.run_id !== contract.run_id
    || receipt.artifacts_sha256 !== checksum(JSON.stringify(artifacts))
    || receipt.queue_drain_depth !== (name === 'drain-queue' ? queue_drain_depth : null)
    || typeof receipt.signature !== 'string'
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.signature)
  ) throw new Error('invalid');
  if (
    !verify(
      null,
      Buffer.from(canonicalReceiptPayload(receipt)),
      receiptPublicKey,
      Buffer.from(receipt.signature, 'base64'),
    )
  ) {
    throw new Error('invalid');
  }
};

const expectedManifestDigests = (contract) =>
  Object.fromEntries([
    ...['postgres_export_manifest', 'd1_import_manifest', 'r2_import_manifest', 'ogp_import_manifest'].map((name) => [
      name,
      contract.phases.find((phase) => Object.hasOwn(phase.artifacts, name)).artifacts[name].sha256,
    ]),
  ]);

const assertPhaseArtifactContent = (phase, name, body, contract) => {
  const artifact = JSON.parse(body.toString('utf8'));
  const isGeneratedManifest = {
    postgres_export_manifest: () =>
      artifact?.schemaVersion === 1 && artifact.complete === true
      && typeof artifact.exportedAt === 'string' && !Number.isNaN(Date.parse(artifact.exportedAt))
      && artifact.tables !== null && typeof artifact.tables === 'object' && !Array.isArray(artifact.tables),
    d1_import_manifest: () =>
      artifact?.schemaVersion === 1 && artifact.complete === true
      && digestPattern.test(artifact.schemaChecksum) && artifact.tables !== null && typeof artifact.tables === 'object'
      && !Array.isArray(artifact.tables) && Array.isArray(artifact.files),
    r2_import_manifest: () => artifact?.schemaVersion === 1 && Array.isArray(artifact.objects),
    ogp_import_manifest: () => Array.isArray(artifact?.objects),
  }[name];
  if (isGeneratedManifest === undefined) {
    if (artifact?.schema !== `iori-migration-phase-artifact/v1/${name}` || artifact.status !== 'completed') {
      throw new Error('invalid');
    }
  } else if (!isGeneratedManifest()) throw new Error('invalid');
  if (name === 'terraform_import_summary') {
    const addresses = artifact.resources?.map((resource) => resource?.address);
    if (
      !Array.isArray(addresses) || JSON.stringify(addresses) !== JSON.stringify(importedTerraformAddresses)
      || artifact.resources.some((resource) => resource.status !== 'completed')
    ) throw new Error('invalid');
  }
  if (name === 'queue_drain_report' && (artifact.depth !== 0 || artifact.queue !== 'fedify')) {
    throw new Error('invalid');
  }
  if (
    name === 'verification_summary'
    && JSON.stringify(artifact.manifest_digests) !== JSON.stringify(expectedManifestDigests(contract))
  ) {
    throw new Error('invalid');
  }
  return artifact;
};

const assertEvidenceArtifact = async ({ name, artifact, artifacts, queue_drain_depth }, contract, receiptPublicKey) => {
  try {
    const body = await assertRegularPrivateFile(artifact);
    const evidence = JSON.parse(body.toString('utf8'));
    if (
      evidence?.schema !== evidenceSchema(name)
      || evidence.phase !== name
      || evidence.status !== 'completed'
      || evidence.main_sha !== contract.main_sha
      || evidence.run_id !== contract.run_id
      || evidence.previous_evidence_hash !== contract.phases[requiredPhases.indexOf(name)].previous_evidence_hash
      || !artifactSetsMatch(artifacts, evidence.artifacts)
      || (name === 'drain-queue' && evidence.queue_drain_depth !== queue_drain_depth)
    ) throw new Error('invalid');
    assertSignedReceipt({ name, artifacts, queue_drain_depth }, evidence, contract, receiptPublicKey);
    for (const [artifactName, requiredArtifact] of Object.entries(artifacts)) {
      const artifactBody = await assertRegularPrivateFile(requiredArtifact);
      assertPhaseArtifactContent(name, artifactName, artifactBody, contract);
    }
  } catch {
    throw new Error('Protected migration evidence is invalid.');
  }
};

const mountedManifestLocations = {
  'export-postgres': { postgres_export_manifest: 'IORI_EXPORT_MANIFEST' },
  'convert-and-import-d1': { d1_import_manifest: 'IORI_D1_IMPORT_MANIFEST' },
  'import-r2-and-ogp': {
    r2_import_manifest: 'IORI_R2_IMPORT_MANIFEST',
    ogp_import_manifest: 'IORI_OGP_IMPORT_MANIFEST',
  },
};

const mountedFileArtifact = async (path) => {
  const resolved = await assertExternalMigrationPath(path);
  const [canonicalPath, body] = await Promise.all([realpath(resolved), readFile(resolved)]);
  const metadata = await lstat(canonicalPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0 || metadata.size === 0) {
    throw new Error('invalid');
  }
  return { path: canonicalPath, size: metadata.size, sha256: checksum(body) };
};

const expectedMountedArtifacts = async (environment) => {
  const expected = {};
  for (const [phase, mappings] of Object.entries(mountedManifestLocations)) {
    expected[phase] = {};
    for (const [artifactName, environmentName] of Object.entries(mappings)) {
      if (typeof environment[environmentName] !== 'string' || environment[environmentName].length === 0) {
        throw new Error('invalid');
      }
      expected[phase][artifactName] = await mountedFileArtifact(environment[environmentName]);
    }
  }
  return expected;
};

const assertMountedArtifactsMatch = (phases, expected) => {
  if (expected === undefined) return;
  for (const phase of phases) {
    const expectedPhaseArtifacts = expected[phase.name];
    if (expectedPhaseArtifacts === undefined) continue;
    for (const [name, expectedArtifact] of Object.entries(expectedPhaseArtifacts)) {
      const actualArtifact = phase.artifacts[name];
      if (
        !validFileArtifact(actualArtifact)
        || actualArtifact.path !== expectedArtifact.path
        || actualArtifact.size !== expectedArtifact.size
        || actualArtifact.sha256 !== expectedArtifact.sha256
      ) throw new Error('Protected migration evidence is invalid.');
    }
  }
};

export const validateProtectedMigrationEvidence = async (contract, expected = {}) => {
  const validated = assertProtectedMigrationContract(contract, expected);
  assertMountedArtifactsMatch(validated.phases, expected.expectedMountedArtifacts);
  for (const phase of validated.phases) await assertEvidenceArtifact(phase, validated, expected.receiptPublicKey);
  return validated;
};

const main = async () => {
  const contractPath = process.env.IORI_MIGRATION_CONTRACT;
  if (contractPath === undefined) throw new Error('Protected migration contract is required.');
  await assertExternalMigrationPath(contractPath);
  let contract;
  try {
    contract = JSON.parse(await readFile(contractPath, 'utf8'));
  } catch {
    throw new Error('Protected migration contract is invalid.');
  }
  const expectedMainSha = process.env.MAIN_SHA;
  const expectedRunId = process.env.IORI_MIGRATION_RUN_ID;
  const receiptKeyPath = process.env.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH;
  const receiptKeyHash = process.env.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256;
  const importRunnerHash = process.env.IORI_IMPORT_RUNNER_SHA256;
  if (
    expectedMainSha === undefined || expectedRunId === undefined || receiptKeyPath === undefined
    || receiptKeyHash === undefined || !digestPattern.test(receiptKeyHash) || importRunnerHash === undefined
    || !digestPattern.test(importRunnerHash)
  ) {
    throw new Error('Protected migration invocation is required.');
  }
  let mountedArtifacts;
  try {
    mountedArtifacts = await expectedMountedArtifacts(process.env);
  } catch {
    throw new Error('Protected migration mounted inputs are invalid.');
  }
  const importRunner = await mountedFileArtifact(process.env.IORI_IMPORT_RUNNER);
  if (importRunner.sha256 !== importRunnerHash) throw new Error('Protected migration mounted inputs are invalid.');
  const receiptPublicKey = await loadReceiptPublicKey(receiptKeyPath, receiptKeyHash);
  await validateProtectedMigrationEvidence(contract, {
    expectedMainSha,
    expectedRunId,
    expectedMountedArtifacts: mountedArtifacts,
    receiptPublicKey,
  });
  const result = spawnSync('pnpm', ['--filter', 'iori', 'run', 'cloudflare:verify:import'], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) throw new Error('Protected migration verification failed.');
  process.stdout.write('Protected migration phases completed.\n');
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Protected migration failed.');
    process.exitCode = 1;
  });
}
