import { resolve } from 'node:path';
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
const SECRET_NAMES = Object.freeze(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SMOKE_QUEUE_TOKEN']);
const OPTIONAL_SECRET_NAMES = Object.freeze(['TWITTERAPI_IO_API_KEY']);

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
const assertInputs = (env) => {
  if (
    ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', ...SECRET_NAMES].some((name) => !env[name])
  ) throw withReason(new Error('Worker credentials are required.'), 'credentials-missing');
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)) {
    throw withReason(new Error('Worker credentials are invalid.'), 'config-invalid');
  }
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
};
export const putWorkerSecrets = async ({
  invocation,
  env,
  signal,
  timeout,
  onStage = () => {},
  runCommand = runMigrationCommand,
  fetchRequest = fetch,
}) => {
  onStage('put-worker-secrets');
  assertIdentity(env, invocation);
  assertInputs(env);
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
  onStage('put-worker-secrets-read');
  await assertWorkerExists({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    workerName,
    token: env.CLOUDFLARE_API_TOKEN,
    signal,
    fetchRequest,
  });
  const childEnv = {
    ...Object.fromEntries(
      Object.entries(env).filter(([name]) => ![...SECRET_NAMES, ...OPTIONAL_SECRET_NAMES].includes(name)),
    ),
    WRANGLER_SEND_METRICS: 'false',
  };
  const putNames = [...SECRET_NAMES, ...OPTIONAL_SECRET_NAMES.filter((name) => env[name])];
  onStage('put-worker-secrets-put');
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
  if (invocation.operation !== 'put-worker-secrets') throw new Error('Invalid Worker secret operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await putWorkerSecrets({ invocation, env: process.env, signal, timeout: remainingMs, onStage });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let putStage = 'put-worker-secrets';
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
