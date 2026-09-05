import { createTargetIdentity } from './fresh-target.mjs';
import { parseAdmission } from '../src/workerAdmission.ts';
import { createMigrationR2Storage } from './migration-r2-storage.mjs';
import { migrationRunIdPattern } from './migration-target-contract.mjs';
export const targetSetupConfiguration = (env) => {
  const required = (key) => {
    const value = env[key];
    if (typeof value !== 'string' || !value) throw new Error('Target setup configuration is required.');
    return value;
  };
  const identity = createTargetIdentity({
    environment: required('IORI_ENVIRONMENT'),
    generation: required('IORI_GENERATION'),
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    backendBucket: required('IORI_TERRAFORM_BACKEND_BUCKET'),
  });
  const mainSha = required('MAIN_SHA');
  const runId = required('IORI_MIGRATION_RUN_ID');
  const zoneId = required('CLOUDFLARE_ZONE_ID');
  const admissionEnvironment = {
    IORI_ADMISSION_MODE: 'sealed',
    IORI_ADMISSION_IDENTITY: required('IORI_ADMISSION_IDENTITY'),
    ORIGIN: required('ORIGIN'),
  };
  const a = parseAdmission(admissionEnvironment);
  if (
    !/^[a-f0-9]{40}$/.test(mainSha) || !migrationRunIdPattern.test(runId) || !/^[a-f0-9]{32}$/.test(zoneId)
    || !a || a.environment !== identity.environment || a.generation !== identity.generation || a.mainSha !== mainSha
    || a.runId !== runId
  ) throw new Error('Target setup invocation is invalid.');
  const { mode: _mode, ...admission } = a;
  admissionEnvironment.IORI_ADMISSION_IDENTITY = JSON.stringify(admission);
  return {
    identity,
    mainSha,
    runId,
    zoneId,
    admission,
    admissionEnvironment,
    backendEndpoint: `https://${identity.accountId}.r2.cloudflarestorage.com`,
    hostname: a.hostname,
    token: required('CLOUDFLARE_API_TOKEN'),
  };
};
export const transferStorageFromEnvironment = (env, identity, readOnly = false) =>
  createMigrationR2Storage({
    accountId: identity.accountId,
    bucket: identity.names.transfer,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    accessKeyId: env.IORI_MIGRATION_R2_ACCESS_KEY_ID,
    secretAccessKey: env.IORI_MIGRATION_R2_SECRET_ACCESS_KEY,
    readOnly,
  });
