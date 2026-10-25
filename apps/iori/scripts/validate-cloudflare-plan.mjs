import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const terraformOwnedResourceTypes = new Set([
  'cloudflare_d1_database',
  'cloudflare_r2_bucket',
  'cloudflare_r2_managed_domain',
  'cloudflare_workers_kv_namespace',
  'cloudflare_queue',
  'cloudflare_queue_consumer',
  'cloudflare_worker_route',
  'cloudflare_workers_route',
]);

const workerRuntimeResource = (resourceType) =>
  resourceType === 'cloudflare_worker'
  || resourceType === 'cloudflare_worker_version'
  || resourceType === 'cloudflare_workers_deployment'
  || (resourceType.includes('worker') && (resourceType.includes('binding') || resourceType.includes('secret')));

const resourceTypeFromAddress = (address) => address.split('.')[0];
const routeResource = (resourceType) =>
  resourceType === 'cloudflare_worker_route' || resourceType === 'cloudflare_workers_route';
const deadLetterQueue = (address) => address === 'cloudflare_queue.fedify_dlq';
const queueConsumer = (resourceType) => resourceType === 'cloudflare_queue_consumer';
const durableProductionResource = (resourceType) =>
  resourceType === 'cloudflare_d1_database'
  || resourceType === 'cloudflare_r2_bucket'
  || resourceType === 'cloudflare_workers_kv_namespace'
  || resourceType === 'cloudflare_queue'
  || routeResource(resourceType);

const allowsChange = ({ operation, address, resourceType, actions }) => {
  if (operation === 'route-cutover') return routeResource(resourceType);
  if (operation === 'consumer-replacement') return queueConsumer(resourceType) || deadLetterQueue(address);
  if (operation === 'reconcile') {
    return !routeResource(resourceType)
      && !queueConsumer(resourceType)
      && !(deadLetterQueue(address) && (actions.includes('delete')));
  }
  return false;
};

const workerBindingOutputChanged = (plan) => {
  const change = plan.output_changes?.worker_bindings;
  const plannedBindings = plan.planned_values?.outputs?.worker_bindings?.value;
  return change !== undefined && (
    change.actions?.length !== 1
    || change.actions[0] !== 'no-op'
    || ('before' in change && JSON.stringify(change.before) !== JSON.stringify(change.after))
    || (plannedBindings !== undefined && JSON.stringify(plannedBindings) !== JSON.stringify(change.after))
  );
};

const workerBindingOutputIsExplicitNoop = (plan) => {
  const change = plan.output_changes?.worker_bindings;
  const plannedBindings = plan.planned_values?.outputs?.worker_bindings?.value;
  return change?.actions?.length === 1
    && change.actions[0] === 'no-op'
    && ('before' in change ? JSON.stringify(change.before) === JSON.stringify(change.after) : true)
    && plannedBindings !== undefined
    && JSON.stringify(plannedBindings) === JSON.stringify(change.after);
};

/**
 * Rejects resource changes outside Terraform's Cloudflare ownership boundary.
 *
 * @typedef {{ address: string, change: { actions: readonly string[] } }} ResourceChange
 * @param {{ resource_changes?: readonly ResourceChange[], operation: 'reconcile' | 'consumer-replacement' | 'route-cutover', allowProductionRoute?: boolean }} plan
 * @returns {readonly string[]}
 */
