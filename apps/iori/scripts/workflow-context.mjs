import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const parseWorkflowInvocation = (env) => {
  const operation = env.IORI_OPERATION;
  if (['reconcile-resources', 'replace-queue-consumer'].includes(operation)) {
    throw new Error('Maintenance operation requires a separate review.');
  }
  const codeSha = env.MAIN_SHA;
  const migrationSha = env.IORI_MIGRATION_MAIN_SHA || codeSha;
  if (
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SHA !== codeSha || !/^[a-f0-9]{40}$/.test(codeSha ?? '')
    || !/^[a-f0-9]{40}$/.test(migrationSha ?? '')
    || !['prepare-target', 'migrate-data', 'verify-import', 'cutover-route', 'deploy-worker'].includes(operation)
    || !['production', 'staging'].includes(env.IORI_ENVIRONMENT)
    || !/^[a-z][a-z0-9]{7,19}$/.test(env.IORI_GENERATION ?? '')
    || !/^[A-Za-z0-9_-]{1,80}$/.test(env.IORI_MIGRATION_RUN_ID ?? '')
    || (operation !== 'deploy-worker' && codeSha !== migrationSha)
  ) throw new Error('Protected workflow invocation is invalid.');
  return Object.freeze({
    operation,
    codeSha,
    migrationSha,
    environment: env.IORI_ENVIRONMENT,
    generation: env.IORI_GENERATION,
    runId: env.IORI_MIGRATION_RUN_ID,
  });
};

export const workflowTimeBudget = (startedAt, now = Date.now()) => {
  const remainingMs = startedAt + 345 * 60_000 - now;
  const verificationMs = remainingMs - 15 * 60_000;
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > now || verificationMs <= 0) {
    throw new Error('Hosted job budget is exhausted.');
  }
  return { remainingMs, verificationMs };
};

export const createWorkflowDirectory = async (runnerTemp) => {
  const parent = await realpath(runnerTemp);
  const stat = await lstat(parent);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.()) throw new Error('Invalid runner temporary directory.');
  const base = await mkdtemp(join(parent, 'iori-private-'));
  const paths = { base };
  try {
    for (const name of ['keys', 'config', 'logs', 'state', 'tmp', 'root']) {
      paths[name] = join(base, name);
      await mkdir(paths[name], { mode: 0o700 });
    }
    return paths;
  } catch (error) {
    await rm(base, { recursive: true, force: true });
    throw error;
  }
};

export const writePrivateValue = async (directory, name, value) => {
  if (!/^[a-z][a-z0-9.-]{0,63}$/.test(name) || typeof value !== 'string' || !value || value.length > 65536) {
    throw new Error('Invalid private workflow value.');
  }
  const stat = await lstat(directory);
  if (
    await realpath(directory) !== directory || !stat.isDirectory()
    || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700
  ) throw new Error('Invalid private workflow directory.');
  const path = join(directory, name);
  await writeFile(path, value, { flag: 'wx', mode: 0o600 });
  return path;
};
