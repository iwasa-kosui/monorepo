import { migrationRunIdPattern, parseExpectedTarget } from './migration-target-contract.mjs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { APPLICATION_TABLE_ORDER } from './export-postgres.mjs';
import {
  assertExternalMigrationRoot,
  isMigrationArtifactReference,
  resolveMigrationArtifactPath,
} from './migration-path-safety.mjs';
import { assertProtectedMigrationContract, validateProtectedMigrationEvidence } from './run-protected-migration.mjs';

const CHUNK = 64 * 1024 * 1024;
const METADATA = 16 * 1024 * 1024;
const hash = (body) => createHash('sha256').update(body).digest('hex');
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = () => {
  throw new Error('Migration bundle is invalid or incomplete.');
};
const context = ({ environment, expectedMainSha, expectedRunId, contractPath, chunkSize = CHUNK, expectedTarget }) => {
  const target = parseExpectedTarget(expectedTarget);
  if (
    target.identity.environment !== environment || target.identity.main_sha !== expectedMainSha
    || target.identity.run_id !== expectedRunId
  ) fail();
  if (
    !['production', 'staging'].includes(environment)
    || typeof expectedMainSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedMainSha)
    || typeof expectedRunId !== 'string' || !migrationRunIdPattern.test(expectedRunId)
    || !isMigrationArtifactReference(contractPath) || !Number.isSafeInteger(chunkSize) || chunkSize < 1
    || chunkSize > CHUNK
  ) fail();
  return { prefix: `iori-migration/v1/${environment}/${expectedMainSha}/${expectedRunId}`, chunkSize };
};
const json = async (root, path) => {
  const resolved = await resolveMigrationArtifactPath(root, path);
  if ((await lstat(resolved)).size > METADATA) fail();
  return JSON.parse(await readFile(resolved, 'utf8'));
};
const fileDigest = async (root, path) => {
  const absolute = await resolveMigrationArtifactPath(root, path);
  const info = await lstat(absolute);
  if (info.nlink !== 1 || (info.mode & 0o077) !== 0) fail();
  const sha = createHash('sha256');
  let size = 0;
  for await (const bytes of createReadStream(absolute, { highWaterMark: CHUNK })) {
    sha.update(bytes);
    size += bytes.length;
  }
  if (size !== info.size) fail();
  return { path, size, sha256: sha.digest('hex') };
};

const dataReferences = async (root, contract) => {
  const result = [];
  const manifest = (name) => contract.phases.find((phase) => Object.hasOwn(phase.artifacts, name)).artifacts[name];
  const pgDescriptor = manifest('postgres_export_manifest');
  const pg = await json(root, pgDescriptor.path);
  if (Object.keys(pg.tables).length !== APPLICATION_TABLE_ORDER.length) fail();
  for (const table of APPLICATION_TABLE_ORDER) {
    const entry = pg.tables[table];
    if (!entry || entry.file !== `${table}.ndjson` || !digest(entry.checksum)) fail();
    result.push({ path: join(dirname(pgDescriptor.path), entry.file), sha256: entry.checksum });
  }
  const sqlDescriptor = manifest('d1_import_manifest');
  const sql = await json(root, sqlDescriptor.path);
  const sqlNames = new Set();
  for (const entry of sql.files) {
    if (!/^d1-import-[0-9]+\.sql$/.test(entry.file) || !digest(entry.checksum) || sqlNames.has(entry.file)) fail();
    sqlNames.add(entry.file);
    result.push({ path: join(dirname(sqlDescriptor.path), entry.file), sha256: entry.checksum });
  }
  return result;
};

// Only signed manifest references extend the signed phase artifact allowlist.
const inventory = async (options) => {
  const { root, contractPath } = options;
  await assertExternalMigrationRoot(root);
  const contract = await json(root, contractPath);
  // Bound every signed JSON document before the existing evidence verifier reads it.
  for (const phase of contract.phases ?? []) {
    for (const descriptor of [phase.artifact, ...Object.values(phase.artifacts ?? {})]) {
      if (!descriptor || descriptor.size > METADATA) fail();
    }
  }
  await validateProtectedMigrationEvidence(contract, options);
  const files = new Map();
  const add = async (path, expected) => {
    if (!isMigrationArtifactReference(path)) fail();
    const actual = await fileDigest(root, path);
    if (
      expected && (actual.sha256 !== expected.sha256 || (expected.size !== undefined && actual.size !== expected.size))
    ) fail();
    if (files.has(path) && JSON.stringify(files.get(path)) !== JSON.stringify(actual)) fail();
    files.set(path, actual);
  };
  await add(contractPath);
  for (const phase of contract.phases) {
    await add(phase.artifact.path, phase.artifact);
    for (const artifact of Object.values(phase.artifacts)) await add(artifact.path, artifact);
  }
  for (const entry of await dataReferences(root, contract)) await add(entry.path, entry);
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
};
const serialize = (value) => {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > METADATA) fail();
  return body;
};
const get = async (storage, key, limit) => {
  const body = await storage.get(key, limit);
  if (!Buffer.isBuffer(body) || body.length > limit) fail();
  return body;
};
const verifiedPut = async (storage, key, body) => {
  await storage.putNew(key, body);
  const uploaded = await get(storage, key, body.length);
  if (uploaded.length !== body.length || hash(uploaded) !== hash(body)) fail();
};

