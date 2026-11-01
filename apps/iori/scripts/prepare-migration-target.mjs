import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { expectedTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration, transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { createTargetPreparation } from './prepare-target.mjs';
import { assertSmokeQueueToken } from './smoke-diagnostics.mjs';
import { preparationDetailLines, preparationFailureLine, withReason } from './target-preparation-diagnostics.mjs';
import { writePreparationRecord } from './target-preparation-record.mjs';
import { assertVapidBeforePreparation } from './vapid-origin-check.mjs';
const appRoot = fileURLToPath(new URL('../', import.meta.url));
let resourcePreparationStarted = false;
let preparationStage = 'inputs';
let preparationSignal;
const onStage = (stage) => {
  preparationStage = stage;
};
/** Production CLI uses fixed adapters below; injection is only a library testing boundary. */
export const prepareMigrationTarget = async ({ config, preparation, deploy, storage, onStage = () => {} }) => {
  const initial = await preparation.prepareResources();
  onStage('deploy');
  const deployed = await deploy(initial.workerBindings);
  if (deployed.workerName !== config.identity.workerName) {
    throw withReason(new Error('Prepared Worker identity mismatch.'), 'identity-mismatch');
  }
  onStage('deploy-read');
  await preparation.assertQueuePaused();
  onStage('attach');
  const final = await preparation.attachSealedConsumer({
    admissionEnvironment: config.admissionEnvironment,
    zoneId: config.zoneId,
    expectedVersionId: deployed.versionId,
  });
  onStage('readback');
  let expectedTarget;
  try {
    expectedTarget = expectedTargetFromOutputs({ ...config, outputs: final });
  } catch (error) {
    throw withReason(error, 'mismatch');
  }
  if (
    final.resources.consumerId !== expectedTarget.resources.consumer.id || final.worker.versionId !== deployed.versionId
    || final.worker.mode !== 'sealed' || final.worker.previewsEnabled !== false || final.worker.routeCount !== 0
    || final.resources.queuePaused !== true
  ) throw withReason(new Error('Prepared target readback mismatch.'), 'mismatch');
  onStage('record');
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
export const preparationFailureReport = (resourcePreparationStarted) =>
  resourcePreparationStarted
    ? { message: 'Target preparation failed; retain generation and any record for reviewed recovery.', exitCode: 1 }
    : {
      message:
        'Target preparation stopped before creating resources; fix the inputs and rerun with the same generation.',
      exitCode: 78,
    };
const main = async (cliSignal) => {
  preparationSignal = cliSignal;
  let config;
  try {
    config = targetSetupConfiguration(process.env);
  } catch (error) {
    throw withReason(error, 'config-invalid');
  }
  for (
    const key of [
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'SMOKE_QUEUE_TOKEN',
      'VAPID_SUBJECT',
      ...(config.identity.environment === 'staging' ? ['STAGING_ACCESS_TOKEN'] : []),
    ]
  ) {
    if (!process.env[key]) throw withReason(new Error('Preparation credentials are required.'), 'credentials-missing');
  }
  assertSmokeQueueToken(process.env.SMOKE_QUEUE_TOKEN);
  if (config.identity.environment === 'staging' && process.env.STAGING_ACCESS_TOKEN === process.env.SMOKE_QUEUE_TOKEN) {
    throw withReason(new Error('Distinct staging credential is required.'), 'credential-not-distinct');
  }
  onStage('vapid');
  try {
    await assertVapidBeforePreparation({
      environment: config.identity.environment,
      origin: config.admissionEnvironment.ORIGIN,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      publicKey: process.env.VAPID_PUBLIC_KEY,
      signal: cliSignal,
    });
  } catch (error) {
    throw cliSignal.aborted ? error : withReason(error, 'vapid-rejected');
  }
  onStage('setup');
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(30 * 60_000)]);
  const storage = transferStorageFromEnvironment(process.env, config.identity, false, signal);
  const privateDirectory = await mkdtemp(join(tmpdir(), 'iori-target-prepare-'));
  const preparation = createTargetPreparation({ ...config, privateDirectory, signal, onStage });
  const deploy = async (bindings) => {
    const bindingsPath = join(privateDirectory, 'bindings.json');
    const resultPath = join(privateDirectory, 'deployment.json');
    await writeFile(bindingsPath, JSON.stringify(bindings), { flag: 'wx', mode: 0o600 });
    let result;
    try {
      result = await runInfrastructureCommand(process.execPath, ['scripts/deploy-worker.mjs'], {
        signal,
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
    } catch (error) {
      signal.throwIfAborted();
      throw withReason(error, 'command-failed');
    }
    await writeFile(
      join(privateDirectory, 'deployment-diagnostic.txt'),
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
      { flag: 'wx', mode: 0o600 },
    );
    if (result.status !== 0) throw withReason(new Error('Sealed deployment failed.'), 'command-failed');
    try {
      return JSON.parse(await readFile(resultPath, 'utf8'));
    } catch (error) {
      throw withReason(error, 'result-invalid');
    }
  };
  resourcePreparationStarted = true;
  onStage('fresh-check');
  await prepareMigrationTarget({ config, preparation, deploy, storage, onStage });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(main).then(() => console.log('Fresh target preparation completed.')).catch((error) => {
    const { message, exitCode } = preparationFailureReport(resourcePreparationStarted);
    try {
      const lines = [
        ...preparationDetailLines(preparationStage, error),
        preparationFailureLine(preparationStage, error, preparationSignal?.aborted === true),
      ];
      process.stderr.write(`${lines.join('\n')}\n`);
    } catch {}
    console.error(message);
    process.exitCode = exitCode;
  });
}
