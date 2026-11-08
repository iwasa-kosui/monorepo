import { appendFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { removePrivateWorkflowDirectory } from './cleanup-private-workflow-directory.mjs';
import { withCliSignal } from './cli-lifetime.mjs';
import { runMigrationCommand } from './migration-command.mjs';
import { createPrivateCommandLog } from './private-command-log.mjs';
import { sourceDiagnoseNoticeLine, sourceUnitStatusNoticeLine } from './source-diagnose-remote.mjs';
import {
  createWorkflowDirectory,
  parseWorkflowInvocation,
  workflowTimeBudget,
  writePrivateValue,
} from './workflow-context.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const operations = Object.freeze({
  'deploy-worker': 'deploy-active-worker.mjs',
  'put-worker-secrets': 'worker-bindings-put.mjs',
  source: 'deploy-source.mjs',
  'resume-source': 'resume-source.mjs',
  'release-pending-freeze': 'release-pending-freeze.mjs',
  'restart-failed-source': 'restart-failed-source.mjs',
  'diagnose-source': 'diagnose-source.mjs',
  'delete-rehearsal-d1': 'delete-rehearsal-d1.mjs',
  'move-unfollowed-reposts-dry-run': 'move-unfollowed-reposts.mjs',
  'move-unfollowed-reposts': 'move-unfollowed-reposts.mjs',
  'delete-unfollowed-posts-dry-run': 'delete-unfollowed-posts.mjs',
  'delete-unfollowed-posts': 'delete-unfollowed-posts.mjs',
  'domain-events-stats': 'domain-events-stats.mjs',
  'delete-blocked-domain-posts-dry-run': 'delete-blocked-domain-posts.mjs',
  'delete-blocked-domain-posts': 'delete-blocked-domain-posts.mjs',
  'prune-federated-posts-dry-run': 'prune-federated-posts.mjs',
  'ensure-event-archive-bucket': 'ensure-event-archive-bucket.mjs',
});
const sourceInvocation = (env) => {
  if (
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || !/^[a-f0-9]{40}$/.test(env.MAIN_SHA ?? '') || env.MAIN_SHA !== env.GITHUB_SHA
  ) throw new Error('Invalid source invocation.');
  return { operation: 'source', codeSha: env.MAIN_SHA };
};
const invocation = (env, deferIdentity = false) =>
  env.IORI_OPERATION === 'source' ? sourceInvocation(env) : parseWorkflowInvocation(env, { deferIdentity });
