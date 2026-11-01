import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { sourceDeploymentSshArguments } from './deploy-source.mjs';
import { runMigrationCommand } from './migration-command.mjs';
import { createPrivateCommandLog } from './private-command-log.mjs';
import { sourceDiagnoseNoticeLine } from './source-diagnose-remote.mjs';
import { createStageRunner } from './source-recovery.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
export const diagnoseSource = async (options, { runCommand = runMigrationCommand, signal: suppliedSignal } = {}) => {
  const { host } = options;
  const { current, stage } = createStageRunner();
  const ssh = await stage('inputs', async () => sourceDeploymentSshArguments(options));
  const signal = AbortSignal.any([...(suppliedSignal ? [suppliedSignal] : []), AbortSignal.timeout(5 * 60_000)]);
  await stage('diagnose-remote', async () => {
    const script = await build({
      stdin: {
        contents: `import {runSourceDiagnosis} from './scripts/source-diagnose-remote.mjs';
          import {withCliSignal} from './scripts/cli-lifetime.mjs';
          if (process.version !== 'v24.12.0') throw new Error('Unsupported source Node.');
          await withCliSignal(signal => runSourceDiagnosis({signal}), {timeoutMs: 3*60*1000});`,
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
    let published = false;
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
        timeout: 4 * 60_000,
        killGraceMs: 15000,
        maxBuffer: 8_000_000,
        signal,
        input,
        captureOutput: async (result) => {
          current.stderr = result.stderr;
          for (const line of result.stderr.split('\n')) {
            if (!published && sourceDiagnoseNoticeLine.test(line)) {
              published = true;
              process.stderr.write(`${line}\n`);
            }
          }
          await log?.capture(result);
        },
      });
    } finally {
      await log?.close();
    }
    if (!published) throw new Error('Source operation failed.');
  });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const valid = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main'
    && env.MAIN_SHA === env.GITHUB_SHA && env.IORI_OPERATION === 'diagnose-source';
  withCliSignal(async (signal) => {
    if (!valid) throw new Error('Invalid source recovery event.');
    return diagnoseSource({
      host: env.IORI_SOURCE_SSH_HOST,
      user: env.IORI_SOURCE_SSH_USER,
      identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
      knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
    }, { signal });
  }).then(() => console.log('Source diagnosis completed.')).catch(() => {
    console.error('Source diagnosis failed.');
    process.exitCode = 1;
  });
}
