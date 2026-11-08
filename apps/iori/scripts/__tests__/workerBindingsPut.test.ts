import { createECDH } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { operationFailureLines } from '../operation-diagnostics.mjs';
import { putWorkerSecrets } from '../worker-bindings-put.mjs';

const mainSha = 'a'.repeat(40);
const accountId = 'b'.repeat(32);
const invocation = {
  operation: 'put-worker-secrets',
  codeSha: mainSha,
  migrationSha: mainSha,
  environment: 'production',
  generation: 'fixture1',
  runId: 'run-1',
};
const identity = { environment: 'production', generation: 'fixture1', mainSha, runId: 'run-1' };
const vapid = () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const privateKey = ecdh.getPrivateKey();
  return {
    VAPID_PRIVATE_KEY: Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]).toString('base64url'),
    VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString('base64url'),
  };
};
const environment = (overrides: Record<string, string> = {}) => ({
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: 'api-token-value-for-fixture',
  IORI_ADMISSION_IDENTITY: JSON.stringify(identity),
  ...vapid(),
  SMOKE_QUEUE_TOKEN: 'smoke-token-value-for-fixture',
  ...overrides,
});
type Call = { program: string; args: string[]; options: { input?: string; env: Record<string, string | undefined> } };
const run = async (
  env: Record<string, string>,
  {
    status = 200,
    failPut = false,
    stdout = '\u2728 3 secrets successfully uploaded\n',
    signal = new AbortController().signal,
  }: { status?: number; failPut?: boolean; stdout?: string; signal?: AbortSignal } = {},
) => {
  const calls: Call[] = [];
  const stages: string[] = [];
  const requests: { url: string; headers: unknown }[] = [];
  const runCommand = vi.fn(async (program: string, args: string[], options: Call['options']) => {
    calls.push({ program, args, options });
    if (failPut) throw Object.assign(new Error(`failed with ${options.input}`), { exitCode: 1 });
    return { stdout, stderr: '' };
  });
  const fetchRequest = vi.fn(async (url: URL, init: { headers: unknown }) => {
    requests.push({ url: url.toString(), headers: init.headers });
    return new Response(JSON.stringify({ success: status === 200, result: {} }), { status });
  });
  let error: unknown;
  try {
    await putWorkerSecrets({
      invocation,
      env,
      signal,
      timeout: 60_000,
      onStage: stage => stages.push(stage),
      runCommand: runCommand as never,
      fetchRequest: fetchRequest as never,
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, stages, requests, error };
};
const values = (
  env: Record<string, string>,
) =>
  [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.SMOKE_QUEUE_TOKEN, env.CLOUDFLARE_API_TOKEN].filter(value =>
    value.length >= 16
  );
const expectDiagnostic = (stage: string, error: unknown, reason: string, env: Record<string, string>) => {
  const lines = operationFailureLines(stage, error);
  expect(lines).toEqual([`IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`]);
  for (const line of lines) {
    expect(assertWorkflowOutput(line)).toEqual([]);
    for (const value of values(env)) expect(line).not.toContain(value);
  }
};

describe('put-worker-secrets', () => {
  it('puts the three values in one bulk call, passing them only on standard input', async () => {
    const env = environment();
    const { calls, stages, requests, error } = await run(env);
    expect(error).toBeUndefined();
    expect(stages).toEqual(['put-worker-secrets', 'put-worker-secrets-read', 'put-worker-secrets-put']);
    expect(requests.map(request => request.url)).toEqual([
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/iori-production-fixture1/deployments`,
    ]);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect([call.program, call.args]).toEqual([
      'pnpm',
      ['exec', 'wrangler', 'secret', 'bulk', '--name', 'iori-production-fixture1'],
    ]);
    expect(JSON.parse(call.options.input!)).toEqual({
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      SMOKE_QUEUE_TOKEN: env.SMOKE_QUEUE_TOKEN,
    });
    for (const value of values(env).slice(0, 3)) {
      expect(call.args.join(' ')).not.toContain(value);
      expect(Object.values(call.options.env)).not.toContain(value);
    }
    expect(call.options.env.CLOUDFLARE_API_TOKEN).toBe(env.CLOUDFLARE_API_TOKEN);
  });
  it('puts the Bluesky credentials as well when both are set', async () => {
    const env = environment({ BLUESKY_IDENTIFIER: 'iori.example.com', BLUESKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop' });
    const { calls, error } = await run(env, { stdout: '\u2728 5 secrets successfully uploaded\n' });
    expect(error).toBeUndefined();
    expect(JSON.parse(calls[0].options.input!)).toEqual({
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      SMOKE_QUEUE_TOKEN: env.SMOKE_QUEUE_TOKEN,
      BLUESKY_IDENTIFIER: 'iori.example.com',
      BLUESKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop',
    });
    expect(Object.values(calls[0].options.env)).not.toContain('abcd-efgh-ijkl-mnop');
  });
  it.each(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD'])(
    'does not require %s and leaves it out when empty',
    async (name) => {
      const env = environment({ [name]: '' });
      const { calls, error } = await run(env);
      expect(error).toBeUndefined();
      expect(Object.keys(JSON.parse(calls[0].options.input!))).toEqual([
        'VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'SMOKE_QUEUE_TOKEN',
      ]);
    },
  );
  it.each([
    ['environment', { environment: 'staging' }],
    ['generation', { generation: 'fixture2' }],
    ['run ID', { runId: 'run-2' }],
    ['main SHA', { mainSha: 'c'.repeat(40) }],
  ])('rejects an admission identity with a different %s before any request', async (_name, change) => {
    const env = environment({ IORI_ADMISSION_IDENTITY: JSON.stringify({ ...identity, ...change }) });
    const { calls, stages, requests, error } = await run(env);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
    expectDiagnostic(stages.at(-1)!, error, 'identity-mismatch', env);
    expect(stages.at(-1)).toBe('put-worker-secrets');
  });
  it('rejects an admission identity that is not JSON', async () => {
    const env = environment({ IORI_ADMISSION_IDENTITY: 'not-json' });
    const { stages, error } = await run(env);
    expectDiagnostic(stages.at(-1)!, error, 'identity-mismatch', env);
  });
  it.each([
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'SMOKE_QUEUE_TOKEN',
  ])(
    'rejects an empty %s',
    async (name) => {
      const env = environment({ [name]: '' });
      const { calls, requests, stages, error } = await run(env);
      expect([calls, requests]).toEqual([[], []]);
      expectDiagnostic(stages.at(-1)!, error, 'credentials-missing', env);
    },
  );
  it('rejects a malformed smoke queue token', async () => {
    const env = environment({ SMOKE_QUEUE_TOKEN: 'short' });
    const { calls, stages, error } = await run(env);
    expect(calls).toEqual([]);
    expectDiagnostic(stages.at(-1)!, error, 'smoke-token-short', env);
  });
  it('rejects a VAPID public key that does not match the private key', async () => {
    const env = environment({ VAPID_PUBLIC_KEY: vapid().VAPID_PUBLIC_KEY });
    const { calls, requests, stages, error } = await run(env);
    expect([calls, requests]).toEqual([[], []]);
    expectDiagnostic(stages.at(-1)!, error, 'vapid-rejected', env);
  });
  it('stops before putting when the Worker does not exist', async () => {
    const env = environment();
    const { calls, stages, error } = await run(env, { status: 404 });
    expect(calls).toEqual([]);
    expect(stages.at(-1)).toBe('put-worker-secrets-read');
    expectDiagnostic(stages.at(-1)!, error, 'workers-http-404', env);
  });
  it('keeps the values out of the diagnostics when the put fails', async () => {
    const env = environment();
    const { calls, stages, error } = await run(env, { failPut: true });
    expect(calls).toHaveLength(1);
    expect(stages.at(-1)).toBe('put-worker-secrets-put');
    expectDiagnostic(stages.at(-1)!, error, 'command-failed', env);
    for (const value of values(env)) expect(String((error as Error).message)).not.toContain(value);
  });
  it.each(['', 'No content found in file or piped input.\n', '\u2728 2 secrets successfully uploaded\n'])(
    'fails with exit code 0 when the success line is missing from %j',
    async (stdout) => {
      const env = environment();
      const { calls, stages, error } = await run(env, { stdout });
      expect(calls).toHaveLength(1);
      expect(stages.at(-1)).toBe('put-worker-secrets-put');
      expectDiagnostic(stages.at(-1)!, error, 'command-failed', env);
      for (const value of values(env)) expect(String((error as Error).message)).not.toContain(value);
    },
  );
  it('reports an abort when the signal is aborted and the command fails', async () => {
    const env = environment();
    const controller = new AbortController();
    controller.abort();
    const { stages, error } = await run(env, { failPut: true, signal: controller.signal });
    expect(stages.at(-1)).toBe('put-worker-secrets-put');
    expectDiagnostic(stages.at(-1)!, error, 'aborted', env);
  });
});
