import { build } from 'esbuild';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMigrationCommand } from './migration-command.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
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
const checkDist = async () => {
  const root = join(appRoot, 'dist');
  if (await realpath(root) !== root) throw new Error('Invalid source build.');
  let bytes = 0;
  let count = 0;
  const visit = async (path) => {
    for (const item of await readdir(path, { withFileTypes: true })) {
      if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) throw new Error('Invalid source build.');
      const child = join(path, item.name);
      if (item.isDirectory()) await visit(child);
      else {
        const stat = await lstat(child);
        if (!stat.isFile()) throw new Error('Invalid source build.');
        bytes += stat.size;
        if (++count > 10000 || bytes > 512 * 1024 ** 2) throw new Error('Source build is too large.');
      }
    }
  };
  await visit(root);
  if (!(await lstat(join(root, 'index.js'))).isFile()) throw new Error('Missing source entrypoint.');
  return root;
};
export const deploySource = async (options, {
  runCommand = runMigrationCommand,
  checkMain = assertReviewedMain,
  sourceFactory = createSourceSshAdapter,
  inspectDist = checkDist,
} = {}) => {
  const { mainSha, host } = options;
  const source = await sourceFactory(options);
  const ssh = sourceDeploymentSshArguments(options);
  const signal = AbortSignal.timeout(50 * 60_000);
  const execute = (program, args, input) =>
    runCommand(program, args, {
      cwd: appRoot,
      env: process.env,
      timeout: 16 * 60_000,
      maxBuffer: 8_000_000,
      signal,
      input,
    });
  const remote = async (phase) => {
    await checkMain(mainSha, { signal });
    const script = await build({
      stdin: {
        contents: `import {runSourceDeployStep} from './scripts/source-deploy-operations.mjs';
          if (process.version !== 'v24.12.0') throw new Error('Unsupported source Node.');
          const cancel = new AbortController(); const stop = () => cancel.abort();
          process.on('SIGTERM', stop); process.on('SIGHUP', stop);
          try { await runSourceDeployStep(${JSON.stringify({ phase, sha: mainSha })},
            {signal: AbortSignal.any([cancel.signal, AbortSignal.timeout(15*60*1000)])}); }
          finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGHUP', stop); }`,
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
  const dist = await inspectDist();
  await remote('check'); // No currently installed control client is required for prerequisite deployment.
  await remote('checkout');
  await remote('dependencies');
  await remote('check'); // Immediately before the fixed dist mutation after dependency/setup delay.
  await execute('rsync', [
    '--archive',
    '--compress',
    '--delete',
    '--rsh',
    ['ssh', ...ssh].join(' '),
    `${dist}/`,
    `${host}:monorepo/apps/iori/dist/`,
  ]);
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
  Promise.resolve().then(() => {
    if (!valid) throw new Error('Invalid source deployment event.');
    return deploySource({
      host: env.IORI_SOURCE_SSH_HOST,
      user: env.IORI_SOURCE_SSH_USER,
      identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
      knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
      mainSha: env.MAIN_SHA,
      runId: `deploy_${env.GITHUB_RUN_ID}`,
    });
  }).then(() => console.log('Source prerequisite deployment completed.')).catch(() => {
    console.error('Source deployment failed; retain source state for reviewed recovery.');
    process.exitCode = 1;
  });
}
