import { describe, expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { ensureEventArchiveBucket, ensureFailureLines } from '../ensure-event-archive-bucket.mjs';
import { createTargetIdentity } from '../fresh-target.mjs';
import { OPERATION_STAGES } from '../operation-diagnostics.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const generation = 'prd20261102a';
const root = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const bucketName = (environment: string) => `iori-${environment}-${generation}-event-archive`;
const env = (overrides: Record<string, string> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: generation,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
type Call = { method: string; url: string; body?: string; init: RequestInit };
type Options = {
  buckets?: string[];
  getStatus?: number;
  postStatus?: number;
  postCreates?: boolean;
  readName?: string;
  databases?: string[];
};
const json = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result }), { status });
const run = async (overrides: Record<string, string> = {}, options: Options = {}) => {
  const buckets = [...(options.buckets ?? [])];
  const calls: Call[] = [];
  const notices: string[] = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const method = String(init.method);
    const text = url.toString();
    calls.push({ method, url: text, body: init.body as string | undefined, init });
    if (method === 'GET' && text.startsWith(`${root}/d1/database?`)) {
      const items = (options.databases ?? []).map(name => ({
        name,
        uuid: '1'.repeat(8) + '-1111-4111-8111-' + '1'.repeat(12),
      }));
      return json(items);
    }
    if (method === 'GET' && text.startsWith(`${root}/r2/buckets/`)) {
      if (options.getStatus !== undefined && options.getStatus !== 200 && options.getStatus !== 404) {
        return json(null, options.getStatus);
      }
      const name = text.slice(`${root}/r2/buckets/`.length);
      if (!buckets.includes(name)) return json(null, 404);
      return json({ name: options.readName ?? name, creation_date: '2026-11-05T00:00:00.000Z' });
    }
    if (method === 'POST' && text === `${root}/r2/buckets`) {
      const status = options.postStatus ?? 200;
      if (status !== 200) return json(null, status);
      if (options.postCreates !== false) buckets.push(JSON.parse(init.body as string).name);
      return json({ name: JSON.parse(init.body as string).name });
    }
    return json(null, 404);
  };
  let error: unknown;
  try {
    await ensureEventArchiveBucket({
      env: env(overrides),
      fetchRequest: fetchRequest as never,
      notice: line => notices.push(line),
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, notices, error, buckets };
};
const notice = (state: string, environment = 'production') =>
  `IORI_NOTICE event-archive-bucket environment=${environment} state=${state}`;
const methods = (calls: Call[]) => calls.map(call => call.method);
const writes = (calls: Call[]) => calls.filter(call => call.method !== 'GET');
const diag = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;

describe('ensure-event-archive-bucket', () => {
  it('derives the bucket name the same way as the fresh target identity', () => {
    expect(createTargetIdentity({ environment: 'production', generation, accountId }).names.eventArchive).toBe(
      bucketName('production'),
    );
    expect(createTargetIdentity({ environment: 'staging', generation, accountId }).names.eventArchive).toBe(
      bucketName('staging'),
    );
  });
  it('succeeds without writing when the bucket already exists', async () => {
    const { calls, notices, error } = await run({}, { buckets: [bucketName('production')] });
    expect(error).toBeUndefined();
    expect(calls.map(call => call.url)).toEqual([
      `${root}/r2/buckets/${bucketName('production')}`,
      `${root}/r2/buckets/${bucketName('production')}`,
    ]);
    expect(writes(calls)).toEqual([]);
    expect(notices).toEqual([notice('exists'), notice('verified')]);
  });
  it('creates the bucket with only its name when the first read is 404, then reads it back', async () => {
    const { calls, notices, error, buckets } = await run();
    expect(error).toBeUndefined();
    expect(methods(calls)).toEqual(['GET', 'POST', 'GET']);
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0].url).toBe(`${root}/r2/buckets`);
    expect(JSON.parse(writes(calls)[0].body!)).toEqual({ name: bucketName('production') });
    expect(buckets).toEqual([bucketName('production')]);
    expect(notices).toEqual([notice('created'), notice('verified')]);
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
      expect(call.init.redirect).toBe('error');
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('fails the read back when the create conflicts but the bucket is still missing', async () => {
    const { calls, notices, error } = await run({}, { postStatus: 409, postCreates: false });
    expect(error).toBeDefined();
    expect(methods(calls)).toEqual(['GET', 'POST', 'GET']);
    expect(notices).toEqual([notice('create-conflict')]);
    expect(ensureFailureLines(error)).toEqual([diag('archive-bucket-verify', 'resource-missing')]);
  });
  it('treats 409 on create as success when the read back finds the bucket', async () => {
    let first = true;
    const calls: string[] = [];
    const notices: string[] = [];
    const fetchRequest = async (url: URL, init: RequestInit) => {
      const method = String(init.method);
      calls.push(method);
      if (method === 'POST') return json(null, 409);
      if (first) {
        first = false;
        return json(null, 404);
      }
      return json({ name: bucketName('production') });
    };
    await ensureEventArchiveBucket({
      env: env(),
      fetchRequest: fetchRequest as never,
      notice: line => notices.push(line),
    });
    expect(calls).toEqual(['GET', 'POST', 'GET']);
    expect(notices).toEqual([notice('create-conflict'), notice('verified')]);
  });
  it.each(
    [['GET', { getStatus: 403 }, 'archive-bucket-read', 1], [
      'POST',
      { postStatus: 403 },
      'archive-bucket-create',
      2,
    ]] as const,
  )(
    'fails with the fixed forbidden word when %s returns 403',
    async (_method, options, stage, callCount) => {
      const { calls, notices, error } = await run({}, options);
      expect(error).toBeDefined();
      expect(calls).toHaveLength(callCount);
      expect(notices).toEqual([notice('event-archive-bucket-forbidden')]);
      expect(ensureFailureLines(error)).toEqual([diag(stage, 'api-forbidden')]);
      expect(assertWorkflowOutput(notices[0])).toEqual([]);
    },
  );
  it('fails when the read back name does not match', async () => {
    const { notices, error } = await run({}, { buckets: [bucketName('production')], readName: 'other-bucket' });
    expect(error).toBeDefined();
    expect(notices).toEqual([notice('exists')]);
    expect(ensureFailureLines(error)).toEqual([diag('archive-bucket-verify', 'identity-mismatch')]);
  });
  it('fails when the create succeeds but the bucket is still missing on read back', async () => {
    const { notices, error } = await run({}, { postCreates: false });
    expect(notices).toEqual([notice('created')]);
    expect(ensureFailureLines(error)).toEqual([diag('archive-bucket-verify', 'resource-missing')]);
  });
  it('fails without writing on other create errors', async () => {
    const { calls, notices, error } = await run({}, { postStatus: 500 });
    expect(methods(calls)).toEqual(['GET', 'POST']);
    expect(notices).toEqual([]);
    expect(ensureFailureLines(error)).toEqual([diag('archive-bucket-create', 'r2-http-500')]);
  });
  it('sends only one write, the bucket creation, and never deletes or changes anything else', async () => {
    for (const options of [{}, { buckets: [bucketName('production')] }, { postStatus: 409 }, { postStatus: 403 }]) {
      const { calls } = await run({}, options);
      expect(calls.every(call => ['GET', 'POST'].includes(call.method))).toBe(true);
      for (const call of writes(calls)) {
        expect(call.method).toBe('POST');
        expect(call.url).toBe(`${root}/r2/buckets`);
        expect(Object.keys(JSON.parse(call.body!))).toEqual(['name']);
      }
    }
  });
  it('creates the staging bucket only when the staging D1 of the generation exists', async () => {
    const { calls, notices, error, buckets } = await run(
      { IORI_ENVIRONMENT: 'staging' },
      { databases: [`iori-staging-${generation}`] },
    );
    expect(error).toBeUndefined();
    expect(methods(calls)).toEqual(['GET', 'GET', 'POST', 'GET']);
    expect(buckets).toEqual([bucketName('staging')]);
    expect(notices).toEqual([notice('created', 'staging'), notice('verified', 'staging')]);
  });
  it.each([[[]], [['iori-production-prd20261102a', 'iori-staging-prd20261102b']]])(
    'does nothing and succeeds when staging is not running (%j)',
    async (databases) => {
      const { calls, notices, error } = await run({ IORI_ENVIRONMENT: 'staging' }, { databases });
      expect(error).toBeUndefined();
      expect(methods(calls)).toEqual(['GET']);
      expect(calls[0].url).toContain(`${root}/d1/database?`);
      expect(writes(calls)).toEqual([]);
      expect(notices).toEqual([notice('staging-not-running', 'staging')]);
    },
  );
  it('does not look at D1 for production', async () => {
    const { calls } = await run();
    expect(calls.some(call => call.url.includes('/d1/'))).toBe(false);
  });
  it('fails on an ambiguous staging D1 and on a forbidden D1 listing', async () => {
    const name = `iori-staging-${generation}`;
    const ambiguous = await run({ IORI_ENVIRONMENT: 'staging' }, { databases: [name, name] });
    expect(ensureFailureLines(ambiguous.error)).toEqual([diag('archive-bucket-resolve', 'resource-ambiguous')]);
    expect(writes(ambiguous.calls)).toEqual([]);
  });
  it.each([
    [{ IORI_ENVIRONMENT: 'development' }, 'config-invalid'],
    [{ IORI_GENERATION: 'Bad-Generation' }, 'config-invalid'],
    [{ IORI_GENERATION: '' }, 'config-invalid'],
    [{ CLOUDFLARE_ACCOUNT_ID: 'short' }, 'config-invalid'],
    [{ CLOUDFLARE_API_TOKEN: '' }, 'credentials-missing'],
    [{ CLOUDFLARE_ACCOUNT_ID: '' }, 'credentials-missing'],
  ])('rejects invalid input %j before any request', async (overrides, reason) => {
    const { calls, error } = await run(overrides);
    expect(calls).toEqual([]);
    expect(ensureFailureLines(error)).toEqual([diag('archive-bucket', reason)]);
  });
  it('keeps every stage within the public relay pattern', () => {
    const stages = [
      'archive-bucket',
      'archive-bucket-resolve',
      'archive-bucket-read',
      'archive-bucket-create',
      'archive-bucket-verify',
    ];
    for (const stage of stages) {
      expect(OPERATION_STAGES).toContain(stage);
      expect(stage).toMatch(/^[a-z-]{1,24}$/);
    }
  });
});
