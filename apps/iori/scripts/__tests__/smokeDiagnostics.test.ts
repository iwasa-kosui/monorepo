import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { cutoverFailureLines } from '../cutover-diagnostics.mjs';
// @ts-expect-error The reviewed smoke module is executed directly by Node as ESM.
import { smokeReviewedTarget } from '../reviewed-smoke.mjs';
// @ts-expect-error The smoke runner is executed directly by Node as ESM.
import { DEFAULT_STAGING_SMOKE_CHECKS } from '../run-cloudflare-smoke.mjs';
// @ts-expect-error The smoke diagnostics module is executed directly by Node as ESM.
import { isSmokeDetail, SMOKE_ITEM_WORDS, SMOKE_KIND_WORDS, smokeFailureDetails } from '../smoke-diagnostics.mjs';

const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|terraform|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const fixtureHostname = 'smoke-fixture-host.example';
const fixtureWorkerHostname = 'smoke-fixture-worker.example';
const fixtureToken = 'fixture-smoke-queue-token';
const fixtureBody = 'fixture response body that must never be logged';
const uuid = '00000000-0000-4000-8000-000000000000';
const target = {
  admission: {
    hostname: fixtureHostname,
    workerHostname: fixtureWorkerHostname,
    smoke: { username: 'iori-smoke', uploadFilename: `${uuid}.png`, articleId: uuid },
  },
};
const itemNames = DEFAULT_STAGING_SMOKE_CHECKS.map((check: { name: string }) => check.name) as string[];

const reply = (status: number, contentType: string, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  });
const healthyResponse = (path: string): Response => {
  if (path === '/health') return reply(200, 'text/plain', fixtureBody);
  if (path === '/healthz') return reply(200, 'application/json', { ok: true, service: 'iori' });
  if (path === '/readyz') {
    return reply(200, 'application/json', {
      ok: true,
      bindings: { database: true, r2: true, kv: true, queue: true, assets: true, auth: true },
    });
  }
  if (path === '/manifest.json') return reply(200, 'application/json', { name: 'iori' });
  if (path === '/api/v1/home') return reply(401, 'application/json', { error: 'Unauthorized' });
  if (path === '/.well-known/webfinger') {
    return reply(200, 'application/jrd+json', { subject: 'acct:iori-smoke', links: [] });
  }
  if (path === '/users/iori-smoke' || path === '/users/iori-smoke/outbox') {
    return reply(200, 'application/activity+json', { id: 'id', type: 'Person' });
  }
  if (path === '/inbox') return reply(405, 'application/json', { error: 'Method Not Allowed' });
  if (path === `/uploads/${uuid}.png` || path === `/api/og/articles/${uuid}`) {
    return reply(200, 'image/png', fixtureBody);
  }
  if (path === '/__smoke__/queue-enqueue') {
    return reply(200, 'application/json', { accepted: true, queue: { enqueued: 1 } });
  }
  if (path === '/api/v1/push/vapid-public-key') return reply(200, 'application/json', { publicKey: 'key' });
  return reply(404, 'text/plain', fixtureBody);
};
const failureOf = async (
  override: (path: string) => Response | Error | undefined,
  token = fixtureToken,
): Promise<Error & { diagnostic?: { reason: string; details: string[] } }> => {
  const fetchRequest = async (url: URL): Promise<Response> => {
    const replacement = override(url.pathname);
    if (replacement instanceof Error) throw replacement;
    return replacement ?? healthyResponse(url.pathname);
  };
  return smokeReviewedTarget({
    target,
    hostname: fixtureHostname,
    token,
    signal: new AbortController().signal,
    fetchRequest,
  }).then(
    () => {
      throw new Error('expected the smoke to fail');
    },
    (error: Error) => error,
  );
};

