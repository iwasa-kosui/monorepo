import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';
import { createStageRunner, readSourceStatus } from './source-recovery.mjs';

const isIdle = (state) =>
  state.http_inflight === 0 && state.dequeue_work === 0 && state.enqueue_work === 0 && !state.queue_failed;
const recoveryValues = ['destination_writes_not_enabled', 'destination_writes_reconciled'];
export const resumeSource = async (options, {
  sourceFactory = createSourceSshAdapter,
  signal: suppliedSignal,
  statusRetryTimeoutMs = 120_000,
  statusRetryIntervalMs = 3000,
} = {}) => {
  const { mainSha, runId, recovery } = options;
  const { current, stage } = createStageRunner();
  const source = await stage('inputs', async () => {
    if (!recoveryValues.includes(recovery)) throw new Error('Invalid source command.');
    return sourceFactory(options);
  });
  const signal = AbortSignal.any([...(suppliedSignal ? [suppliedSignal] : []), AbortSignal.timeout(10 * 60_000)]);
  const status = () => {
    current.program = 'ssh';
    return readSourceStatus(source, signal, { timeoutMs: statusRetryTimeoutMs, intervalMs: statusRetryIntervalMs });
  };
  await stage('resume-precheck', async () => {
    const state = await status();
    if (!state.ingress_frozen || !state.consumer_paused) throw new Error('Source is not frozen.');
    if (state.identity?.main_sha !== mainSha || state.identity?.run_id !== runId) {
      throw new Error('Source identity mismatch.');
    }
    if (!isIdle(state)) throw new Error('Source is not idle.');
  });
  await stage('resume', async () => {
    current.program = 'ssh';
    try {
      await source.resume(recovery, signal);
    } catch (error) {
      const state = await source.status(signal).catch(() => undefined);
      if (state && !isIdle(state)) throw new Error('Source is not idle.');
      throw error;
    }
  });
  await stage('resume-verify', async () => {
    const state = await status();
    if (state.ingress_frozen || state.consumer_paused) throw new Error('Source resume was not confirmed.');
  });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const valid = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main'
    && env.MAIN_SHA === env.GITHUB_SHA && env.IORI_OPERATION === 'resume-source';
  withCliSignal(async (signal) => {
    if (!valid) throw new Error('Invalid source recovery event.');
    return resumeSource({
      host: env.IORI_SOURCE_SSH_HOST,
      user: env.IORI_SOURCE_SSH_USER,
      identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
      knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
      mainSha: env.IORI_MIGRATION_MAIN_SHA,
      runId: env.IORI_MIGRATION_RUN_ID,
      recovery: env.IORI_RECOVERY,
    }, { signal });
  }).then(() => console.log('Source freeze resume completed.')).catch(() => {
    console.error('Source freeze resume failed; retain source state for reviewed recovery.');
    process.exitCode = 1;
  });
}
