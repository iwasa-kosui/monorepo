const fail = () => {
  throw new Error('Fresh target evidence is invalid.');
};
export const createTargetIdentity = ({ environment, generation, accountId }) => {
  if (
    !['production', 'staging'].includes(environment) || !/^[a-z][a-z0-9]{7,19}$/.test(generation ?? '')
    || !/^[a-f0-9]{32}$/.test(accountId ?? '')
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
  return Object.freeze({
    environment,
    generation,
    accountId,
    backendKey: `iori/${environment}/${generation}/terraform.tfstate`,
    workerName: prefix,
    names: Object.freeze(names),
  });
};
