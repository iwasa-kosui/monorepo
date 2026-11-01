import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertFreshTargetState, createTargetIdentity, inspectFreshTargetPlan } from './fresh-target.mjs';
import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { inspectRouteCutoverPlan } from './route-cutover-plan.mjs';
import { planRejectionDetails, withReason } from './target-preparation-diagnostics.mjs';
import { inspectCloudflarePlan } from './validate-cloudflare-plan.mjs';

const infra = fileURLToPath(new URL('../infra/cloudflare/', import.meta.url));
const fail = (reason, details) => {
  throw Object.assign(new Error('Target Terraform operation failed.'), {
    diagnostic: { reason, ...(details ? { details } : {}) },
  });
};
const parsePrivateJson = (source) => {
  try {
    return JSON.parse(source);
  } catch {
    fail('output-invalid');
  }
};
/** Fixed repository Terraform commands; no module/command injection. Protected target preparation precedes executor reservation. */
export const createTargetTerraform = (
  {
    identity: supplied,
    backendEndpoint,
    privateDirectory,
    zoneId,
    hostname,
    runCommand = runInfrastructureCommand,
    signal = AbortSignal.timeout(30 * 60_000),
    onStage = () => {},
  },
) => {
  const identity = createTargetIdentity(supplied);
  if (
    !/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(backendEndpoint ?? '')
    || !/^[a-f0-9]{32}$/.test(zoneId ?? '') || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(hostname ?? '')
    || !privateDirectory || resolve(privateDirectory) !== privateDirectory
  ) fail('config-invalid');
  const run = async (args) => {
    signal.throwIfAborted();
    await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
    await chmod(privateDirectory, 0o700);
    let result;
    try {
      result = await runCommand('terraform', [`-chdir=${infra}`, ...args], {
        signal,
        shell: false,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 8_000_000,
        env: {
          ...process.env,
          TF_DATA_DIR: join(privateDirectory, 'terraform-data'),
          TF_INPUT: '0',
          TF_VAR_cloudflare_account_id: identity.accountId,
          TF_VAR_environment: identity.environment,
          TF_VAR_generation: identity.generation,
          TF_VAR_zone_id: zoneId,
          TF_VAR_public_hostname: hostname,
        },
      });
    } catch (error) {
      signal.throwIfAborted();
      throw withReason(error, 'command-failed');
    }
    await writeFile(
      join(privateDirectory, 'terraform-diagnostic.txt'),
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
      { mode: 0o600 },
    );
    await chmod(join(privateDirectory, 'terraform-diagnostic.txt'), 0o600);
    signal.throwIfAborted();
    if (result.status !== 0) fail('command-failed');
    return result.stdout;
  };
  let initialized = false;
  const initializeBackend = async () => {
    onStage('tf-init');
    await run([
      'init',
      '-input=false',
      '-lockfile=readonly',
      '-reconfigure',
      `-backend-config=bucket=${identity.backendBucket}`,
      `-backend-config=key=${identity.backendKey}`,
      `-backend-config=endpoints={s3="${backendEndpoint}"}`,
      '-backend-config=region=auto',
    ]);
  };
  const initializeFresh = async () => {
    await initializeBackend();
    onStage('tf-show');
    // show -json returns an empty object for a fresh backend. Nonempty state is never adopted/imported.
    const state = parsePrivateJson(await run(['show', '-json']));
    const resources = state.values?.root_module?.resources ?? [];
    if (state.values !== undefined) fail('state-present');
    try {
      assertFreshTargetState(identity, { backendKey: identity.backendKey, resources });
    } catch (error) {
      throw withReason(error, 'state-present');
    }
    initialized = true;
    return { backendKey: identity.backendKey, resourceCount: 0 };
  };
  const prepare = async (stage, { establishedBindings } = {}) => {
    const stagePrefix = stage === 'consumer' ? 'attach-' : '';
    onStage(`${stagePrefix}tf-plan`);
    if (!['resources', 'consumer'].includes(stage) || (stage === 'resources' && !initialized)) fail('plan-rejected');
    if (stage === 'consumer' && !establishedBindings) fail('plan-rejected');
    const path = join(privateDirectory, 'target.tfplan');
    await run([
      'plan',
      '-input=false',
      '-lock=true',
      `-out=${path}`,
      `-var=attach_queue_consumer=${stage === 'consumer'}`,
      '-var=queue_delivery_paused=true',
      '-var=enable_production_worker_route=false',
      '-var=enable_staging_worker_route=false',
    ]);
    const plan = parsePrivateJson(await run(['show', '-json', path]));
    const freshIssues = inspectFreshTargetPlan(plan, identity, stage);
    if (freshIssues.length) fail('plan-rejected', planRejectionDetails(freshIssues));
    if (stage === 'consumer') {
      const bindingsChanged =
        JSON.stringify(plan.output_changes?.worker_bindings?.before) !== JSON.stringify(establishedBindings);
      const cloudflareIssues = inspectCloudflarePlan({
        ...plan,
        operation: 'consumer-replacement',
        requireWorkerBindingsNoop: true,
      });
      if (bindingsChanged || cloudflareIssues.length) {
        fail('plan-rejected', [
          ...(bindingsChanged ? ['plan-bindings-changed'] : []),
          ...planRejectionDetails(cloudflareIssues),
        ]);
      }
    }
    onStage(`${stagePrefix}tf-apply`);
    await run(['apply', '-input=false', path]);
    const outputs = parsePrivateJson(await run(['output', '-json']));
    const target = outputs.target_identity?.value;
    const bindings = outputs.worker_bindings?.value;
    const storage = outputs.migration_storage?.value;
    if (
      !target || target.account_id !== identity.accountId || target.environment !== identity.environment
      || target.generation !== identity.generation || target.backend_key !== identity.backendKey
      || target.worker_name !== identity.workerName || !bindings || bindings.worker_name !== identity.workerName
      || bindings.queue_name !== identity.names.queue || bindings.r2_bucket_name !== identity.names.uploads
      || !bindings.d1_database_id || !bindings.kv_namespace_id || !target.queue_id || !target.dlq_id
      || target.queue_settings?.delivery_paused !== true
      || storage?.bucket_name !== identity.names.transfer || storage.environment !== identity.environment
    ) fail('output-mismatch');
    return { workerBindings: bindings, targetIdentity: target, migrationStorage: storage };
  };
  const initializeExisting = async (paused) => {
    await initializeBackend();
    const state = parsePrivateJson(await run(['show', '-json']));
    if (!state.values?.root_module?.resources?.length) fail('output-mismatch');
    const outputs = parsePrivateJson(await run(['output', '-json']));
    const result = {
      workerBindings: outputs.worker_bindings?.value,
      targetIdentity: outputs.target_identity?.value,
      migrationStorage: outputs.migration_storage?.value,
    };
    const t = result.targetIdentity;
    if (
      !result.workerBindings || !result.migrationStorage || t?.account_id !== identity.accountId
      || t.environment !== identity.environment || t.generation !== identity.generation
      || t.backend_key !== identity.backendKey || t.worker_name !== identity.workerName
      || t.d1_database_name !== identity.names.d1 || result.workerBindings.worker_name !== identity.workerName
      || result.workerBindings.queue_name !== identity.names.queue
      || result.workerBindings.r2_bucket_name !== identity.names.uploads
      || !result.workerBindings.d1_database_id || !result.workerBindings.kv_namespace_id
      || result.migrationStorage.bucket_name !== identity.names.transfer
      || result.migrationStorage.environment !== identity.environment
      || !t.queue_id || !t.dlq_id || t.queue_id === t.dlq_id || t.queue_settings?.delivery_paused !== paused
      || t.dlq_settings?.delivery_paused !== true || !Array.isArray(t.consumer) || t.consumer.length !== 1
      || !t.consumer[0].consumer_id || t.consumer[0].queue_id !== t.queue_id
      || t.consumer[0].script_name !== identity.workerName || t.consumer[0].dead_letter_queue !== identity.names.dlq
    ) fail('output-mismatch');
    return result;
  };
  const changeQueuePause = async ({ paused, establishedBindings, routeEnabled }) => {
    onStage('queue-plan');
    if (typeof paused !== 'boolean' || typeof routeEnabled !== 'boolean' || !establishedBindings) fail('plan-rejected');
    const path = join(privateDirectory, 'queue-control.tfplan');
    await run([
      'plan',
      '-input=false',
      '-lock=true',
      `-out=${path}`,
      '-var=attach_queue_consumer=true',
      `-var=queue_delivery_paused=${paused}`,
      `-var=enable_production_worker_route=${routeEnabled && identity.environment === 'production'}`,
      `-var=enable_staging_worker_route=${routeEnabled && identity.environment === 'staging'}`,
    ]);
    const plan = parsePrivateJson(await run(['show', '-json', path]));
    const bindingsChanged =
      JSON.stringify(plan.output_changes?.worker_bindings?.before) !== JSON.stringify(establishedBindings);
    const issues = inspectCloudflarePlan({
      ...plan,
      operation: paused ? 'queue-pause' : 'queue-resume',
      requireWorkerBindingsNoop: true,
    });
    if (bindingsChanged || issues.length) {
      fail('plan-rejected', [...(bindingsChanged ? ['plan-bindings-changed'] : []), ...planRejectionDetails(issues)]);
    }
    onStage('queue-apply');
    await run(['apply', '-input=false', path]);
    return { applied: true }; // Actual Queue API readback is required before an execution receipt.
  };
  const initializeEstablished = () => initializeExisting(true);
  const initializeActive = () => initializeExisting(false);
  const changeRoute = async ({ establishedBindings }) => {
    onStage('route-plan');
    if (!establishedBindings) fail('plan-rejected');
    const path = join(privateDirectory, 'route-control.tfplan');
    await run([
      'plan',
      '-input=false',
      '-lock=true',
      `-out=${path}`,
      '-var=attach_queue_consumer=true',
      '-var=queue_delivery_paused=true',
      `-var=enable_production_worker_route=${identity.environment === 'production'}`,
      `-var=enable_staging_worker_route=${identity.environment === 'staging'}`,
    ]);
    const plan = parsePrivateJson(await run(['show', '-json', path]));
    const bindingsChanged =
      JSON.stringify(plan.output_changes?.worker_bindings?.before) !== JSON.stringify(establishedBindings);
    const issues = inspectRouteCutoverPlan(plan, { hostname, workerName: identity.workerName, zoneId });
    if (bindingsChanged || issues.length) {
      fail('plan-rejected', [...(bindingsChanged ? ['plan-bindings-changed'] : []), ...planRejectionDetails(issues)]);
    }
    onStage('route-apply');
    await run(['apply', '-input=false', path]);
    return { applied: true };
  };
  return Object.freeze({
    initializeFresh,
    initializeEstablished,
    initializeActive,
    prepare,
    changeQueuePause,
    changeRoute,
  });
};
