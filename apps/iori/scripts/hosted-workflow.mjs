import { appendFile, lstat, realpath, writeFile } from 'node:fs/promises';
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
  'prepare-target': 'prepare-migration-target.mjs',
  'rehearse-migration': 'rehearse-protected-migration.mjs',
  'migrate-data': 'execute-protected-migration.mjs',
  'verify-import': 'restore-protected-migration.mjs',
  'cutover-route': 'cutover-migration.mjs',
  'deploy-worker': 'deploy-active-worker.mjs',
  'adopt-cutover-state': 'adopt-cutover-state.mjs',
  'estimate-source': 'estimate-source.mjs',
  'purge-rehearsal-target': 'purge-rehearsal-target.mjs',
  source: 'deploy-source.mjs',
  'resume-source': 'resume-source.mjs',
  'release-pending-freeze': 'release-pending-freeze.mjs',
  'restart-failed-source': 'restart-failed-source.mjs',
  'diagnose-source': 'diagnose-source.mjs',
});
const sourceInvocation = (env) => {
  if (
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || env.GITHUB_REF !== 'refs/heads/main'
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
    TF_DATA_DIR: join(paths.state, 'terraform-data'),
    TF_LOG_PATH: join(paths.logs, 'terraform.log'),
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
    IORI_MIGRATION_ROOT: join(base, 'root'),
    IORI_MIGRATION_EXPECTED_TARGET_PATH: join(base, 'config/expected-target.json'),
    ...(operation === 'purge-rehearsal-target' ? { MAIN_SHA: migrationSha } : {}),
  };
  const put = async (input, output, name, normalize = value => value) => {
    mapped[output] = await writePrivateValue(join(base, 'keys'), name, normalize(env[input]));
    delete mapped[input];
  };
  if (
    [
      'source',
      'rehearse-migration',
      'migrate-data',
      'cutover-route',
      'estimate-source',
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
  if (['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route'].includes(operation)) {
    await put('IORI_MIGRATION_RECEIPT_PUBLIC_KEY', 'IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH', 'receipt-public.pem');
  }
  if (['rehearse-migration', 'migrate-data'].includes(operation)) {
    await put('IORI_MIGRATION_RECEIPT_PRIVATE_KEY', 'IORI_MIGRATION_RECEIPT_PRIVATE_KEY_PATH', 'receipt-private.pem');
  }
  if (operation === 'migrate-data') {
    mapped.IORI_MIGRATION_REHEARSAL_PATH = await writePrivateValue(
      join(base, 'config'),
      'rehearsal.json',
      env.IORI_MIGRATION_REHEARSAL,
    );
    delete mapped.IORI_MIGRATION_REHEARSAL;
  }
  for (
    const key of [
      'IORI_SOURCE_SSH_PRIVATE_KEY',
      'IORI_SOURCE_SSH_KNOWN_HOSTS',
      'IORI_MIGRATION_RECEIPT_PUBLIC_KEY',
      'IORI_MIGRATION_RECEIPT_PRIVATE_KEY',
      'IORI_MIGRATION_REHEARSAL',
    ]
  ) delete mapped[key];
  return mapped;
};
// Only fixed-vocabulary diagnostics may reach the public Actions log.
const diagnosticLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|terraform|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const ownerNoticeLine = /^IORI_NOTICE stage=remote-configuration-owner previous_uid=\d{1,10} previous_gid=\d{1,10}$/;
const modeNoticeLine = /^IORI_NOTICE stage=remote-configuration-mode previous_mode=0[0-7]{3}$/;
const releaseNoticeLine = /^IORI_NOTICE stage=release-pending-freeze renamed=1$/;
const alreadyRenamedNoticeLine = /^IORI_NOTICE stage=release-pending-freeze already_renamed=1$/;
const stoppedNoticeLine = /^IORI_NOTICE stage=release-pending-freeze stopped=1$/;
const restartPrecheckNoticeLine =
  /^IORI_NOTICE stage=restart-precheck ingress_frozen=[01] consumer_paused=[01] queue_failed=[01] drained=[01]$/;
const restartNoticeLine = /^IORI_NOTICE stage=restart-failed-source (?:recorded|stopped|started)=1$/;
const estimateCount = '(?:0|[1-9]\\d{0,15})';
const exportMissingNoticeLine = new RegExp(`^IORI_NOTICE stage=export-missing-uploads count=${estimateCount}$`);
const estimateLine = new RegExp(
  `^IORI_ESTIMATE ${
    [
      'rows',
      'upload_count',
      'upload_duplicate_count',
      'upload_missing_count',
      'upload_owner_count',
      'upload_not_regular_count',
      'upload_too_large_count',
      'upload_access_count',
      'upload_other_count',
      'upload_ext_webp_count',
      'upload_ext_png_count',
      'upload_ext_jpeg_count',
      'upload_ext_gif_count',
      'upload_failed_ext_webp_count',
      'upload_failed_ext_png_count',
      'upload_failed_ext_jpeg_count',
      'upload_failed_ext_gif_count',
      'article_count',
    ].map((field) => `${field}=${estimateCount}`).join(' ')
  } sample=(?:ok|insufficient) capacity=(?:ok|insufficient)$`,
);
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
  ['Invalid target input.', 'target-input-invalid'],
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
      && !estimateLine.test(line) && !exportMissingNoticeLine.test(line) && !restartPrecheckNoticeLine.test(line)
      && !restartNoticeLine.test(line)
      && !sourceDiagnoseNoticeLine.test(line) && !sourceUnitStatusNoticeLine.test(line)
    ) return;
    const { assertWorkflowOutput } = await import('./assert-workflow-output.mjs');
    if (assertWorkflowOutput(line).length === 0) process.stderr.write(`${line}\n`);
  } catch {}
};
export const publishChildDiagnostics = async stderr => {
  for (const line of String(stderr).split('\n')) await writeDiagnosticLine(line);
};
const hostedStage = async (name, operation, program = 'none', classify = () => undefined) => {
  try {
    return await operation();
  } catch (error) {
    const exit = program === 'node' && Number.isInteger(error?.exitCode) && error.exitCode >= 0 && error.exitCode <= 255
      ? String(error.exitCode)
      : 'none';
    const exitSignal = program === 'node' && typeof error?.signal === 'string' && /^[A-Z0-9]{1,12}$/.test(error.signal)
      ? error.signal
      : 'none';
    const reason = classify(error) ?? hostedReasons.find(([message]) => error?.message === message)?.[1]
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
const stoppedBeforeResources = new WeakSet();
const preparationStopped = (operation, error) => operation === 'prepare-target' && error?.exitCode === 78;
export const executeHostedOperation = (name, scriptPath, env, signal, timeout, operation) =>
  hostedStage(
    name,
    async () => {
      try {
        return await execute(process.execPath, [scriptPath], env, signal, timeout);
      } catch (error) {
        if (preparationStopped(operation, error)) stoppedBeforeResources.add(error);
        throw error;
      }
    },
    'node',
    error => preparationStopped(operation, error) ? 'stopped-before-resources' : undefined,
  );
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
  if (
    ['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route', 'purge-rehearsal-target'].includes(
      selected.operation,
    )
  ) {
    await stage(
      'target-read',
      () => execute(process.execPath, ['apps/iori/scripts/read-migration-target.mjs'], runtime, signal, remainingMs),
      'node',
    );
    // The fixed target-reader output is private and is also the deployment binding authority.
    const target = await stage('target-load', async () => {
      const { loadExpectedTarget } = await import('./migration-target-input.mjs');
      return loadExpectedTarget(runtime.IORI_MIGRATION_EXPECTED_TARGET_PATH);
    });
    const b = {
      d1_database_id: target.resources.d1.id,
      r2_bucket_name: target.resources.uploads.name,
      kv_namespace_id: target.resources.kv.id,
      queue_name: target.resources.queue.name,
      worker_name: target.identity.worker_name,
    };
    const bindingPath = join(runtime.IORI_PRIVATE_DIRECTORY, 'config/worker-bindings.json');
    await stage('binding-write', () => writeFile(bindingPath, JSON.stringify(b), { flag: 'wx', mode: 0o600 }));
    runtime.IORI_WORKER_BINDINGS_PATH = bindingPath;
    runtime.IORI_REQUIRE_TERRAFORM_BINDINGS = 'true';
    await stage('main-recheck', async () => {
      const { assertReviewedMain } = await import('./reviewed-main.mjs');
      return assertReviewedMain(selected.codeSha, { signal });
    });
  }
  await executeHostedOperation(
    selected.operation === 'source' ? 'deploy-source' : 'operation',
    `apps/iori/scripts/${operations[selected.operation]}`,
    runtime,
    signal,
    remainingMs,
    selected.operation,
  );
};
export const hostedFailureMessage = error =>
  stoppedBeforeResources.has(error)
    ? 'Target preparation stopped before creating resources; fix the inputs and rerun with the same generation.'
    : 'Protected workflow step failed; retain remote state for reviewed recovery.';
const emitStatus = async (success, error) => {
  const { assertWorkflowOutput } = await import('./assert-workflow-output.mjs');
  const message = success ? 'Protected workflow step completed.' : hostedFailureMessage(error);
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
    .then(() => emitStatus(true)).catch(async error => {
      process.exitCode = 1;
      try {
        await emitStatus(false, error);
      } catch { /* keep failure without raw diagnostics */ }
    });
}
