import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTargetPreparation } from './prepare-target.mjs';
import { expectedTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration, transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { writePreparationRecord } from './target-preparation-record.mjs';
const appRoot = fileURLToPath(new URL('../', import.meta.url));
/** Production CLI uses fixed adapters below; injection is only a library testing boundary. */
export const prepareMigrationTarget = async ({ config, preparation, deploy, storage }) => {
  const initial = await preparation.prepareResources();
  const deployed = await deploy(initial.workerBindings);
  if (deployed.workerName !== config.identity.workerName) throw new Error('Prepared Worker identity mismatch.');
  const final = await preparation.attachSealedConsumer({
    admissionEnvironment: config.admissionEnvironment,
    zoneId: config.zoneId,
    expectedVersionId: deployed.versionId,
  });
  const expectedTarget = expectedTargetFromOutputs({ ...config, outputs: final });
  if (
    final.resources.consumerId !== expectedTarget.resources.consumer.id || final.worker.versionId !== deployed.versionId
    || final.worker.mode !== 'sealed' || final.worker.previewsEnabled !== false || final.worker.routeCount !== 0
    || final.resources.queuePaused !== true
  ) throw new Error('Prepared target readback mismatch.');
  const { schema: _schema, ...fields } = expectedTarget;
  const record = {
    schema: 'iori-target-preparation/v1',
    ...fields,
    observed: {
      worker_version_id: deployed.versionId,
      admission_mode: 'sealed',
      previews_enabled: false,
      route_present: false,
      queue_delivery_paused: true,
      dlq_delivery_paused: true,
      consumer_id: final.resources.consumerId,
    },
  };
  return writePreparationRecord({ storage, expectedTarget, record });
};
const main = async () => {
  const config = targetSetupConfiguration(process.env);
  for (
    const key of [
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'SMOKE_QUEUE_TOKEN',
      'VAPID_SUBJECT',
      ...(config.identity.environment === 'staging' ? ['STAGING_ACCESS_TOKEN'] : []),
    ]
  ) {
    if (!process.env[key]) throw new Error('Preparation credentials are required.');
  }
  if (config.identity.environment === 'staging' && process.env.STAGING_ACCESS_TOKEN === process.env.SMOKE_QUEUE_TOKEN) {
    throw new Error('Distinct staging credential is required.');
  }
  const storage = transferStorageFromEnvironment(process.env, config.identity);
  const privateDirectory = await mkdtemp(join(tmpdir(), 'iori-target-prepare-'));
  const preparation = createTargetPreparation({ ...config, privateDirectory });
  const deploy = async (bindings) => {
    const bindingsPath = join(privateDirectory, 'bindings.json');
    const resultPath = join(privateDirectory, 'deployment.json');
    await writeFile(bindingsPath, JSON.stringify(bindings), { flag: 'wx', mode: 0o600 });
    const result = spawnSync(process.execPath, ['scripts/deploy-worker.mjs'], {
      cwd: appRoot,
      shell: false,
      encoding: 'utf8',
      maxBuffer: 8_000_000,
      env: {
        ...process.env,
        ...config.admissionEnvironment,
        IORI_WORKER_BINDINGS_PATH: bindingsPath,
        IORI_REQUIRE_TERRAFORM_BINDINGS: 'true',
        IORI_DEPLOYMENT_RESULT_PATH: resultPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await writeFile(
      join(privateDirectory, 'deployment-diagnostic.txt'),
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
      { flag: 'wx', mode: 0o600 },
    );
    if (result.status !== 0) throw new Error('Sealed deployment failed.');
    return JSON.parse(await readFile(resultPath, 'utf8'));
  };
  await prepareMigrationTarget({ config, preparation, deploy, storage });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => console.log('Fresh target preparation completed.')).catch(() => {
    console.error('Target preparation failed; retain generation and any record for reviewed recovery.');
    process.exitCode = 1;
  });
}
