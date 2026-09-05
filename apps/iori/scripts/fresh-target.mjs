const fail = () => {
  throw new Error('Fresh target evidence is invalid.');
};
export const createTargetIdentity = ({ environment, generation, accountId, backendBucket }) => {
  if (
    !['production', 'staging'].includes(environment) || !/^[a-z][a-z0-9]{7,19}$/.test(generation ?? '')
    || !/^[a-f0-9]{32}$/.test(accountId ?? '') || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(backendBucket ?? '')
  ) fail();
  const prefix = `iori-${environment}-${generation}`;
  const names = {
    d1: prefix,
    uploads: `${prefix}-uploads`,
    kv: `${prefix}-fedify`,
    queue: `${prefix}-fedify`,
    dlq: `${prefix}-dlq`,
    transfer: `${prefix}-transfer`,
  };
  if (Object.values(names).includes(backendBucket)) fail();
  return Object.freeze({
    environment,
    generation,
    accountId,
    backendBucket,
    backendKey: `iori/${environment}/${generation}/terraform.tfstate`,
    workerName: prefix,
    names: Object.freeze(names),
  });
};
export const assertFreshTargetState = (identity, state) => {
  if (state?.backendKey !== identity.backendKey || !Array.isArray(state.resources) || state.resources.length !== 0) {
    fail();
  }
};
const expectedResources = (identity) => ({
  'cloudflare_d1_database.iori': { name: identity.names.d1 },
  'cloudflare_r2_bucket.uploads': { name: identity.names.uploads },
  'cloudflare_workers_kv_namespace.fedify': { title: identity.names.kv },
  'cloudflare_queue.fedify': { queue_name: identity.names.queue, settings: { delivery_paused: true } },
  'cloudflare_queue.fedify_dlq': { queue_name: identity.names.dlq, settings: { delivery_paused: true } },
  'cloudflare_r2_bucket.migration': { name: identity.names.transfer },
  'cloudflare_r2_managed_domain.migration': { enabled: false },
});
const contains = (actual, expected) =>
  Object.entries(expected).every(([key, value]) =>
    value !== null && typeof value === 'object' ? contains(actual?.[key], value) : actual?.[key] === value
  );
export const validateFreshTargetPlan = (plan, identity, stage) => {
  if (!['resources', 'consumer'].includes(stage) || !Array.isArray(plan.resource_changes)) {
    return ['Invalid preparation plan'];
  }
  const resources = expectedResources(identity);
  return plan.resource_changes.flatMap(({ address, change }) => {
    if (!change || change.importing || change.generated_config || change.actions?.length !== 1) {
      return ['Invalid preparation change'];
    }
    if (stage === 'consumer' && address === 'cloudflare_queue_consumer.fedify[0]') {
      return change.actions[0] === 'create' && change.before === null && contains(change.after, {
          account_id: identity.accountId,
          script_name: identity.workerName,
          type: 'worker',
          queue_id: plan.output_changes?.target_identity?.before?.queue_id,
          dead_letter_queue: identity.names.dlq,
          settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
        })
          && typeof change.after?.queue_id === 'string'
        ? []
        : ['Invalid consumer creation'];
    }
    const expected = resources[address];
    if (!expected || !contains(change.after, { ...expected, account_id: identity.accountId })) {
      return ['Unexpected preparation resource'];
    }
    if (change.actions[0] === 'no-op') {
      return JSON.stringify(change.before) === JSON.stringify(change.after)
        ? []
        : ['Changed no-op resource'];
    }
    return stage === 'resources' && change.actions[0] === 'create' && change.before === null
      ? []
      : ['Preparation permits fresh creates only'];
  });
};
