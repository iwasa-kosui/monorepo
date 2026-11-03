import { mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { readPrivateBounded } from './migration-file-stream.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { createDeploymentWorkerConfig } from './temporary-worker-config.mjs';
const MIGRATIONS_TABLE = 'd1_migrations';
const initialMigrationDirectory = new URL('../drizzle-d1/', import.meta.url);
export const parseInitialMigrationTables = (sql) =>
  [...sql.matchAll(/CREATE TABLE `([A-Za-z0-9_]+)`/g)].map((match) => match[1]);
const readInitialMigration = async () => {
  const names = (await readdir(initialMigrationDirectory)).filter((name) => /^0000.*\.sql$/.test(name));
  if (names.length !== 1 || !/^[A-Za-z0-9_.-]+$/.test(names[0])) return undefined;
  const tables = parseInitialMigrationTables(await readFile(new URL(names[0], initialMigrationDirectory), 'utf8'));
  return tables.length === 0 ? undefined : { name: names[0], tables };
};
const quoted = (names) => names.map((name) => `'${name}'`).join(', ');
const presentTablesSql = (tables) =>
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${quoted([MIGRATIONS_TABLE, ...tables])})`;
const migrationCountSql = `SELECT COUNT(*) AS count FROM ${MIGRATIONS_TABLE}`;
const baselineSql = (name) =>
  `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ('${name}');`;
const parseD1Rows = (stdout) => {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) && parsed.length === 1 && parsed[0]?.success === true && Array.isArray(parsed[0].results)
    ? parsed[0].results
    : undefined;
};
export const decideD1Baseline = ({ initialTables, presentTables, migrationRows }) => {
  if (migrationRows !== undefined && migrationRows > 0) return 'apply';
  const existing = initialTables.filter((table) => presentTables.includes(table)).length;
  if (existing === 0) return 'apply';
  return existing === initialTables.length ? 'baseline' : 'mismatch';
};
export const deployReviewedWorkerVersion = async (
  {
    identity,
    resources,
    admissionEnvironment,
    mode,
    signal,
    runCommand = runInfrastructureCommand,
    migrateD1 = false,
    onStage = () => {},
  },
) => {
  if (!['sealed', 'smoke', 'active'].includes(mode)) throw new Error('Invalid Worker mode.');
  signal.throwIfAborted();
  const config = await createDeploymentWorkerConfig({ admissionMode: mode, admissionEnvironment });
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'iori-admission-'));
  const outputPath = join(directory, 'deployment.ndjson');
  await writeFile(outputPath, '', { mode: 0o600 });
  let migrationFailure;
  try {
    const rendered = JSON.parse(await readFile(config.path, 'utf8'));
    if (
      rendered.name !== identity.workerName
      || rendered.vars.IORI_ADMISSION_IDENTITY !== admissionEnvironment.IORI_ADMISSION_IDENTITY
      || rendered.vars.ORIGIN !== admissionEnvironment.ORIGIN || rendered.vars.IORI_ADMISSION_MODE !== mode
      || rendered.d1_databases?.[0]?.database_id !== resources.d1Id
      || rendered.kv_namespaces?.[0]?.id !== resources.kvId
      || rendered.r2_buckets?.[0]?.bucket_name !== identity.names.uploads
      || rendered.queues?.producers?.[0]?.queue !== identity.names.queue
    ) throw new Error('Admission configuration mismatch.');
    signal.throwIfAborted();
    if (migrateD1) {
      onStage('deploy-worker-migrate');
      const runD1 = async (args, name) => {
        let result;
        try {
          result = await runCommand('pnpm', ['exec', 'wrangler', 'd1', ...args], {
            signal,
            cwd: new URL('..', import.meta.url).pathname,
            shell: false,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
              ...process.env,
              WRANGLER_LOG_PATH: join(directory, `wrangler-${name}.log`),
              WRANGLER_SEND_METRICS: 'false',
            },
          });
        } catch {
          migrationFailure = withReason(new Error('D1 migration failed; retain current state.'), 'command-failed');
          throw migrationFailure;
        }
        await writeFile(join(directory, `${name}-diagnostic.txt`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, {
          mode: 0o600,
        });
        signal.throwIfAborted();
        if (result.status !== 0) {
          migrationFailure = withReason(new Error('D1 migration failed; retain current state.'), 'command-failed');
          throw migrationFailure;
        }
        return result;
      };
      const baselineMismatch = () => {
        migrationFailure = withReason(new Error('D1 baseline mismatch; retain current state.'), 'd1-baseline-mismatch');
        return migrationFailure;
      };
      const initial = await readInitialMigration();
      if (initial === undefined) throw baselineMismatch();
      const readRows = async (sql, name) =>
        parseD1Rows(
          (await runD1(['execute', 'DB', '--remote', '--config', config.path, '--json', '--command', sql], name))
            .stdout,
        );
      const tableRows = await readRows(presentTablesSql(initial.tables), 'd1-baseline-read');
      if (tableRows === undefined || !tableRows.every((row) => typeof row?.name === 'string')) throw baselineMismatch();
      const presentTables = tableRows.map((row) => row.name);
      let migrationRows;
      if (presentTables.includes(MIGRATIONS_TABLE)) {
        const countRows = await readRows(migrationCountSql, 'd1-baseline-count');
        const count = countRows?.length === 1 ? countRows[0]?.count : undefined;
        if (!Number.isSafeInteger(count) || count < 0) throw baselineMismatch();
        migrationRows = count;
      }
      const decision = decideD1Baseline({ initialTables: initial.tables, presentTables, migrationRows });
      if (decision === 'mismatch') throw baselineMismatch();
      if (decision === 'baseline') {
        await runD1(
          ['execute', 'DB', '--remote', '--config', config.path, '--command', baselineSql(initial.name)],
          'd1-baseline-write',
        );
      }
      await runD1(['migrations', 'apply', 'DB', '--remote', '--config', config.path], 'd1-migrate');
      onStage('deploy-worker-deploy');
    }
    const result = await runCommand('pnpm', ['exec', 'wrangler', 'deploy', '--config', config.path, '--minify'], {
      signal,
      cwd: new URL('..', import.meta.url).pathname,
      shell: false,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WRANGLER_OUTPUT_FILE_PATH: outputPath,
        WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
        WRANGLER_SEND_METRICS: 'false',
      },
    });
    await writeFile(join(directory, 'diagnostic.txt'), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, {
      mode: 0o600,
    });
    signal.throwIfAborted();
    if (result.status !== 0) throw new Error('Admission deployment failed.');
    const records = (await readPrivateBounded(outputPath, 2 * 1024 * 1024, signal)).toString('utf8').trim().split('\n')
      .map((line) => JSON.parse(line));
    const deployed = records.filter((record) =>
      record.type === 'deploy' && record.version === 1 && record.worker_name === identity.workerName
    ).at(-1);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(deployed?.version_id ?? '')) {
      throw new Error('Admission version evidence unavailable.');
    }
    return deployed.version_id;
  } catch (error) {
    if (error === migrationFailure) throw error;
    throw new Error('Reviewed Worker deployment failed; retain current state.');
  } finally {
    await config.cleanup();
  }
};
