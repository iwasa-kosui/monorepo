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
    operation = invocation.operation,
  }: { status?: number; failPut?: boolean; stdout?: string; signal?: AbortSignal; operation?: string } = {},
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
      invocation: { ...invocation, operation },
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
  it('adds the optional TWITTERAPI_IO_API_KEY to the bulk call only when it has a value', async () => {
    const token = 'twitterapi-io-key-value-for-fixture';
    const env = environment({ TWITTERAPI_IO_API_KEY: token });
    const { calls, error } = await run(env, { stdout: '\u2728 4 secrets successfully uploaded\n' });
    expect(error).toBeUndefined();
    const [call] = calls;
    expect(Object.keys(JSON.parse(call.options.input!))).toEqual([
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'SMOKE_QUEUE_TOKEN',
      'TWITTERAPI_IO_API_KEY',
    ]);
    expect(call.args.join(' ')).not.toContain(token);
    expect(Object.values(call.options.env)).not.toContain(token);
  });
  it.each([['empty', ''], ['unset', undefined]])(
    'does not fail and does not put TWITTERAPI_IO_API_KEY when it is %s',
    async (_label, value) => {
      const env = environment(value === undefined ? {} : { TWITTERAPI_IO_API_KEY: value });
      const { calls, error } = await run(env);
      expect(error).toBeUndefined();
      expect(Object.keys(JSON.parse(calls[0]!.options.input!))).toEqual([
        'VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'SMOKE_QUEUE_TOKEN',
      ]);
    },
  );
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

const blueskyEnvironment = (overrides: Record<string, string> = {}): Record<string, string> =>
  environment({
    BLUESKY_IDENTIFIER: 'iori.example.com',
    BLUESKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop',
    ...overrides,
  });
