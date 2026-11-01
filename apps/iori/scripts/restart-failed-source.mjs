import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { sourceDeploymentSshArguments } from './deploy-source.mjs';
import { runMigrationCommand } from './migration-command.mjs';
import { createPrivateCommandLog } from './private-command-log.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';
import { createStageRunner, readSourceStatus } from './source-recovery.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const remoteNotices = [
  /^IORI_NOTICE stage=restart-failed-source recorded=1$/,
  /^IORI_NOTICE stage=restart-failed-source stopped=1$/,
  /^IORI_NOTICE stage=restart-failed-source started=1$/,
];
const flag = value => value ? 1 : 0;
export const restartFailedSource = async (options, {
  runCommand = runMigrationCommand,
  sourceFactory = createSourceSshAdapter,
  signal: suppliedSignal,
  statusRetryTimeoutMs = 120_000,
  statusRetryIntervalMs = 3000,
} = {}) => {
  const { mainSha, runId, restartRunId, host } = options;
  const { current, stage } = createStageRunner();
  const { source, ssh } = await stage('inputs', async () => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(restartRunId ?? '')) throw new Error('Invalid source restart operation.');
    return { source: await sourceFactory(options), ssh: sourceDeploymentSshArguments(options) };
  });
  const signal = AbortSignal.any([...(suppliedSignal ? [suppliedSignal] : []), AbortSignal.timeout(20 * 60_000)]);
  const status = () => {
    current.program = 'ssh';
    return readSourceStatus(source, signal, { timeoutMs: statusRetryTimeoutMs, intervalMs: statusRetryIntervalMs });
  };
  await stage('restart-precheck', async () => {
    const state = await status();
    process.stderr.write(
      `IORI_NOTICE stage=restart-precheck ingress_frozen=${flag(state.ingress_frozen)} consumer_paused=${
        flag(state.consumer_paused)
      } queue_failed=${flag(state.queue_failed)} drained=${flag(state.drained)}\n`,
    );
    if (!state.queue_failed) throw new Error('Source queue has not failed.');
  });
  await stage('restart-remote', async () => {
    const script = await build({
      stdin: {
        contents: `import {runFailedSourceRestart} from './scripts/source-failed-restart.mjs';
          import {captureSourceCommandOutput} from './scripts/source-deploy-operations.mjs';
          import {withCliSignal} from './scripts/cli-lifetime.mjs';
          if (process.version !== 'v24.12.0') throw new Error('Unsupported source Node.');
          await withCliSignal(signal => runFailedSourceRestart(${JSON.stringify({ sha: mainSha, runId, restartRunId })},
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
    current.program = 'ssh';
    const directory = process.env.IORI_PRIVATE_LOG_DIRECTORY;
    const log = directory ? await createPrivateCommandLog(directory) : undefined;
    try {
      await runCommand('ssh', [
        ...ssh,
        '--',
        host,
        '"$HOME/.nvm/versions/node/v24.12.0/bin/node"',
        '--input-type=module',
        '-',
      ], {
        cwd: appRoot,
        env: process.env,
        timeout: 16 * 60_000,
        killGraceMs: 15000,
        maxBuffer: 8_000_000,
        signal,
        input,
        captureOutput: async (result) => {
          current.stderr = result.stderr;
          for (const line of result.stderr.split('\n')) {
            if (remoteNotices.some(notice => notice.test(line))) process.stderr.write(`${line}\n`);
          }
          await log?.capture(result);
        },
      });
    } finally {
      await log?.close();
    }
  });
  await stage('restart-verify', async () => {
    const state = await status();
    if (!state.ingress_frozen || !state.consumer_paused || state.queue_failed) {
      throw new Error('Source restart was not confirmed.');
    }
  });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const valid = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main'
    && env.MAIN_SHA === env.GITHUB_SHA && env.IORI_OPERATION === 'restart-failed-source';
  withCliSignal(async (signal) => {
    if (!valid) throw new Error('Invalid source recovery event.');
    return restartFailedSource({
      host: env.IORI_SOURCE_SSH_HOST,
      user: env.IORI_SOURCE_SSH_USER,
      identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
      knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
      mainSha: env.IORI_MIGRATION_MAIN_SHA,
      runId: env.IORI_MIGRATION_RUN_ID,
      restartRunId: env.GITHUB_RUN_ID,
    }, { signal });
  }).then(() => console.log('Source failed queue restart completed; dispatch resume-source after review.')).catch(
    () => {
      console.error('Source failed queue restart failed; retain source state for reviewed recovery.');
      process.exitCode = 1;
    },
  );
}
