import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const recoveryOperations = ['resume-source', 'release-pending-freeze', 'restart-failed-source'];
const recoveryValues = ['destination_writes_not_enabled', 'destination_writes_reconciled'];
const moveOperations = ['move-unfollowed-reposts-dry-run', 'move-unfollowed-reposts'];
const pruneOperations = ['prune-federated-posts-dry-run'];
const bucketOperations = ['ensure-event-archive-bucket'];
const shaPattern = /^[a-f0-9]{40}$/;
const generationPattern = /^[a-z][a-z0-9]{7,19}$/;
const runIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
export const repostCreatedBefore = (value, now = Date.now()) => {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return undefined;
  const milliseconds = Number(value);
  return Number.isSafeInteger(milliseconds) && milliseconds <= now ? milliseconds : undefined;
};
const admissionInputs = (text) => {
  try {
    const value = JSON.parse(text ?? 'null');
    if (
      value && typeof value === 'object' && value.environment === 'production'
      && generationPattern.test(value.generation ?? '') && runIdPattern.test(value.runId ?? '')
      && shaPattern.test(value.mainSha ?? '')
    ) return { generation: value.generation, runId: value.runId, migrationSha: value.mainSha };
  } catch {}
  return undefined;
};
const pushInvocation = (env, deferIdentity) => {
  const codeSha = env.MAIN_SHA;
  const derived = deferIdentity ? undefined : admissionInputs(env.IORI_ADMISSION_IDENTITY);
  if (
    env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_SHA !== codeSha || !shaPattern.test(codeSha ?? '')
    || env.IORI_OPERATION !== 'deploy-worker' || env.IORI_ENVIRONMENT !== 'production'
    || Boolean(env.IORI_RECOVERY)
    || (!deferIdentity && !derived)
    || (derived && [
      [env.IORI_GENERATION, derived.generation],
      [env.IORI_MIGRATION_RUN_ID, derived.runId],
      [env.IORI_MIGRATION_MAIN_SHA, derived.migrationSha],
    ].some(([given, expected]) => given && given !== expected))
  ) throw new Error('Protected workflow invocation is invalid.');
  return Object.freeze({
    operation: 'deploy-worker',
    codeSha,
    migrationSha: derived?.migrationSha ?? codeSha,
    environment: 'production',
    generation: derived?.generation ?? '',
    runId: derived?.runId ?? '',
  });
};
export const parseWorkflowInvocation = (env, { deferIdentity = false, now = Date.now() } = {}) => {
  const operation = env.IORI_OPERATION;
  if (['reconcile-resources', 'replace-queue-consumer'].includes(operation)) {
    throw new Error('Maintenance operation requires a separate review.');
  }
  if (env.GITHUB_EVENT_NAME === 'push') return pushInvocation(env, deferIdentity);
  const codeSha = env.MAIN_SHA;
  const recoveryOperation = recoveryOperations.includes(operation);
  const migrationSha = recoveryOperation ? env.IORI_MIGRATION_MAIN_SHA : env.IORI_MIGRATION_MAIN_SHA || codeSha;
  if (
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SHA !== codeSha || !/^[a-f0-9]{40}$/.test(codeSha ?? '')
    || !/^[a-f0-9]{40}$/.test(migrationSha ?? '')
    || ![
      'deploy-worker',
      'put-worker-secrets',
      'diagnose-source',
      'delete-rehearsal-d1',
      ...moveOperations,
      ...pruneOperations,
      ...bucketOperations,
      ...recoveryOperations,
    ].includes(operation)
    || !['production', 'staging'].includes(env.IORI_ENVIRONMENT)
    || (['delete-rehearsal-d1', ...moveOperations, ...pruneOperations].includes(operation)
      && env.IORI_ENVIRONMENT !== 'production')
    || (['diagnose-source', 'delete-rehearsal-d1'].includes(operation)
      ? Boolean(env.IORI_GENERATION) || Boolean(env.IORI_MIGRATION_RUN_ID)
      : [...moveOperations, ...pruneOperations, ...bucketOperations].includes(operation)
      ? !generationPattern.test(env.IORI_GENERATION ?? '') || Boolean(env.IORI_MIGRATION_RUN_ID)
      : !generationPattern.test(env.IORI_GENERATION ?? '')
        || !runIdPattern.test(env.IORI_MIGRATION_RUN_ID ?? ''))
    || (moveOperations.includes(operation)
      ? repostCreatedBefore(env.IORI_REPOST_CREATED_BEFORE_MS, now) === undefined
      : Boolean(env.IORI_REPOST_CREATED_BEFORE_MS))
    || (!['deploy-worker', 'put-worker-secrets'].includes(operation)
      && !recoveryOperation
      && codeSha !== migrationSha)
    || (operation === 'resume-source' && !recoveryValues.includes(env.IORI_RECOVERY))
    || (!recoveryOperation && env.IORI_RECOVERY)
    || (['release-pending-freeze', 'restart-failed-source'].includes(operation) && env.IORI_RECOVERY)
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
    for (const name of ['keys', 'config', 'logs', 'tmp']) {
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