const blueskyValues = ['iori.example.com', 'abcd-efgh-ijkl-mnop'];
const deployments = (...versions: { version_id: string; percentage: number }[]) => ({
  success: true,
  result: { deployments: [{ versions }, { versions: [{ version_id: 'v-older', percentage: 100 }] }] },
});
const oldVersion = { version_id: 'v-old', percentage: 100 };
const newVersion = { version_id: 'v-new', percentage: 100 };
type Read = unknown;
type PatchReply = { status?: number; body?: string; throws?: boolean };
const runBluesky = async (
  env: Record<string, string>,
  {
    reads = [deployments(oldVersion), deployments(newVersion)],
    patch = {},
    signal = new AbortController().signal,
    sleepFails = false,
    operation = 'put-bluesky-secrets',
  }: { reads?: Read[]; patch?: PatchReply; signal?: AbortSignal; sleepFails?: boolean; operation?: string } = {},
) => {
  const calls: Call[] = [];
  const stages: string[] = [];
  const requests: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const runCommand = vi.fn(async (program: string, args: string[], options: Call['options']) => {
    calls.push({ program, args, options });
    return { stdout: '✨ 2 secrets successfully uploaded\n', stderr: '' };
  });
  let readIndex = 0;
  const fetchRequest = vi.fn(
    async (url: URL, init: { method: string; headers: Record<string, string>; body?: string }) => {
      requests.push({ url: url.toString(), method: init.method, headers: init.headers, body: init.body });
      if (init.method === 'PATCH') {
        if (patch.throws) throw new Error(`network down for ${init.body}`);
        return new Response(
          patch.body
            ?? JSON.stringify({ success: true, result: { secrets: { BLUESKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop' } } }),
          { status: patch.status ?? 200 },
        );
      }
      const read = reads[Math.min(readIndex, reads.length - 1)];
      readIndex += 1;
      if (typeof read === 'number') return new Response(JSON.stringify({ success: false }), { status: read });
      return new Response(JSON.stringify(read), { status: 200 });
    },
  );
  const sleep = vi.fn(async (_ms: number, _signal: AbortSignal) => {
    if (sleepFails) throw new Error('sleep aborted');
  });
  const written: string[] = [];
  const capture = (chunk: unknown) => {
    written.push(String(chunk));
    return true;
  };
  const spies = [
    vi.spyOn(process.stdout, 'write').mockImplementation(capture as never),
    vi.spyOn(process.stderr, 'write').mockImplementation(capture as never),
    vi.spyOn(console, 'log').mockImplementation((...args) => void written.push(args.join(' '))),
    vi.spyOn(console, 'error').mockImplementation((...args) => void written.push(args.join(' '))),
  ];
  let error: unknown;
  try {
    await putWorkerSecrets({
      invocation: { ...invocation, operation },
      env,
      signal,
      timeout: 60_000,
      onStage: stage => stages.push(stage),
      runCommand: runCommand as never,
      fetchRequest: fetchRequest as never,
      sleep: sleep as never,
    });
  } catch (caught) {
    error = caught;
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  const patches = requests.filter(request => request.method === 'PATCH');
  const reads_ = requests.filter(request => request.method === 'GET');
  return { calls, stages, requests, patches, reads: reads_, sleep, written, error };
};
const expectNoLeak = (
  env: Record<string, string>,
  written: string[],
  error: unknown,
  { stage = 'put-bluesky-secrets-put', secretValues = blueskyValues }: { stage?: string; secretValues?: string[] } = {},
) => {
  const surface = [
    ...written,
    ...(error === undefined
      ? []
      : [
        String((error as Error).message),
        JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
        String((error as Error).cause ?? ''),
        ...operationFailureLines(stage, error),
      ]),
  ].join('\n');
  for (const value of [...values(env), ...secretValues]) expect(surface).not.toContain(value);
};
const patchUrl =
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/iori-production-fixture1/secrets-bulk`;
const deploymentsUrl =
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/iori-production-fixture1/deployments`;

describe('put-bluesky-secrets', () => {
  it('patches only the two Bluesky secrets through secrets-bulk without calling wrangler', async () => {
    const env = blueskyEnvironment({
      TWITTERAPI_IO_API_KEY: 'twitterapi-io-key-value-for-fixture',
      VAPID_SUBJECT: 'mailto:iori@example.com',
    });
    const { calls, stages, requests, patches, sleep, written, error } = await runBluesky(env);
    expect(error).toBeUndefined();
    expect(calls).toEqual([]);
    expect(stages).toEqual(['put-bluesky-secrets', 'put-bluesky-secrets-read', 'put-bluesky-secrets-put']);
    expect(requests.map(request => [request.method, request.url])).toEqual([
      ['GET', deploymentsUrl],
      ['PATCH', patchUrl],
      ['GET', deploymentsUrl],
    ]);
    expect(patches).toHaveLength(1);
    const [patch] = patches;
    expect(patch.headers).toEqual({
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/merge-patch+json',
    });
    expect(JSON.parse(patch.body!)).toEqual({
      secrets: {
        BLUESKY_IDENTIFIER: { type: 'secret_text', name: 'BLUESKY_IDENTIFIER', text: 'iori.example.com' },
        BLUESKY_APP_PASSWORD: { type: 'secret_text', name: 'BLUESKY_APP_PASSWORD', text: 'abcd-efgh-ijkl-mnop' },
      },
    });
    expect(Object.keys(JSON.parse(patch.body!).secrets)).toEqual(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD']);
    for (
      const leaked of [
        'VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'SMOKE_QUEUE_TOKEN',
        'TWITTERAPI_IO_API_KEY',
        'VAPID_SUBJECT',
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
        env.SMOKE_QUEUE_TOKEN,
        env.TWITTERAPI_IO_API_KEY,
      ]
    ) expect(patch.body).not.toContain(leaked);
    expect(sleep).not.toHaveBeenCalled();
    expectNoLeak(env, written, error);
  });
  it('does not fail when the VAPID and smoke values are empty or malformed', async () => {
    const env = blueskyEnvironment({ VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMOKE_QUEUE_TOKEN: 'short' });
    const { patches, error } = await runBluesky(env);
    expect(error).toBeUndefined();
    expect(Object.keys(JSON.parse(patches[0].body!).secrets)).toEqual(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD']);
  });
  it.each(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
    'rejects an empty %s without calling wrangler',
    async (name) => {
      const env = blueskyEnvironment({ [name]: '' });
      const { calls, requests, stages, error } = await runBluesky(env);
      expect([calls, requests]).toEqual([[], []]);
      expect(stages.at(-1)).toBe('put-bluesky-secrets');
      expectDiagnostic(stages.at(-1)!, error, 'credentials-missing', env);
    },
  );
  it('rejects an unset Bluesky value without calling wrangler', async () => {
    const { BLUESKY_APP_PASSWORD: _removed, ...env } = blueskyEnvironment();
    const { calls, requests, stages, error } = await runBluesky(env);
    expect([calls, requests]).toEqual([[], []]);
    expectDiagnostic(stages.at(-1)!, error, 'credentials-missing', env);
  });
  it('adds BLUESKY_CREDENTIAL_KEY to the patch when it has a value', async () => {
    const credentialKey = 'credential-key-value-for-fixture';
    const env = blueskyEnvironment({ BLUESKY_CREDENTIAL_KEY: credentialKey });
    const { calls, patches, written, error } = await runBluesky(env);
    expect(error).toBeUndefined();
    expect(calls).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0].body!).secrets).toEqual({
      BLUESKY_IDENTIFIER: { type: 'secret_text', name: 'BLUESKY_IDENTIFIER', text: 'iori.example.com' },
      BLUESKY_APP_PASSWORD: { type: 'secret_text', name: 'BLUESKY_APP_PASSWORD', text: 'abcd-efgh-ijkl-mnop' },
      BLUESKY_CREDENTIAL_KEY: { type: 'secret_text', name: 'BLUESKY_CREDENTIAL_KEY', text: credentialKey },
    });
    expectNoLeak(env, written, error, { secretValues: [...blueskyValues, credentialKey] });
  });
  it.each([['empty', { BLUESKY_CREDENTIAL_KEY: '' }], ['unset', {}]])(
    'does not fail and leaves out only BLUESKY_CREDENTIAL_KEY when it is %s',
    async (_label, overrides) => {
      const env = blueskyEnvironment(overrides);
      const { calls, patches, reads, error } = await runBluesky(env);
      expect(error).toBeUndefined();
      expect(calls).toEqual([]);
      expect(patches).toHaveLength(1);
      expect(reads).toHaveLength(2);
      const { secrets } = JSON.parse(patches[0].body!);
      expect(Object.keys(secrets)).toEqual(['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD']);
      expect(patches[0].body).not.toContain('BLUESKY_CREDENTIAL_KEY');
    },
  );
  it('does not put BLUESKY_CREDENTIAL_KEY in put-twitterapi-secret', async () => {
    const env = twitterapiEnvironment({ BLUESKY_CREDENTIAL_KEY: 'credential-key-value-for-fixture' });
    const { patches, error } = await runTwitterapi(env);
    expect(error).toBeUndefined();
    expect(Object.keys(JSON.parse(patches[0].body!).secrets)).toEqual(['TWITTERAPI_IO_API_KEY']);
  });
  it.each([
    ['environment', { environment: 'staging' }],
    ['generation', { generation: 'fixture2' }],
    ['run ID', { runId: 'run-2' }],
    ['main SHA', { mainSha: 'c'.repeat(40) }],
  ])('rejects an admission identity with a different %s before any request', async (_name, change) => {
    const env = blueskyEnvironment({ IORI_ADMISSION_IDENTITY: JSON.stringify({ ...identity, ...change }) });
    const { calls, stages, requests, error } = await runBluesky(env);
    expect([calls, requests]).toEqual([[], []]);
    expect(stages).toEqual(['put-bluesky-secrets']);
    expectDiagnostic(stages.at(-1)!, error, 'identity-mismatch', env);
  });
  it('stops before patching when the Worker does not exist', async () => {
    const env = blueskyEnvironment();
    const { calls, patches, stages, error } = await runBluesky(env, { reads: [404] });
    expect([calls, patches]).toEqual([[], []]);
    expect(stages.at(-1)).toBe('put-bluesky-secrets-read');
    expectDiagnostic(stages.at(-1)!, error, 'workers-http-404', env);
  });
  it.each([
    ['an HTTP error', [500], 'workers-http-500'],
    ['no deployment', [{ success: true, result: { deployments: [] } }], 'workers-shape'],
    ['no versions', [{ success: true, result: { deployments: [{ versions: [] }] } }], 'workers-shape'],
    [
      'a version without an id',
      [{ success: true, result: { deployments: [{ versions: [{ percentage: 100 }] }] } }],
      'workers-shape',
    ],
  ])('does not patch when the deployments read before the write has %s', async (_label, reads, reason) => {
    const env = blueskyEnvironment();
    const { calls, patches, stages, error, written } = await runBluesky(env, { reads });
    expect([calls, patches]).toEqual([[], []]);
    expect(stages.at(-1)).toBe('put-bluesky-secrets-read');
    expectDiagnostic(stages.at(-1)!, error, reason, env);
    expectNoLeak(env, written, error);
  });
  it.each([[401, 'secrets-bulk-forbidden'], [403, 'secrets-bulk-forbidden'], [500, 'secrets-bulk-failed']])(
    'maps a PATCH response of HTTP %i to %s and does not read the deployments again',
    async (status, reason) => {
      const env = blueskyEnvironment();
      const body = JSON.stringify({
        success: false,
        errors: [{ message: 'rejected abcd-efgh-ijkl-mnop for iori.example.com' }],
        result: { secrets: { BLUESKY_APP_PASSWORD: { text: 'abcd-efgh-ijkl-mnop' } } },
      });
      const { calls, patches, reads, stages, error, written, sleep } = await runBluesky(env, {
        patch: { status, body },
      });
      expect(calls).toEqual([]);
      expect(patches).toHaveLength(1);
      expect(reads).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(stages.at(-1)).toBe('put-bluesky-secrets-put');
      expectDiagnostic(stages.at(-1)!, error, reason, env);
      expectNoLeak(env, written, error);
    },
  );
  it.each([
    [
      'success:false',
      { status: 200, body: JSON.stringify({ success: false, errors: [{ message: 'bad abcd-efgh-ijkl-mnop' }] }) },
    ],
    ['success missing', { status: 200, body: JSON.stringify({ result: { text: 'abcd-efgh-ijkl-mnop' } }) }],
    ['invalid JSON', { status: 200, body: 'not json abcd-efgh-ijkl-mnop' }],
    ['a network error', { throws: true }],
  ])('maps a PATCH with %s to secrets-bulk-failed and does not read the deployments again', async (_label, patch) => {
    const env = blueskyEnvironment();
    const { calls, patches, reads, stages, error, written, sleep } = await runBluesky(env, { patch });
    expect(calls).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(reads).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expectDiagnostic(stages.at(-1)!, error, 'secrets-bulk-failed', env);
    expectNoLeak(env, written, error);
  });
  it('reports an abort when the signal is aborted and the PATCH fails', async () => {
    const env = blueskyEnvironment();
    const controller = new AbortController();
    controller.abort();
    const { stages, error } = await runBluesky(env, { patch: { throws: true }, signal: controller.signal });
    expect(stages.at(-1)).toBe('put-bluesky-secrets-put');
    expectDiagnostic(stages.at(-1)!, error, 'aborted', env);
  });
  it('succeeds when a later read shows the new version at 100 percent, waiting 3 seconds between reads', async () => {
    const env = blueskyEnvironment();
    const { error, reads, patches, sleep, written } = await runBluesky(env, {
      reads: [
        deployments(oldVersion),
        deployments(oldVersion),
        deployments({ version_id: 'v-new', percentage: 50 }, { version_id: 'v-old', percentage: 50 }),
        deployments(newVersion),
      ],
    });
    expect(error).toBeUndefined();
    expect(patches).toHaveLength(1);
    expect(reads).toHaveLength(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([3000, 3000]);
    expectNoLeak(env, written, error);
  });
  it.each([
    ['the version does not change', [deployments(oldVersion)]],
    ['the new version is at 50 percent alone', [
      deployments(oldVersion),
      deployments({ version_id: 'v-new', percentage: 50 }),
    ]],
    [
      'the new version shares the traffic',
      [
        deployments(oldVersion),
        deployments({ version_id: 'v-new', percentage: 50 }, { version_id: 'v-old', percentage: 50 }),
      ],
    ],
  ])('fails with secrets-bulk-not-deployed after 5 reads when %s', async (_label, reads) => {
    const env = blueskyEnvironment();
    const { calls, patches, reads: gets, stages, sleep, error, written } = await runBluesky(env, { reads });
    expect(calls).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(gets).toHaveLength(6);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([3000, 3000, 3000, 3000]);
    expect(stages.at(-1)).toBe('put-bluesky-secrets-put');
    expectDiagnostic(stages.at(-1)!, error, 'secrets-bulk-not-deployed', env);
    expectNoLeak(env, written, error);
  });
  it('fails with the read reason when a re-read fails after the write', async () => {
    const env = blueskyEnvironment();
    const { error, stages, written } = await runBluesky(env, { reads: [deployments(oldVersion), 502] });
    expectDiagnostic(stages.at(-1)!, error, 'workers-http-502', env);
    expectNoLeak(env, written, error);
  });
  it('reports an abort when the wait between reads is interrupted', async () => {
    const env = blueskyEnvironment();
    const { error, stages } = await runBluesky(env, { reads: [deployments(oldVersion)], sleepFails: true });
    expectDiagnostic(stages.at(-1)!, error, 'aborted', env);
  });
});

const twitterapiKey = 'twitterapi-io-key-value-for-fixture';
const twitterapiEnvironment = (overrides: Record<string, string> = {}): Record<string, string> =>
  environment({ TWITTERAPI_IO_API_KEY: twitterapiKey, ...overrides });
const runTwitterapi = (env: Record<string, string>, options: Parameters<typeof runBluesky>[1] = {}) =>
  runBluesky(env, { ...options, operation: 'put-twitterapi-secret' });
const twitterapiLeak = { stage: 'put-twitterapi-put', secretValues: [twitterapiKey] };
const expectTwitterapiDiagnostic = (stage: string, error: unknown, reason: string, env: Record<string, string>) => {
  expectDiagnostic(stage, error, reason, env);
  expect(operationFailureLines(stage, error).join('\n')).not.toContain(twitterapiKey);
};

describe('put-twitterapi-secret', () => {
  it('patches only TWITTERAPI_IO_API_KEY through secrets-bulk without calling wrangler', async () => {
    const env = twitterapiEnvironment({
      BLUESKY_IDENTIFIER: 'iori.example.com',
      BLUESKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop',
      VAPID_SUBJECT: 'mailto:iori@example.com',
    });
    const { calls, stages, requests, patches, sleep, written, error } = await runTwitterapi(env);
    expect(error).toBeUndefined();
    expect(calls).toEqual([]);
    expect(stages).toEqual(['put-twitterapi', 'put-twitterapi-read', 'put-twitterapi-put']);
    expect(requests.map(request => [request.method, request.url])).toEqual([
      ['GET', deploymentsUrl],
      ['PATCH', patchUrl],
      ['GET', deploymentsUrl],
    ]);
    expect(patches).toHaveLength(1);
    const [patch] = patches;
    expect(patch.headers).toEqual({
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/merge-patch+json',
    });
    expect(JSON.parse(patch.body!)).toEqual({
      secrets: { TWITTERAPI_IO_API_KEY: { type: 'secret_text', name: 'TWITTERAPI_IO_API_KEY', text: twitterapiKey } },
    });
    for (
      const leaked of [
        'VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'SMOKE_QUEUE_TOKEN',
        'BLUESKY_IDENTIFIER',
        'BLUESKY_APP_PASSWORD',
        'VAPID_SUBJECT',
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
        env.SMOKE_QUEUE_TOKEN,
        env.BLUESKY_IDENTIFIER,
        env.BLUESKY_APP_PASSWORD,
      ]
    ) expect(patch.body).not.toContain(leaked);
    expect(sleep).not.toHaveBeenCalled();
    expectNoLeak(env, written, error, { ...twitterapiLeak, secretValues: [twitterapiKey, ...blueskyValues] });
  });
  it('does not fail when the VAPID and smoke values are empty or malformed', async () => {
    const env = twitterapiEnvironment({ VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMOKE_QUEUE_TOKEN: 'short' });
    const { patches, error } = await runTwitterapi(env);
    expect(error).toBeUndefined();
    expect(Object.keys(JSON.parse(patches[0].body!).secrets)).toEqual(['TWITTERAPI_IO_API_KEY']);
  });
  it.each(['TWITTERAPI_IO_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
    'rejects an empty %s without any request',
    async (name) => {
      const env = twitterapiEnvironment({ [name]: '' });
      const { calls, requests, stages, error } = await runTwitterapi(env);
      expect([calls, requests]).toEqual([[], []]);
      expect(stages).toEqual(['put-twitterapi']);
      expectTwitterapiDiagnostic(stages.at(-1)!, error, 'credentials-missing', env);
    },
  );
  it('rejects an unset TWITTERAPI_IO_API_KEY without any request', async () => {
    const env = environment();
    const { calls, requests, stages, error } = await runTwitterapi(env);
    expect([calls, requests]).toEqual([[], []]);
    expect(stages).toEqual(['put-twitterapi']);
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'credentials-missing', env);
  });
  it('does not need the Bluesky secrets', async () => {
    const { patches, error } = await runTwitterapi(twitterapiEnvironment());
    expect(error).toBeUndefined();
    expect(Object.keys(JSON.parse(patches[0].body!).secrets)).toEqual(['TWITTERAPI_IO_API_KEY']);
  });
  it('rejects a malformed CLOUDFLARE_ACCOUNT_ID with config-invalid before any request', async () => {
    const env = twitterapiEnvironment({ CLOUDFLARE_ACCOUNT_ID: 'not-an-account-id' });
    const { requests, stages, error } = await runTwitterapi(env);
    expect(requests).toEqual([]);
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'config-invalid', env);
  });
  it.each([
    ['environment', { environment: 'staging' }],
    ['generation', { generation: 'fixture2' }],
    ['run ID', { runId: 'run-2' }],
    ['main SHA', { mainSha: 'c'.repeat(40) }],
  ])('rejects an admission identity with a different %s before any request', async (_name, change) => {
    const env = twitterapiEnvironment({ IORI_ADMISSION_IDENTITY: JSON.stringify({ ...identity, ...change }) });
    const { calls, stages, requests, error } = await runTwitterapi(env);
    expect([calls, requests]).toEqual([[], []]);
    expect(stages).toEqual(['put-twitterapi']);
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'identity-mismatch', env);
  });
  it('stops before patching when the Worker does not exist', async () => {
    const env = twitterapiEnvironment();
    const { calls, patches, stages, error } = await runTwitterapi(env, { reads: [404] });
    expect([calls, patches]).toEqual([[], []]);
    expect(stages.at(-1)).toBe('put-twitterapi-read');
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'workers-http-404', env);
  });
  it.each([[401, 'secrets-bulk-forbidden'], [403, 'secrets-bulk-forbidden'], [500, 'secrets-bulk-failed']])(
    'maps a PATCH response of HTTP %i to %s and does not read the deployments again',
    async (status, reason) => {
      const env = twitterapiEnvironment();
      const body = JSON.stringify({
        success: false,
        errors: [{ message: `rejected ${twitterapiKey}` }],
        result: { secrets: { TWITTERAPI_IO_API_KEY: { text: twitterapiKey } } },
      });
      const { calls, patches, reads, stages, error, written, sleep } = await runTwitterapi(env, {
        patch: { status, body },
      });
      expect(calls).toEqual([]);
      expect(patches).toHaveLength(1);
      expect(reads).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(stages.at(-1)).toBe('put-twitterapi-put');
      expectTwitterapiDiagnostic(stages.at(-1)!, error, reason, env);
      expectNoLeak(env, written, error, twitterapiLeak);
    },
  );
  it('maps a PATCH network error to secrets-bulk-failed without leaking the value', async () => {
    const env = twitterapiEnvironment();
    const { calls, patches, reads, stages, error, written } = await runTwitterapi(env, { patch: { throws: true } });
    expect(calls).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(reads).toHaveLength(1);
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'secrets-bulk-failed', env);
    expectNoLeak(env, written, error, twitterapiLeak);
  });
  it('reports an abort when the signal is aborted and the PATCH fails', async () => {
    const env = twitterapiEnvironment();
    const controller = new AbortController();
    controller.abort();
    const { stages, error } = await runTwitterapi(env, { patch: { throws: true }, signal: controller.signal });
    expect(stages.at(-1)).toBe('put-twitterapi-put');
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'aborted', env);
  });
  it('fails with secrets-bulk-not-deployed after 5 reads when the version does not change', async () => {
    const env = twitterapiEnvironment();
    const { calls, patches, reads, stages, sleep, error, written } = await runTwitterapi(env, {
      reads: [deployments(oldVersion)],
    });
    expect(calls).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(reads).toHaveLength(6);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([3000, 3000, 3000, 3000]);
    expect(stages.at(-1)).toBe('put-twitterapi-put');
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'secrets-bulk-not-deployed', env);
    expectNoLeak(env, written, error, twitterapiLeak);
  });
  it('fails with the read reason when a re-read fails after the write', async () => {
    const env = twitterapiEnvironment();
    const { error, stages, written } = await runTwitterapi(env, { reads: [deployments(oldVersion), 502] });
    expectTwitterapiDiagnostic(stages.at(-1)!, error, 'workers-http-502', env);
    expectNoLeak(env, written, error, twitterapiLeak);
  });
});
