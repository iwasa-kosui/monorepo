import { build } from 'esbuild';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { runMigrationCommand } from './migration-command.mjs';
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
  const source = await sourceFactory(options);
  const ssh = sourceDeploymentSshArguments(options);
  const signal = AbortSignal.any([...(suppliedSignal ? [suppliedSignal] : []), AbortSignal.timeout(50 * 60_000)]);
  const execute = (program, args, input) =>
    runCommand(program, args, {
      cwd: appRoot,
      env: process.env,
      timeout: 16 * 60_000,
      killGraceMs: 15000,
      maxBuffer: 8_000_000,
      signal,
      input,
    });
  let manifest;
  const remote = async (phase) => {
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
  };
  await checkMain(mainSha, { signal });
  const dist = await inspectDist(mainSha, signal);
  manifest = dist.manifest;
  await remote('check'); // No currently installed control client is required for prerequisite deployment.
  await remote('checkout');
  await remote('dependencies');
  await remote('dist-check'); // Immediately before the fixed dist mutation after dependency/setup delay.
  await execute('rsync', [
    '--archive',
    '--compress',
    '--delete',
    '--rsh',
    ['ssh', ...ssh].join(' '),
    `${dist.root}/`,
    `${host}:monorepo/apps/iori/dist/`,
  ]);
  await remote('verify-dist');
  await remote('install');
  await remote('restart');
  const state = await source.status(signal);
  if (
    state.source_revision !== mainSha || state.ingress_frozen || state.consumer_paused
    || state.queue_failed || state.identity !== null
  ) throw new Error('Source prerequisite readiness failed.');
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