export const validateCloudflarePlan = (plan) => {
  if (['queue-pause', 'queue-resume'].includes(plan.operation)) return validateQueuePausePlan(plan);
  if (plan.requireWorkerBindingsNoop && !workerBindingOutputIsExplicitNoop(plan)) {
    return workerBindingOutputChanged(plan)
      ? ['worker_bindings output must not change']
      : ['worker_bindings output must be an explicit no-op'];
  }
  if (workerBindingOutputChanged(plan)) return ['worker_bindings output must not change'];
  return (plan.resource_changes ?? []).flatMap((change) => {
    const { address } = change;
    const actions = change.change.actions;

    if (address === 'cloudflare_r2_managed_domain.migration') {
      if (
        change.change.after?.enabled !== false || change.change.after_unknown?.enabled === true
        || actions.includes('delete')
      ) {
        return [`${address} must keep public access disabled`];
      }
    } else if (resourceTypeFromAddress(address) === 'cloudflare_r2_managed_domain') {
      return [`${address} is not Terraform-owned`];
    }
    if (actions.length === 1 && actions[0] === 'no-op') return [];

    const resourceType = resourceTypeFromAddress(address);
    const isReplacement = actions.includes('delete') && actions.includes('create');

    if (durableProductionResource(resourceType)) {
      if (isReplacement) {
        return [`${address} must not be replaced`];
      }
      if (actions.includes('delete')) {
        return [`${address} must not be deleted`];
      }
    }

    if (workerRuntimeResource(resourceType) || !terraformOwnedResourceTypes.has(resourceType)) {
      return [`${address} is not Terraform-owned`];
    }

    if (!allowsChange({ operation: plan.operation, address, resourceType, actions })) {
      return [`${address} is not allowed for ${plan.operation}`];
    }

    if (plan.operation === 'route-cutover' && !plan.allowProductionRoute) {
      return [`${address} requires the cutover plan`];
    }

    return [];
  });
};

export const validateQueuePausePlan = (plan) => {
  if (!workerBindingOutputIsExplicitNoop(plan)) return ['worker_bindings output must be an explicit no-op'];
  const desired = plan.operation === 'queue-pause';
  const changes = plan.resource_changes;
  if (!Array.isArray(changes)) return ['Queue state is required'];
  const queue = changes.find((item) => item.address === 'cloudflare_queue.fedify');
  if (!queue || queue.change.after?.settings?.delivery_paused !== desired) return ['Queue pause state is required'];
  return changes.flatMap(({ address, change }) => {
    if (change.importing || change.actions?.length !== 1) return ['Invalid Queue operation'];
    if (change.actions[0] === 'no-op' && JSON.stringify(change.before) === JSON.stringify(change.after)) return [];
    if (address !== 'cloudflare_queue.fedify' || change.actions[0] !== 'update') return ['Unrelated Queue operation'];
    const before = structuredClone(change.before);
    const after = structuredClone(change.after);
    if (
      typeof before?.settings?.delivery_paused !== 'boolean' || typeof after?.settings?.delivery_paused !== 'boolean'
    ) return ['Missing Queue pause state'];
    delete before.settings.delivery_paused;
    delete after.settings.delivery_paused;
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : ['Queue operation must preserve all unrelated settings'];
  });
};

const formatActionSummary = ({ address, change }) => `${address}: ${change.actions.join(',')}`;

const parseArguments = (args) => {
  const allowProductionRoute = args.includes('--allow-production-route');
  const requireWorkerBindingsNoop = args.includes('--require-worker-bindings-no-op');
  const operationIndex = args.indexOf('--operation');
  const operation = operationIndex === -1 ? undefined : args[operationIndex + 1];
  const planPath = args.find((argument, index) =>
    argument !== '--allow-production-route' && argument !== '--require-worker-bindings-no-op'
    && index !== operationIndex && index !== operationIndex + 1
  );
  if (
    !['reconcile', 'consumer-replacement', 'route-cutover', 'queue-pause', 'queue-resume'].includes(operation)
    || planPath === undefined
    || args.length !== 3 + Number(allowProductionRoute) + Number(requireWorkerBindingsNoop)
    || operationIndex === -1
  ) {
    throw new Error(
      'Usage: validate-cloudflare-plan.mjs --operation <reconcile|consumer-replacement|route-cutover> <plan.json> [--allow-production-route] [--require-worker-bindings-no-op]',
    );
  }
  return { allowProductionRoute, requireWorkerBindingsNoop, operation, planPath };
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { allowProductionRoute, requireWorkerBindingsNoop, operation, planPath } = parseArguments(
    process.argv.slice(2),
  );
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  for (const change of plan.resource_changes ?? []) {
    console.log(formatActionSummary(change));
  }
  if (validateCloudflarePlan({ ...plan, operation, allowProductionRoute, requireWorkerBindingsNoop }).length > 0) {
    process.exitCode = 1;
  }
}
