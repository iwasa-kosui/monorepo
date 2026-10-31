import { appendFile, lstat, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { removePrivateWorkflowDirectory } from './cleanup-private-workflow-directory.mjs';
import { withCliSignal } from './cli-lifetime.mjs';
import { runMigrationCommand } from './migration-command.mjs';
import { createPrivateCommandLog } from './private-command-log.mjs';
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
  source: 'deploy-source.mjs',
  'resume-source': 'resume-source.mjs',
  'release-pending-freeze': 'release-pending-freeze.mjs',
});
const sourceInvocation = (env) => {
  if (
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || env.GITHUB_REF !== 'refs/heads/main'
    || !/^[a-f0-9]{40}$/.test(env.MAIN_SHA ?? '') || env.MAIN_SHA !== env.GITHUB_SHA
  ) throw new Error('Invalid source invocation.');
  return { operation: 'source', codeSha: env.MAIN_SHA };
};
const invocation = env => env.IORI_OPERATION === 'source' ? sourceInvocation(env) : parseWorkflowInvocation(env);
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
  invocation(env);
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
  const { operation } = invocation(env);
  const base = await privateBase(env);
  const mapped = {
    ...env,
    IORI_MIGRATION_ROOT: join(base, 'root'),
    IORI_MIGRATION_EXPECTED_TARGET_PATH: join(base, 'config/expected-target.json'),
  };
  const put = async (input, output, name, normalize = value => value) => {
    mapped[output] = await writePrivateValue(join(base, 'keys'), name, normalize(env[input]));
    delete mapped[input];
  };
  if (
    ['source', 'rehearse-migration', 'migrate-data', 'cutover-route', 'resume-source', 'release-pending-freeze']
      .includes(operation)
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
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const ownerNoticeLine = /^IORI_NOTICE stage=remote-configuration-owner previous_uid=\d{1,10} previous_gid=\d{1,10}$/;
const releaseNoticeLine = /^IORI_NOTICE stage=release-pending-freeze renamed=1$/;
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
    if (!diagnosticLine.test(line) && !ownerNoticeLine.test(line) && !releaseNoticeLine.test(line)) return;
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
    selected = invocation(env);
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
  const { assertReviewedMain } = await import('./reviewed-main.mjs');
  await stage('reviewed-main', () => assertReviewedMain(selected.codeSha, { signal }));
  if (['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route'].includes(selected.operation)) {
    await execute(process.execPath, ['apps/iori/scripts/read-migration-target.mjs'], runtime, signal, remainingMs);
    // The fixed target-reader output is private and is also the deployment binding authority.
    const { loadExpectedTarget } = await import('./migration-target-input.mjs');
    const target = await loadExpectedTarget(runtime.IORI_MIGRATION_EXPECTED_TARGET_PATH);
    const b = {
      d1_database_id: target.resources.d1.id,
      r2_bucket_name: target.resources.uploads.name,
      kv_namespace_id: target.resources.kv.id,
      queue_name: target.resources.queue.name,
      worker_name: target.identity.worker_name,
    };
    const bindingPath = join(runtime.IORI_PRIVATE_DIRECTORY, 'config/worker-bindings.json');
    await writeFile(bindingPath, JSON.stringify(b), { flag: 'wx', mode: 0o600 });
    runtime.IORI_WORKER_BINDINGS_PATH = bindingPath;
    runtime.IORI_REQUIRE_TERRAFORM_BINDINGS = 'true';
    await assertReviewedMain(selected.codeSha, { signal });
  }
  await executeHostedOperation(
    selected.operation === 'source' ? 'deploy-source' : 'operation',
    `apps/iori/scripts/${operations[selected.operation]}`,
    runtime,
    signal,
    remainingMs,
  );
};
const emitStatus = async success => {
  const { assertWorkflowOutput } = await import('./assert-workflow-output.mjs');
  const message = success
    ? 'Protected workflow step completed.'
    : 'Protected workflow step failed; retain remote state for reviewed recovery.';
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