const privateBase = async env => {
  const root = env.IORI_PRIVATE_DIRECTORY;
  const stat = await lstat(root);
  const temp = await realpath(env.RUNNER_TEMP);
  if (
    !stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700
    || await realpath(root) !== root
    || !root.startsWith(`${temp}/iori-private-`) || root.slice(temp.length + 1).includes('/')
  ) throw new Error('Invalid hosted private root.');
  return root;
};
export const initializeHostedWorkflow = async env => {
  invocation(env, true);
  workflowTimeBudget(Number(env.IORI_JOB_STARTED_AT));
  const paths = await createWorkflowDirectory(env.RUNNER_TEMP);
  const values = {
    IORI_PRIVATE_DIRECTORY: paths.base,
    IORI_PRIVATE_LOG_DIRECTORY: paths.logs,
    TMPDIR: paths.tmp,
    WRANGLER_LOG_PATH: join(paths.logs, 'wrangler.log'),
  };
  // GitHub masks the ephemeral paths in later step environment displays; secret values are never printed.
  try {
    for (const value of Object.values(values)) process.stdout.write(`::add-mask::${value}\n`);
    await appendFile(env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
    return paths;
  } catch (error) {
    await removePrivateWorkflowDirectory({ directory: paths.base, runnerTemp: env.RUNNER_TEMP });
    throw error;
  }
};
export const materializeHostedValues = async env => {
  const { operation, migrationSha, generation, runId } = invocation(env);
  const base = await privateBase(env);
  const mapped = {
    ...env,
    ...(env.GITHUB_EVENT_NAME === 'push'
      ? { IORI_GENERATION: generation, IORI_MIGRATION_RUN_ID: runId, IORI_MIGRATION_MAIN_SHA: migrationSha }
      : {}),
  };
  const put = async (input, output, name, normalize = value => value) => {
    mapped[output] = await writePrivateValue(join(base, 'keys'), name, normalize(env[input]));
    delete mapped[input];
  };
  if (
    [
      'source',
      'resume-source',
      'release-pending-freeze',
      'restart-failed-source',
      'diagnose-source',
    ].includes(operation)
  ) {
    await put(
      'IORI_SOURCE_SSH_PRIVATE_KEY',
      'IORI_SOURCE_SSH_IDENTITY_FILE',
      'source-key',
      value => typeof value === 'string' && value && !value.endsWith('\n') ? `${value}\n` : value,
    );
    await put('IORI_SOURCE_SSH_KNOWN_HOSTS', 'IORI_SOURCE_SSH_KNOWN_HOSTS_FILE', 'source-known-hosts');
  }
  for (
    const key of [
      'IORI_SOURCE_SSH_PRIVATE_KEY',
      'IORI_SOURCE_SSH_KNOWN_HOSTS',
    ]
  ) delete mapped[key];
  return mapped;
};
// Only fixed-vocabulary diagnostics may reach the public Actions log.
const diagnosticLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const ownerNoticeLine = /^IORI_NOTICE stage=remote-configuration-owner previous_uid=\d{1,10} previous_gid=\d{1,10}$/;
const modeNoticeLine = /^IORI_NOTICE stage=remote-configuration-mode previous_mode=0[0-7]{3}$/;
const releaseNoticeLine = /^IORI_NOTICE stage=release-pending-freeze renamed=1$/;
const alreadyRenamedNoticeLine = /^IORI_NOTICE stage=release-pending-freeze already_renamed=1$/;
const stoppedNoticeLine = /^IORI_NOTICE stage=release-pending-freeze stopped=1$/;
const restartPrecheckNoticeLine =
  /^IORI_NOTICE stage=restart-precheck ingress_frozen=[01] consumer_paused=[01] queue_failed=[01] drained=[01]$/;
const restartNoticeLine = /^IORI_NOTICE stage=restart-failed-source (?:recorded|stopped|started)=1$/;
const rehearsalNoticeLine =
  /^IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse[1-5] state=(?:present|absent|empty|not-empty|ambiguous|check-failed|deleted|delete-failed|remaining)$/;
const moveNoticeLine =
  /^IORI_NOTICE move-unfollowed-reposts (?:mode=dry-run targets=\d{1,9} posts=\d{1,9} already_federated=\d{1,9} to_create=\d{1,9} missing_posts=\d{1,9}|mode=apply created=\d{1,9} deleted=\d{1,9})$/;
const deleteNoticeLine =
  /^IORI_NOTICE delete-unfollowed-posts (?:mode=dry-run targets=\d{1,9} federated=\d{1,9}|mode=apply deleted=\d{1,9})$/;
const statsNoticeLine =
  /^IORI_NOTICE domain-events-stats (?:summary total=\d{1,12} oldest=(?:none|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) newest=(?:none|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) older_than_7d=\d{1,12} avg_bytes=\d{1,12} max_bytes=\d{1,12} created_at_skew_actors=\d{1,12}|day=\d{4}-\d{2}-\d{2} count=\d{1,12}|event=[A-Za-z][A-Za-z0-9.]{0,63} count=\d{1,12})$/;
const deleteBlockedDomainNoticeLine =
  /^IORI_NOTICE delete-blocked-domain-posts (?:mode=dry-run domain=baraag\.net posts=\d{1,9} remote_posts=\d{1,9} timeline_items=\d{1,9} federated_items=\d{1,9} reposts=\d{1,9} likes=\d{1,9} emoji_reacts=\d{1,9} notifications=\d{1,9} orphan_repost_notifications=\d{1,9} images=\d{1,9} articles_skipped=\d{1,9} actors=\d{1,9} follows_out=\d{1,9} follows_in=\d{1,9} mutes=\d{1,9}|mode=apply deleted_posts=\d{1,9} deleted_timeline_items=\d{1,9})$/;
const pruneNoticeLine =
  /^IORI_NOTICE prune-federated-posts mode=dry-run candidates=\d{1,9} local_likes=\d{1,9} local_emoji=\d{1,9} home=\d{1,9} local_repost=\d{1,9} reply=\d{1,9} notification=\d{1,9} article=\d{1,9} to_delete=\d{1,9} cutoff_ms=[1-9]\d{0,15}$/;
const bucketNoticeLine =
  /^IORI_NOTICE event-archive-bucket environment=(?:production|staging) state=(?:exists|created|create-conflict|verified|staging-not-running|event-archive-bucket-forbidden)$/;
const hostedReasons = [
  ['Invalid source invocation.', 'invalid-source-invocation'],
  ['Protected workflow invocation is invalid.', 'invalid-invocation'],
  ['Maintenance operation requires a separate review.', 'maintenance-review-required'],
  ['Hosted job budget is exhausted.', 'job-budget-exhausted'],
  ['Invalid hosted private root.', 'private-root-invalid'],
  ['Invalid runner temporary directory.', 'runner-temp-invalid'],
  ['Invalid private workflow value.', 'private-value-invalid'],
  ['Invalid private workflow directory.', 'private-directory-invalid'],
  ['Private diagnostic directory is invalid.', 'log-directory-invalid'],
  ['Reviewed main is required.', 'reviewed-main-required'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Migration target evidence is invalid.', 'identity-mismatch'],
  ['Migration command failed; outcome may be uncertain.', 'command-failed'],
  ['Migration command aborted.', 'aborted'],
];
const hostedCodeReasons = {
  ENOENT: 'fs-enoent',
  EACCES: 'fs-eacces',
  EEXIST: 'fs-eexist',
  ERR_INVALID_ARG_TYPE: 'invalid-argument',
};
const writeDiagnosticLine = async line => {
  try {
    if (
      !diagnosticLine.test(line) && !ownerNoticeLine.test(line) && !modeNoticeLine.test(line)
      && !releaseNoticeLine.test(line) && !alreadyRenamedNoticeLine.test(line) && !stoppedNoticeLine.test(line)
      && !restartPrecheckNoticeLine.test(line) && !restartNoticeLine.test(line)
      && !sourceDiagnoseNoticeLine.test(line) && !sourceUnitStatusNoticeLine.test(line)
      && !rehearsalNoticeLine.test(line) && !moveNoticeLine.test(line) && !deleteNoticeLine.test(line)
      && !statsNoticeLine.test(line)
      && !pruneNoticeLine.test(line) && !bucketNoticeLine.test(line) && !deleteBlockedDomainNoticeLine.test(line)
    ) return;
    const { assertWorkflowOutput } = await import('./assert-workflow-output.mjs');
    if (assertWorkflowOutput(line).length === 0) process.stderr.write(`${line}\n`);
  } catch {}
};
export const publishChildDiagnostics = async stderr => {
  for (const line of String(stderr).split('\n')) await writeDiagnosticLine(line);
};
const hostedStage = async (name, operation, program = 'none') => {
  try {
    return await operation();
  } catch (error) {
    const exit = program === 'node' && Number.isInteger(error?.exitCode) && error.exitCode >= 0 && error.exitCode <= 255
      ? String(error.exitCode)
      : 'none';
    const exitSignal = program === 'node' && typeof error?.signal === 'string' && /^[A-Z0-9]{1,12}$/.test(error.signal)
      ? error.signal
      : 'none';
    const reason = hostedReasons.find(([message]) => error?.message === message)?.[1]
      ?? (error?.spawnFailed === true ? 'spawn-failed' : undefined)
      ?? hostedCodeReasons[error?.code] ?? 'unclassified';
    await writeDiagnosticLine(
      `IORI_DIAG stage=hosted-${name} program=${program} exit=${exit} signal=${exitSignal} reason=${reason}`,
    );
    throw error;
  }
};
const execute = async (program, args, env, signal, timeout) => {
  const log = await createPrivateCommandLog(env.IORI_PRIVATE_LOG_DIRECTORY);
  try {
    return await runMigrationCommand(program, args, {
      cwd: repo,
      env,
      signal,
      timeout,
      maxBuffer: 8_000_000,
      killGraceMs: 15000,
      captureOutput: async result => {
        try {
          await log.capture(result);
        } finally {
          await publishChildDiagnostics(result.stderr);
        }
      },
    });
  } finally {
    await log.close();
  }
};
export const executeHostedOperation = (name, scriptPath, env, signal, timeout) =>
  hostedStage(name, () => execute(process.execPath, [scriptPath], env, signal, timeout), 'node');
export const runHostedWorkflow = async (phase, env, parentSignal) => {
  const stage = (name, operation, program) => phase === 'operate' ? hostedStage(name, operation, program) : operation();
  let selected;
  let remainingMs;
  await stage('invocation', () => {
    selected = invocation(env, phase !== 'operate');
    ({ remainingMs } = workflowTimeBudget(Number(env.IORI_JOB_STARTED_AT)));
  });
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(remainingMs)]);
  await stage('private-directory', () => privateBase(env));
  if (phase === 'setup') {
    await execute('pnpm', ['install', '--frozen-lockfile'], env, signal, remainingMs);
    await execute('pnpm', ['--filter', 'result', 'run', 'build'], env, signal, remainingMs);
    await execute(
      'pnpm',
      ['--filter', 'iori', 'run', selected.operation === 'source' ? 'build' : 'build:client'],
      env,
      signal,
      remainingMs,
    );
    return;
  }
  if (phase === 'public-check') {
    await execute(process.execPath, ['apps/iori/scripts/assert-public-artifacts.mjs'], env, signal, remainingMs);
    return;
  }
  if (phase !== 'operate') throw new Error('Invalid hosted phase.');
  const runtime = await stage('materialize', () => materializeHostedValues(env));
  await stage('reviewed-main', async () => {
    const { assertReviewedMain } = await import('./reviewed-main.mjs');
    return assertReviewedMain(selected.codeSha, { signal });
  });
  await executeHostedOperation(
    selected.operation === 'source' ? 'deploy-source' : 'operation',
    `apps/iori/scripts/${operations[selected.operation]}`,
    runtime,
    signal,
    remainingMs,
  );
};
export const hostedFailureMessage = () => 'Protected workflow step failed; retain remote state for reviewed recovery.';
const emitStatus = async success => {
  const { assertWorkflowOutput } = await import('./assert-workflow-output.mjs');
  const message = success ? 'Protected workflow step completed.' : hostedFailureMessage();
  if (assertWorkflowOutput(message).length) {
    process.exitCode = 1;
    return;
  }
  (success ? process.stdout : process.stderr).write(`${message}\n`);
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const phase = process.argv[2];
  withCliSignal(signal =>
    phase === 'init' ? initializeHostedWorkflow(process.env) : runHostedWorkflow(phase, process.env, signal)
  )
    .then(() => emitStatus(true)).catch(async () => {
      process.exitCode = 1;
      try {
        await emitStatus(false);
      } catch { /* keep failure without raw diagnostics */ }
    });
}
