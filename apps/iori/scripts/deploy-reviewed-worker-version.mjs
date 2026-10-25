import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { readPrivateBounded } from './migration-file-stream.mjs';
import { createDeploymentWorkerConfig } from './temporary-worker-config.mjs';
export const deployReviewedWorkerVersion = async (
  { identity, resources, admissionEnvironment, mode, signal, runCommand = runInfrastructureCommand },
) => {
  if (!['sealed', 'smoke', 'active'].includes(mode)) throw new Error('Invalid Worker mode.');
  signal.throwIfAborted();
  const config = await createDeploymentWorkerConfig({ admissionMode: mode, admissionEnvironment });
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'iori-admission-'));
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
    const records = (await readPrivateBounded(outputPath, 2 * 1024 * 1024, signal)).toString('utf8').trim().split('\n')
      .map((line) => JSON.parse(line));
    const deployed = records.filter((record) =>
      record.type === 'deploy' && record.version === 1 && record.worker_name === identity.workerName
    ).at(-1);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(deployed?.version_id ?? '')) {
      throw new Error('Admission version evidence unavailable.');
    }
    return deployed.version_id;
  } catch {
    throw new Error('Reviewed Worker deployment failed; retain current state.');
  } finally {
    await config.cleanup();
  }
};
