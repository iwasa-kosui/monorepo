import { build } from 'esbuild';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { runMigrationCommand } from './migration-command.mjs';
import { createPrivateCommandLog } from './private-command-log.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { createSourceBuildManifest } from './source-build-manifest.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
export const sourceDeploymentSshArguments = ({ user, identityFile, knownHostsFile }) => [
  '-F',
  '/dev/null',
  '-T',
  '-a',
  '-o',
  'BatchMode=yes',
  '-o',
  'IdentitiesOnly=yes',
  '-o',
  'IdentityAgent=none',
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  `UserKnownHostsFile=${knownHostsFile}`,
  '-o',
  'GlobalKnownHostsFile=/dev/null',
  '-o',
  'ClearAllForwardings=yes',
  '-o',
  'ConnectTimeout=15',
  '-i',
  identityFile,
  '-l',
  user,
];
const fixedReasons = [
  ['Invalid source inputs.', 'source-inputs-invalid'],
  ['Reviewed main is required.', 'reviewed-main-required'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Source bootstrap is too large.', 'bootstrap-too-large'],
  ['Unsupported source Node.', 'source-node-version'],
  ['Source checkout is invalid.', 'source-checkout-invalid'],
  ['Invalid source pnpm executable.', 'source-pnpm-invalid'],
  ['Source UPLOAD_DIR is not set.', 'upload-dir-unset'],
  ['Source UPLOAD_DIR must be an absolute path', 'upload-dir-not-absolute'],
  ['Source UPLOAD_DIR must be outside dist', 'upload-dir-inside-dist'],
  ['Source UPLOAD_DIR must be an existing directory', 'upload-dir-missing'],
  ['Source diagnostic limit exceeded.', 'diagnostic-limit'],
  ['Source diagnostic transport failed.', 'diagnostic-transport'],
  ['Invalid source deployment operation.', 'invalid-operation'],
  ['Dirty source checkout.', 'source-dirty'],
  ['Source revision mismatch.', 'source-revision-mismatch'],
  ['Unexpected source repository.', 'source-repository-unexpected'],
  ['Source main changed.', 'source-main-changed'],
  ['Unsupported source pnpm.', 'source-pnpm-version'],
  ['Source configuration unavailable.', 'source-config-unavailable'],
  ['Source deployment is blocked.', 'source-deploy-blocked'],
  ['Invalid source build closure.', 'source-build-closure-invalid'],
  ['Invalid source command.', 'source-command-invalid'],
  ['Unsafe source control.', 'source-control-unsafe'],
  ['Source output limit.', 'source-output-limit'],
  ['Source control rejected.', 'source-control-rejected'],
  ['Source operation failed.', 'source-operation-failed'],
  ['Source prerequisite readiness failed.', 'readiness-failed'],
  ['Migration command aborted.', 'aborted'],
];
const sshReasons = [
  [['Permission denied'], 'ssh-auth-denied'],
  [['Host key verification failed'], 'ssh-host-key'],
  [['Load key'], 'ssh-key-format'],
  [['Connection timed out', 'Operation timed out'], 'ssh-timeout'],
  [['Connection refused'], 'ssh-refused'],
  [['Could not resolve hostname'], 'ssh-dns'],
];
const classifyFailure = (program, error, stderr) => {
  const text = `${error?.message ?? ''}\n${stderr}`;
  const fixed = fixedReasons.find(([needle]) => text.includes(needle));
  if (fixed) return fixed[1];
  if (error?.spawnFailed === true) return 'spawn-failed';
  const ssh = sshReasons.find(([needles]) => needles.some(needle => text.includes(needle)));
  if (ssh) return ssh[1];
  if (program === 'ssh' && error?.exitCode === 127 && text.includes('No such file or directory')) {
    return 'remote-node-missing';
  }
  if (stderr.includes('Migration command failed; outcome may be uncertain.')) return 'remote-command-failed';
  if (typeof error?.signal === 'string') return 'command-signaled';
  return 'unclassified';
};
const writeDiagnostic = (stage, program, error, stderr) => {
  try {
    const exit = Number.isInteger(error?.exitCode) && error.exitCode >= 0 && error.exitCode <= 255
      ? String(error.exitCode)
      : 'none';
    const signal = typeof error?.signal === 'string' && /^[A-Z0-9]{1,12}$/.test(error.signal) ? error.signal : 'none';
    process.stderr.write(
      `IORI_DIAG stage=${stage} program=${program} exit=${exit} signal=${signal} reason=${
        classifyFailure(program, error, stderr)
      }\n`,
    );
  } catch {}
};
const checkDist = async (sha, signal) => {
  const root = join(appRoot, 'dist');
  return { root, manifest: await createSourceBuildManifest(root, sha, { signal }) };
};
export const deploySource = async (options, {
  runCommand = runMigrationCommand,
  checkMain = assertReviewedMain,
  sourceFactory = createSourceSshAdapter,
  inspectDist = checkDist,
  signal: suppliedSignal,
} = {}) => {
  const { mainSha, host } = options;
  const current = { program: 'none', stderr: '' };
  const stage = async (name, operation) => {
    current.program = 'none';
    current.stderr = '';
    try {
      return await operation();
    } catch (error) {
      writeDiagnostic(name, current.program, error, current.stderr);
      throw error;
    }
  };
  const { source, ssh } = await stage('inputs', async () => ({
    source: await sourceFactory(options),
    ssh: sourceDeploymentSshArguments(options),
  }));
  const signal = AbortSignal.any([...(suppliedSignal ? [suppliedSignal] : []), AbortSignal.timeout(50 * 60_000)]);
  const execute = async (program, args, input) => {
    current.program = ['ssh', 'rsync'].includes(program) ? program : 'none';
    current.stderr = '';
    const directory = process.env.IORI_PRIVATE_LOG_DIRECTORY;
    const log = directory ? await createPrivateCommandLog(directory) : undefined;
    try {
      return await runCommand(program, args, {
        cwd: appRoot,
        env: process.env,
        timeout: 16 * 60_000,
        killGraceMs: 15000,
        maxBuffer: 8_000_000,
        signal,
        input,
        captureOutput: async (result) => {
          current.stderr = result.stderr;
          await log?.capture(result);
        },
      });
    } finally {
      await log?.close();
    }
  };
  let manifest;
  const remote = (phase) =>
    stage(`remote-${phase}`, async () => {
      await checkMain(mainSha, { signal });
      const script = await build({
        stdin: {
          contents:
            `import {runSourceDeployStep,captureSourceCommandOutput} from './scripts/source-deploy-operations.mjs';
          import {withCliSignal} from './scripts/cli-lifetime.mjs';
          if (process.version !== 'v24.12.0') throw new Error('Unsupported source Node.');
          await withCliSignal(signal => runSourceDeployStep(${JSON.stringify({ phase, sha: mainSha, manifest })},
            {signal,captureOutput:captureSourceCommandOutput}), {timeoutMs: 15*60*1000});`,
          resolveDir: appRoot,
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      });
      const input = script.outputFiles[0].text;
      if (Buffer.byteLength(input) > 1024 * 1024) throw new Error('Source bootstrap is too large.');
      await execute('ssh', [
        ...ssh,
        '--',
        host,
        '"$HOME/.nvm/versions/node/v24.12.0/bin/node"',
        '--input-type=module',
        '-',
      ], input);
    });
  const dist = await stage('manifest', async () => {
    await checkMain(mainSha, { signal });
    return inspectDist(mainSha, signal);
  });
  manifest = dist.manifest;
  await remote('check'); // No currently installed control client is required for prerequisite deployment.
  await remote('checkout');
  await remote('dependencies');
  await remote('dist-check'); // Immediately before the fixed dist mutation after dependency/setup delay.
  await stage('rsync', () =>
    execute('rsync', [
      '--archive',
      '--compress',
      '--delete',
      '--exclude=/uploads',
      '--rsh',
      ['ssh', ...ssh].join(' '),
      `${dist.root}/`,
      `${host}:monorepo/apps/iori/dist/`,
    ]));
  await remote('verify-dist');
  await remote('install');
  await remote('restart');
  await stage('status', async () => {
    current.program = 'ssh';
    const state = await source.status(signal);
    if (
      state.source_revision !== mainSha || state.ingress_frozen || state.consumer_paused
      || state.queue_failed || state.identity !== null
    ) throw new Error('Source prerequisite readiness failed.');
  });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const valid = ['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
    && env.GITHUB_REF === 'refs/heads/main' && env.MAIN_SHA === env.GITHUB_SHA;
  withCliSignal(async (signal) => {
    if (!valid) throw new Error('Invalid source deployment event.');
    return deploySource({
      host: env.IORI_SOURCE_SSH_HOST,
      user: env.IORI_SOURCE_SSH_USER,
      identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
      knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
      mainSha: env.MAIN_SHA,
      runId: `deploy_${env.GITHUB_RUN_ID}`,
    }, { signal });
  }).then(() => console.log('Source prerequisite deployment completed.')).catch(() => {
    console.error('Source deployment failed; retain source state for reviewed recovery.');
    process.exitCode = 1;
  });
}