/** Resumption is deliberately refused: a reservation permanently consumes its run ID. */
export const publishMigrationBundle = async (options) => {
  try {
    const { prefix, chunkSize } = context(options);
    const files = await inventory(options);
    const { storage, environment, expectedMainSha, expectedRunId, contractPath, root } = options;
    await storage.assertPrivate();
    await storage.putNew(
      `${prefix}/reservation`,
      serialize({ environment, mainSha: expectedMainSha, runId: expectedRunId }),
    );
    const index = {
      schema: 'iori-migration-bundle/v1',
      environment,
      mainSha: expectedMainSha,
      runId: expectedRunId,
      contractPath,
      files: [],
    };
    for (const [fileIndex, file] of files.entries()) {
      const parts = [];
      const fullHash = createHash('sha256');
      let total = 0;
      const path = await resolveMigrationArtifactPath(root, file.path);
      for await (const bytes of createReadStream(path, { highWaterMark: chunkSize })) {
        const key = `${prefix}/parts/${fileIndex}/${parts.length}`;
        const part = { size: bytes.length, sha256: hash(bytes) };
        await verifiedPut(storage, key, bytes);
        parts.push(part);
        fullHash.update(bytes);
        total += bytes.length;
      }
      if (total !== file.size || fullHash.digest('hex') !== file.sha256) fail();
      index.files.push({ ...file, parts });
    }
    const indexBody = serialize(index);
    await verifiedPut(storage, `${prefix}/index`, indexBody);
    await storage.putNew(
      `${prefix}/complete`,
      serialize({ schema: 'iori-migration-complete/v1', sha256: hash(indexBody) }),
    );
    return { status: 'published', fileCount: files.length };
  } catch {
    throw new Error('Migration bundle publication failed.');
  }
};

const validateIndex = (index, options) => {
  if (
    index?.schema !== 'iori-migration-bundle/v1' || index.environment !== options.environment
    || index.mainSha !== options.expectedMainSha || index.runId !== options.expectedRunId
    || index.contractPath !== options.contractPath || !Array.isArray(index.files) || !index.files.length
  ) fail();
  const paths = new Set();
  let total = 0;
  for (const file of index.files) {
    if (
      !isMigrationArtifactReference(file.path) || paths.has(file.path) || !Number.isSafeInteger(file.size)
      || file.size < 0 || !digest(file.sha256) || !Array.isArray(file.parts)
    ) fail();
    paths.add(file.path);
    let size = 0;
    for (const part of file.parts) {
      if (!Number.isSafeInteger(part.size) || part.size <= 0 || part.size > CHUNK || !digest(part.sha256)) fail();
      size += part.size;
    }
    if (size !== file.size) fail();
    total += size;
    if (!Number.isSafeInteger(total)) fail();
  }
  if (!paths.has(options.contractPath)) fail();
  for (const path of paths) {
    let parent = dirname(path);
    while (parent !== '.') {
      if (paths.has(parent)) fail();
      parent = dirname(parent);
    }
  }
  return total;
};

export const restoreMigrationBundle = async (options) => {
  try {
    const { prefix } = context(options);
    const {
      storage,
      root,
      availableBytes = async (path) => {
        const s = await statfs(path, { bigint: true });
        return s.bavail * s.bsize;
      },
    } = options;
    await assertExternalMigrationRoot(root);
    const rootInfo = await lstat(root);
    if ((rootInfo.mode & 0o777) !== 0o700 || (await readdir(root)).length !== 0) fail();
    const complete = JSON.parse((await get(storage, `${prefix}/complete`, 1024)).toString());
    const indexBody = await get(storage, `${prefix}/index`, METADATA);
    if (complete?.schema !== 'iori-migration-complete/v1' || complete.sha256 !== hash(indexBody)) fail();
    const index = JSON.parse(indexBody.toString());
    const total = validateIndex(index, options);
    // Charge filesystem allocation units as well as contents before any part download.
    if (BigInt(await availableBytes(root)) < BigInt(total) + BigInt(index.files.length) * 4096n) fail();
    const restored = new Set();
    const download = async (fileIndex) => {
      const file = index.files[fileIndex];
      if (restored.has(file.path)) return;
      const path = join(root, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const handle = await open(path, 'wx', 0o600);
      const fullHash = createHash('sha256');
      try {
        for (const [partIndex, part] of file.parts.entries()) {
          const body = await get(storage, `${prefix}/parts/${fileIndex}/${partIndex}`, part.size);
          if (body.length !== part.size || hash(body) !== part.sha256) fail();
          await handle.writeFile(body);
          fullHash.update(body);
        }
      } finally {
        await handle.close();
      }
      if (fullHash.digest('hex') !== file.sha256) fail();
      restored.add(file.path);
    };
    const locate = (reference, descriptor) => {
      const i = index.files.findIndex((file) => file.path === reference);
      if (i < 0 || index.files[i].size > METADATA) fail();
      if (descriptor && (index.files[i].size !== descriptor.size || index.files[i].sha256 !== descriptor.sha256)) {
        fail();
      }
      return i;
    };
    await download(locate(options.contractPath));
    const contract = assertProtectedMigrationContract(await json(root, options.contractPath), options);
    for (const phase of contract.phases) {
      for (const descriptor of [phase.artifact, ...Object.values(phase.artifacts)]) {
        await download(locate(descriptor.path, descriptor));
      }
    }
    await validateProtectedMigrationEvidence(contract, options);
    const allowed = new Set(restored);
    for (const entry of await dataReferences(root, contract)) {
      const file = index.files.find((file) => file.path === entry.path);
      if (!file || file.sha256 !== entry.sha256) fail();
      allowed.add(entry.path);
    }
    if (allowed.size !== index.files.length || index.files.some((file) => !allowed.has(file.path))) fail();
    for (const [i] of index.files.entries()) await download(i);
    const actual = await inventory(options);
    if (
      JSON.stringify(actual) !== JSON.stringify(index.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })))
    ) fail();
    return { status: 'restored', fileCount: actual.length };
  } catch {
    throw new Error('Migration bundle restoration failed.');
  }
};
