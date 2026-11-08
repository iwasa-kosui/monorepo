import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { createTargetIdentity } from './fresh-target.mjs';
import { runMigrationCommand } from './migration-command.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { assertSmokeQueueToken } from './smoke-diagnostics.mjs';
import { controlPlaneApi, withReason } from './target-preparation-diagnostics.mjs';
import { vapidKeyPairMatches } from './vapid-origin-check.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

const appRoot = new URL('..', import.meta.url).pathname;
const OPTIONAL_SECRET_NAMES = Object.freeze(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD', 'TWITTERAPI_IO_API_KEY']);
const SECRET_NAMES = Object.freeze([
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'SMOKE_QUEUE_TOKEN',
  ...OPTIONAL_SECRET_NAMES,
]);
// The relay pattern limits a stage word to 24 characters.
const SECRETS_BULK_OPERATIONS = Object.freeze({
  'put-bluesky-secrets': Object.freeze({
    stagePrefix: 'put-bluesky-secrets',
    secretNames: Object.freeze(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD']),
  }),
  'put-twitterapi-secret': Object.freeze({
    stagePrefix: 'put-twitterapi',
    secretNames: Object.freeze(['TWITTERAPI_IO_API_KEY']),
  }),
});
const SECRETS_BULK_VERIFY_ATTEMPTS = 5;
const SECRETS_BULK_VERIFY_INTERVAL_MS = 3000;
const bulkOperationOf = (operation) =>
  Object.hasOwn(SECRETS_BULK_OPERATIONS, operation) ? SECRETS_BULK_OPERATIONS[operation] : undefined;
const secretNamesToPut = (env) => SECRET_NAMES.filter((name) => !OPTIONAL_SECRET_NAMES.includes(name) || env[name]);

const assertIdentity = (env, invocation) => {
  let identity;
  try {
    identity = JSON.parse(env.IORI_ADMISSION_IDENTITY ?? 'null');
  } catch {}
  if (
    identity === null || typeof identity !== 'object' || identity.environment !== invocation.environment
    || identity.generation !== invocation.generation || identity.runId !== invocation.runId
    || identity.mainSha !== invocation.migrationSha
  ) throw withReason(new Error('Migration target evidence is invalid.'), 'identity-mismatch');
};
const assertInputs = (env, bulkSecretNames) => {
  if (
    [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      ...(bulkSecretNames ?? SECRET_NAMES.filter((name) => !OPTIONAL_SECRET_NAMES.includes(name))),
    ]
      .some((name) => !env[name])
  ) throw withReason(new Error('Worker credentials are required.'), 'credentials-missing');
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)) {
    throw withReason(new Error('Worker credentials are invalid.'), 'config-invalid');
  }
  if (bulkSecretNames) return;
  assertSmokeQueueToken(env.SMOKE_QUEUE_TOKEN);
  let matches = false;
  try {
    matches = vapidKeyPairMatches({ privateKey: env.VAPID_PRIVATE_KEY, publicKey: env.VAPID_PUBLIC_KEY });
  } catch {}
  if (!matches) throw withReason(new Error('VAPID key pair does not match.'), 'vapid-rejected');
};
const assertWorkerExists = async ({ accountId, workerName, token, signal, fetchRequest }) => {
  const path = `/accounts/${accountId}/workers/scripts/${workerName}/deployments`;
  const api = controlPlaneApi(path);
  const failed = (kind) => withReason(new Error('Worker read failed.'), signal.aborted ? 'aborted' : `${api}-${kind}`);
  let response;
  try {
    response = await fetchRequest(new URL(`https://api.cloudflare.com/client/v4${path}`), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
  } catch {
    throw failed('request');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw failed(`http-${response.status}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw failed('shape');
  }
  if (body?.success !== true || body.result === undefined) throw failed('shape');
  return body;
};
const latestVersions = (body, signal) => {
  const versions = body?.result?.deployments?.[0]?.versions;
  if (
    !Array.isArray(versions) || versions.length === 0
    || versions.some((version) =>
      typeof version?.version_id !== 'string' || version.version_id === '' || typeof version.percentage !== 'number'
    )
  ) throw withReason(new Error('Worker read failed.'), signal.aborted ? 'aborted' : 'workers-shape');
  return versions;
};
const putSecretsBulk = async ({ accountId, workerName, token, secrets, signal, fetchRequest }) => {
  const failed = (reason) => withReason(new Error('Worker secret put failed.'), signal.aborted ? 'aborted' : reason);
  let response;
  try {
    response = await fetchRequest(
      new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/secrets-bulk`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify({
          secrets: Object.fromEntries(
            Object.entries(secrets).map(([name, text]) => [name, { type: 'secret_text', name, text }]),
          ),
        }),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      },
    );
  } catch {
    throw failed('secrets-bulk-failed');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw failed(
      response.status === 401 || response.status === 403 ? 'secrets-bulk-forbidden' : 'secrets-bulk-failed',
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw failed('secrets-bulk-failed');
  }
  if (body?.success !== true) throw failed('secrets-bulk-failed');
};
const assertNewVersionDeployed = async ({ accountId, workerName, token, signal, fetchRequest, sleep, previous }) => {
  for (let attempt = 0; attempt < SECRETS_BULK_VERIFY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      try {
        await sleep(SECRETS_BULK_VERIFY_INTERVAL_MS, signal);
      } catch {
        throw withReason(new Error('Worker read failed.'), 'aborted');
      }
    }
    const versions = latestVersions(
      await assertWorkerExists({ accountId, workerName, token, signal, fetchRequest }),
      signal,
    );
    if (versions.length === 1 && versions[0].percentage === 100 && versions[0].version_id !== previous) return;
  }
  throw withReason(new Error('Worker secret put failed.'), signal.aborted ? 'aborted' : 'secrets-bulk-not-deployed');
};
export const putWorkerSecrets = async ({
  invocation,
  env,
  signal,
  timeout,
  onStage = () => {},
  runCommand = runMigrationCommand,
  fetchRequest = fetch,
  sleep = (ms, sleepSignal) => delay(ms, undefined, { signal: sleepSignal }),
}) => {
  const bulkOperation = bulkOperationOf(invocation.operation);
  const stagePrefix = bulkOperation?.stagePrefix ?? 'put-worker-secrets';
  onStage(stagePrefix);
  assertIdentity(env, invocation);
  assertInputs(env, bulkOperation?.secretNames);
  let workerName;
  try {
    workerName = createTargetIdentity({
      environment: invocation.environment,
      generation: invocation.generation,
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
    }).workerName;
  } catch {
    throw withReason(new Error('Worker credentials are invalid.'), 'config-invalid');
  }
  onStage(`${stagePrefix}-read`);
  const deployments = await assertWorkerExists({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    workerName,
    token: env.CLOUDFLARE_API_TOKEN,
    signal,
    fetchRequest,
  });
  if (bulkOperation) {
    const previous = latestVersions(deployments, signal)[0].version_id;
    onStage(`${stagePrefix}-put`);
    await putSecretsBulk({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      workerName,
      token: env.CLOUDFLARE_API_TOKEN,
      secrets: Object.fromEntries(bulkOperation.secretNames.map((name) => [name, env[name]])),
      signal,
      fetchRequest,
    });
    await assertNewVersionDeployed({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      workerName,
      token: env.CLOUDFLARE_API_TOKEN,
      signal,
      fetchRequest,
      sleep,
      previous,
    });
    return;
  }
  const childEnv = {
    ...Object.fromEntries(Object.entries(env).filter(([name]) => !SECRET_NAMES.includes(name))),
    WRANGLER_SEND_METRICS: 'false',
  };
  onStage(`${stagePrefix}-put`);
  const putNames = secretNamesToPut(env);
  let result;
  try {
    result = await runCommand('pnpm', ['exec', 'wrangler', 'secret', 'bulk', '--name', workerName], {
      cwd: appRoot,
      env: childEnv,
      signal,
      timeout,
      maxBuffer: 1_000_000,
      killGraceMs: 15000,
      input: JSON.stringify(Object.fromEntries(putNames.map((name) => [name, env[name]]))),
    });
  } catch {
    throw withReason(new Error('Worker secret put failed.'), signal.aborted ? 'aborted' : 'command-failed');
  }
  if (!String(result?.stdout ?? '').includes(`${putNames.length} secrets successfully uploaded`)) {
    throw withReason(new Error('Worker secret put failed.'), signal.aborted ? 'aborted' : 'command-failed');
  }
};
const main = async (cliSignal, onStage) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'put-worker-secrets' && !bulkOperationOf(invocation.operation)) {
    throw new Error('Invalid Worker secret operation.');
  }
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await putWorkerSecrets({ invocation, env: process.env, signal, timeout: remainingMs, onStage });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let putStage = bulkOperationOf(process.env.IORI_OPERATION)?.stagePrefix ?? 'put-worker-secrets';
  withCliSignal(signal =>
    main(signal, (stage) => {
      putStage = stage;
    })
  ).then(() => console.log('Worker secrets updated.')).catch((error) => {
    try {
      process.stderr.write(`${operationFailureLines(putStage, error).join('\n')}\n`);
    } catch {}
    console.error('Worker secret update failed; retain current state for reviewed recovery.');
    process.exitCode = 1;
  });
}
