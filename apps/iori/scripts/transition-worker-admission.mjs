import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { createDeploymentWorkerConfig } from './temporary-worker-config.mjs';

/** Caller owns signed verification/main/run/authorization checks. This only permits reviewed mode changes with actual before/after readback. */
export const transitionWorkerAdmission = async (
  {
    identity,
    resources,
    token,
    admissionEnvironment,
    zoneId,
    expectedVersionId,
    mode,
    routePresent = false,
    fetchRequest,
    runCommand = runInfrastructureCommand,
    signal = AbortSignal.timeout(15 * 60_000),
  },
) => {
  const from = admissionEnvironment.IORI_ADMISSION_MODE;
  if (!['sealed:smoke', 'smoke:active', 'active:sealed', 'smoke:sealed'].includes(`${from}:${mode}`)) {
    throw new Error('Admission transition is invalid.');
  }
  signal.throwIfAborted();
  const control = createTargetControlPlane({ identity, token, fetchRequest, signal });
  await control.readWorkerAdmission({ resources, admissionEnvironment, zoneId, expectedVersionId, routePresent });
  await control.readQueuePause({ queueId: resources.queueId, paused: true });
  const config = await createDeploymentWorkerConfig({ admissionMode: mode });
  const directory = await mkdtemp(join(tmpdir(), 'iori-admission-'));
  const outputPath = join(directory, 'deployment.ndjson');
  await writeFile(outputPath, '', { mode: 0o600 });
  try {
    const rendered = JSON.parse(await readFile(config.path, 'utf8'));
    if (
      rendered.name !== identity.workerName
      || rendered.vars.IORI_ADMISSION_IDENTITY !== admissionEnvironment.IORI_ADMISSION_IDENTITY
      || rendered.vars.ORIGIN !== admissionEnvironment.ORIGIN || rendered.vars.IORI_ADMISSION_MODE !== mode
      || rendered.d1_databases?.[0]?.database_id !== resources.d1Id
      || rendered.kv_namespaces?.[0]?.id !== resources.kvId
      || rendered.r2_buckets?.[0]?.bucket_name !== identity.names.uploads
      || rendered.queues?.producers?.[0]?.queue !== identity.names.queue
    ) throw new Error('Admission configuration mismatch.');
    signal.throwIfAborted();
    const result = await runCommand('pnpm', ['exec', 'wrangler', 'deploy', '--config', config.path, '--minify'], {
      signal,
      cwd: new URL('..', import.meta.url).pathname,
      shell: false,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WRANGLER_OUTPUT_FILE_PATH: outputPath,
        WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
        WRANGLER_SEND_METRICS: 'false',
      },
    });
    await writeFile(join(directory, 'diagnostic.txt'), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, {
      mode: 0o600,
    });
    signal.throwIfAborted();
    if (result.status !== 0) throw new Error('Admission deployment failed.');
    const records = (await readFile(outputPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const deployed = records.filter((record) =>
      record.type === 'deploy' && record.version === 1 && record.worker_name === identity.workerName
    ).at(-1);
    if (!deployed?.version_id) throw new Error('Admission version evidence unavailable.');
    return await control.readWorkerAdmission({
      resources,
      admissionEnvironment: { ...admissionEnvironment, IORI_ADMISSION_MODE: mode },
      zoneId,
      expectedVersionId: deployed.version_id,
      routePresent,
    });
  } catch {
    throw new Error('Admission transition failed.');
  } finally {
    await config.cleanup();
  }
};
