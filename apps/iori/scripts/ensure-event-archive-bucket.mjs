import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { listDatabases, matchesOf, request } from './delete-rehearsal-d1.mjs';
import { createTargetIdentity } from './fresh-target.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

const FORBIDDEN_WORD = 'event-archive-bucket-forbidden';
const defaultNotice = (line) => process.stderr.write(`${line}\n`);
const fail = (stage, reason, message) => Object.assign(withReason(new Error(message), reason), { stage });
const reasonOf = (error) => error?.diagnostic?.reason;
const at = async (stage, operation) => {
  try {
    return await operation();
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.stage === undefined) error.stage = stage;
    throw error;
  }
};

export const ensureEventArchiveBucket = async ({ env, signal, fetchRequest = fetch, notice = defaultNotice }) => {
  const environment = env.IORI_ENVIRONMENT;
  if (!['production', 'staging'].includes(environment)) {
    throw fail('archive-bucket', 'config-invalid', 'Event archive bucket requires production or staging.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('archive-bucket', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || !/^[a-z][a-z0-9]{7,19}$/.test(env.IORI_GENERATION ?? '')) {
    throw fail('archive-bucket', 'config-invalid', 'Event archive bucket inputs are invalid.');
  }
  const identity = createTargetIdentity({
    environment,
    generation: env.IORI_GENERATION,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  });
  const name = identity.names.eventArchive;
  const context = { accountId: identity.accountId, token: env.CLOUDFLARE_API_TOKEN, signal, fetchRequest };
  const state = (value) => notice(`IORI_NOTICE event-archive-bucket environment=${environment} state=${value}`);
  const guarded = (stage, operation) =>
    at(stage, async () => {
      try {
        return await operation();
      } catch (error) {
        if (reasonOf(error) === 'api-forbidden') state(FORBIDDEN_WORD);
        throw error;
      }
    });
  const bucketsPath = `/accounts/${identity.accountId}/r2/buckets`;
  const readBucket = async () => {
    try {
      return (await request({ ...context, method: 'GET', path: `${bucketsPath}/${name}` })).result;
    } catch (error) {
      if (reasonOf(error) === 'r2-http-404') return undefined;
      throw error;
    }
  };
  if (environment === 'staging') {
    const databases = matchesOf(
      await guarded('archive-bucket-resolve', () => listDatabases(context)),
      identity.names.d1,
    );
    if (databases.length === 0) {
      state('staging-not-running');
      return;
    }
    if (databases.length > 1) throw fail('archive-bucket-resolve', 'resource-ambiguous', 'D1 name is ambiguous.');
  }
  if (await guarded('archive-bucket-read', readBucket) !== undefined) state('exists');
  else {
    try {
      await guarded(
        'archive-bucket-create',
        () => request({ ...context, method: 'POST', path: bucketsPath, body: { name } }),
      );
      state('created');
    } catch (error) {
      if (reasonOf(error) !== 'r2-http-409') throw error;
      state('create-conflict');
    }
  }
  const bucket = await guarded('archive-bucket-verify', readBucket);
  if (bucket === undefined) throw fail('archive-bucket-verify', 'resource-missing', 'R2 bucket is missing.');
  if (bucket === null || typeof bucket !== 'object' || bucket.name !== name) {
    throw fail('archive-bucket-verify', 'identity-mismatch', 'R2 bucket name does not match.');
  }
  state('verified');
};
export const ensureFailureLines = (error) => operationFailureLines(error?.stage ?? 'archive-bucket', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'ensure-event-archive-bucket') {
    throw new Error('Invalid event archive bucket operation.');
  }
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await ensureEventArchiveBucket({ env: process.env, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Event archive bucket is ready.')).catch((error) => {
    try {
      process.stderr.write(`${ensureFailureLines(error).join('\n')}\n`);
    } catch {}
    console.error('Event archive bucket failed.');
    process.exitCode = 1;
  });
}