it('maps all thirteen smoke checklist names to distinct words', () => {
  expect(itemNames).toHaveLength(13);
  const words = itemNames.map(name => SMOKE_ITEM_WORDS[name]);
  expect(words.every(word => typeof word === 'string' && word !== 'other')).toBe(true);
  expect(new Set(words).size).toBe(13);
  expect(Object.keys(SMOKE_ITEM_WORDS).sort()).toEqual([...itemNames].sort());
  expect(Object.isFrozen(SMOKE_ITEM_WORDS)).toBe(true);
  expect(Object.isFrozen(SMOKE_KIND_WORDS)).toBe(true);
});
it('turns only the failed checks into words and keeps their order', () => {
  const details = smokeFailureDetails([
    { name: 'health', ok: true, status: 200, contentType: 'text/plain' },
    { name: 'healthz', ok: false, status: 503, failure: 'status mismatch' },
    { name: 'readyz', ok: false, status: 200, failure: 'content type mismatch' },
    { name: 'static asset', ok: false, status: 200, failure: 'JSON structure mismatch' },
    { name: 'auth rejection', ok: false, status: 200, failure: 'invalid JSON response' },
    { name: 'inbox', ok: false, status: null, failure: 'request failed' },
    { name: 'Queue enqueue', ok: false, status: null, failure: 'smoke queue token unavailable' },
    { name: 'Web Push public key', ok: false, status: 200, failure: 'unexpected' },
    { name: 'unknown item', ok: false, status: 99, failure: 'status mismatch' },
    { name: 'OGP PNG', ok: false, status: 600, failure: 'status mismatch' },
    { name: 'upload retrieval', ok: false, status: 503.5, failure: 'status mismatch' },
  ]);
  expect(details).toEqual([
    'smoke-healthz-503-status',
    'smoke-readyz-200-type',
    'smoke-asset-200-json',
    'smoke-auth-200-json',
    'smoke-inbox-none-request',
    'smoke-queue-none-token',
    'smoke-push-200-other',
    'smoke-other-none-status',
    'smoke-ogp-none-status',
    'smoke-upload-none-status',
  ]);
  expect(smokeFailureDetails([])).toEqual([]);
});
it('accepts the fixed smoke words only', () => {
  for (const word of ['smoke-readyz-503-status', 'smoke-inbox-none-request', 'smoke-other-100-other']) {
    expect(isSmokeDetail(word), word).toBe(true);
  }
  for (
    const word of [
      'WebFinger',
      'smoke-WebFinger-503-status',
      'smoke-Readyz-503-status',
      'smoke-READYZ-503-STATUS',
      'smoke-secret-503-status',
      'smoke-readyz-503-body',
      'smoke-readyz-99-status',
      'smoke-readyz-600-status',
      'smoke-readyz-None-status',
      'smoke-readyz-503-status-extra',
      'smoke-failed',
      '',
      undefined,
      503,
    ]
  ) expect(isSmokeDetail(word), String(word)).toBe(false);
});
it('reports the failed items of the real reviewed smoke without any host, token or body', async () => {
  const error = await failureOf(path => {
    if (path === '/readyz') return reply(503, 'application/json', { error: fixtureBody });
    if (path === '/.well-known/webfinger') return reply(200, 'application/jrd+json', { subject: 5 });
    if (path === '/inbox') return new Error(`connect ${fixtureHostname} ${fixtureToken}`);
    return undefined;
  });
  expect(error.message).toBe('Reviewed smoke failed.');
  expect(error.diagnostic?.reason).toBe('smoke-failed');
  expect(error.diagnostic?.details).toEqual([
    'smoke-readyz-503-status',
    'smoke-webfinger-200-json',
    'smoke-inbox-none-request',
  ]);
  const serialized = JSON.stringify([error.message, error.diagnostic]);
  for (const secret of [fixtureHostname, fixtureWorkerHostname, fixtureToken, fixtureBody, 'https://']) {
    expect(serialized).not.toContain(secret);
  }
});
it('reports every item as token-unavailable when the smoke token is empty', async () => {
  const error = await failureOf(() => undefined, '');
  expect(error.diagnostic?.details).toEqual(itemNames.map(name => `smoke-${SMOKE_ITEM_WORDS[name]}-none-token`));
});
it('keeps every generated word within the public workflow log pattern', async () => {
  const everyFailure = await failureOf(() => reply(503, 'text/plain', fixtureBody));
  const tokenFailure = await failureOf(() => undefined, '');
  const details = [...(everyFailure.diagnostic?.details ?? []), ...(tokenFailure.diagnostic?.details ?? [])];
  expect(details).toHaveLength(26);
  for (const detail of details) {
    expect(isSmokeDetail(detail), detail).toBe(true);
    const own = `IORI_DIAG stage=cutover-smoke-worker program=none exit=none signal=none reason=${detail}`;
    expect(own).toMatch(publicLine);
    expect(assertWorkflowOutput(own)).toEqual([]);
  }
  const lines = cutoverFailureLines('smoke-canonical', everyFailure, false);
  expect(lines).toHaveLength(14);
  for (const line of lines) {
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line)).toEqual([]);
  }
  expect(lines.at(-1)).toMatch(/reason=smoke-failed$/);
});
