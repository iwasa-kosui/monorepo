import { statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { hasRehearsalSample, migrationBudget, REHEARSAL_D1_CAPACITY_BYTES } from './migration-budget.mjs';
import { assertExternalMigrationRoot } from './migration-path-safety.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';
import { validateSourceEstimate } from './source-transfer-protocol.mjs';

const freeBytes = async (root) => {
  const stat = await statfs(root, { bigint: true });
  return stat.bavail * stat.bsize;
};
const capacityIsSufficient = (estimate, availableBytes) => {
  if (!estimate.source_sufficient) return false;
  try {
    migrationBudget({ estimate, d1CapacityBytes: REHEARSAL_D1_CAPACITY_BYTES, availableBytes });
    return true;
  } catch {
    return false;
  }
};
export const estimateSource = async ({ source, availableBytes, signal }) => {
  const { source_revision: _revision, ...rest } = await source.estimate(signal);
  const estimate = validateSourceEstimate(rest);
  const sample = hasRehearsalSample(estimate) ? 'ok' : 'insufficient';
  const capacity = capacityIsSufficient(estimate, availableBytes) ? 'ok' : 'insufficient';
  return `IORI_ESTIMATE rows=${estimate.rows} upload_count=${estimate.upload_count} article_count=${estimate.article_count} sample=${sample} capacity=${capacity}`;
};

export const estimateFromEnvironment = async (
  env,
  signal,
  { createSource = createSourceSshAdapter, availableBytes = freeBytes } = {},
) => {
  const required = (key) => {
    if (!env[key]) throw new Error('Estimate configuration is required.');
    return env[key];
  };
  const root = required('IORI_MIGRATION_ROOT');
  await assertExternalMigrationRoot(root);
  const source = await createSource({
    host: required('IORI_SOURCE_SSH_HOST'),
    user: required('IORI_SOURCE_SSH_USER'),
    identityFile: required('IORI_SOURCE_SSH_IDENTITY_FILE'),
    knownHostsFile: required('IORI_SOURCE_SSH_KNOWN_HOSTS_FILE'),
    mainSha: required('MAIN_SHA'),
    runId: `estimate_${required('GITHUB_RUN_ID')}`,
  });
  return estimateSource({ source, availableBytes: await availableBytes(root), signal });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal((signal) => estimateFromEnvironment(process.env, signal)).then((line) => {
    process.stderr.write(`${line}\n`);
  }).catch(() => {
    console.error('Source estimate failed.');
    process.exitCode = 1;
  });
}
