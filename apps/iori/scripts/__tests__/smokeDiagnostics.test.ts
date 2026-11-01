import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { cutoverFailureLines } from '../cutover-diagnostics.mjs';
// @ts-expect-error The reviewed smoke module is executed directly by Node as ESM.
import { smokeReviewedTarget } from '../reviewed-smoke.mjs';
// @ts-expect-error The smoke runner is executed directly by Node as ESM.
import { DEFAULT_STAGING_SMOKE_CHECKS } from '../run-cloudflare-smoke.mjs';
import {
  assertSmokeQueueToken,
  isAllSmokeServiceUnavailable,
  isSmokeDetail,
  SMOKE_ITEM_WORDS,
  SMOKE_KIND_WORDS,
  SMOKE_MAX_DETAIL_LINES,
  SMOKE_REQUEST_CAUSE_WORDS,
  SMOKE_STATUS_TYPE_WORDS,
  SMOKE_TOKEN_CLASS_WORDS,
  smokeFailureDetails,
  smokeRequestCause,
  smokeTokenDetail,
  // @ts-expect-error The smoke diagnostics module is executed directly by Node as ESM.
} from '../smoke-diagnostics.mjs';

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

const itemWords = Object.values(SMOKE_ITEM_WORDS) as string[];
const tokenDetails = SMOKE_TOKEN_CLASS_WORDS.map((word: string) => `smoke-token-${word}`) as string[];
const allWords = (): string[] => {
  const kinds = [
    'type',
    'json',
    'token',
    'other',
    ...SMOKE_STATUS_TYPE_WORDS.map((word: string) => `status-${word}`),
    ...SMOKE_REQUEST_CAUSE_WORDS.map((word: string) => `request-${word}`),
  ];
  return [
    ...itemWords.flatMap(item =>
      ['none', '100', '503', '599'].flatMap(status => kinds.map(kind => `smoke-${item}-${status}-${kind}`))
    ),
    ...tokenDetails,
  ];
};
const withContentType = (contentType: string | null | undefined) =>
  smokeFailureDetails([{ name: 'health', ok: false, status: 503, contentType, failure: 'status mismatch' }])[0];

it('maps all thirteen smoke checklist names to distinct words', () => {
  expect(itemNames).toHaveLength(13);
  const words = itemNames.map(name => SMOKE_ITEM_WORDS[name]);
  expect(words.every(word => typeof word === 'string' && word !== 'other')).toBe(true);
  expect(new Set(words).size).toBe(13);
  expect(Object.keys(SMOKE_ITEM_WORDS).sort()).toEqual([...itemNames].sort());
  expect(Object.isFrozen(SMOKE_ITEM_WORDS)).toBe(true);
  expect(Object.isFrozen(SMOKE_KIND_WORDS)).toBe(true);
  expect(Object.isFrozen(SMOKE_STATUS_TYPE_WORDS)).toBe(true);
  expect(Object.isFrozen(SMOKE_REQUEST_CAUSE_WORDS)).toBe(true);
  expect(Object.isFrozen(SMOKE_TOKEN_CLASS_WORDS)).toBe(true);
});
it('turns only the failed checks into words and keeps their order', () => {
  const details = smokeFailureDetails([
    { name: 'health', ok: true, status: 200, contentType: 'text/plain' },
    { name: 'healthz', ok: false, status: 503, contentType: 'application/json', failure: 'status mismatch' },
    { name: 'readyz', ok: false, status: 200, failure: 'content type mismatch' },
    { name: 'static asset', ok: false, status: 200, failure: 'JSON structure mismatch' },
    { name: 'auth rejection', ok: false, status: 200, failure: 'invalid JSON response' },
    { name: 'inbox', ok: false, status: null, failure: 'request failed', cause: 'timeout' },
    { name: 'Queue enqueue', ok: false, status: null, failure: 'smoke queue token unavailable' },
    { name: 'Web Push public key', ok: false, status: 200, failure: 'unexpected' },
    { name: 'unknown item', ok: false, status: 99, failure: 'status mismatch' },
    { name: 'OGP PNG', ok: false, status: 600, failure: 'status mismatch', contentType: 'text/html' },
    { name: 'upload retrieval', ok: false, status: 503.5, failure: 'request failed', cause: 'secret.invalid' },
  ]);
  expect(details).toEqual([
    'smoke-healthz-503-status-json',
    'smoke-readyz-200-type',
    'smoke-asset-200-json',
    'smoke-auth-200-json',
    'smoke-inbox-none-request-timeout',
    'smoke-queue-none-token',
    'smoke-push-200-other',
    'smoke-other-none-status-none',
    'smoke-ogp-none-status-html',
    'smoke-upload-none-request-other',
  ]);
  expect(smokeFailureDetails([])).toEqual([]);
});
it('splits a status mismatch by the content type of the response', () => {
  expect(withContentType('text/plain')).toBe('smoke-health-503-status-text');
  expect(withContentType('application/json')).toBe('smoke-health-503-status-json');
  expect(withContentType('application/problem+json')).toBe('smoke-health-503-status-json');
  expect(withContentType('text/html')).toBe('smoke-health-503-status-html');
  expect(withContentType(null)).toBe('smoke-health-503-status-none');
  expect(withContentType('')).toBe('smoke-health-503-status-none');
  expect(withContentType(undefined)).toBe('smoke-health-503-status-none');
  expect(withContentType('application/xml')).toBe('smoke-health-503-status-other');
  expect(withContentType('secret/type')).toBe('smoke-health-503-status-other');
});
it('maps a request exception to one fixed cause word without reading its message', () => {
  const named = (name: string) => Object.assign(new Error('secret message'), { name });
  const coded = (code: string, message = 'secret message') => new Error('fetch failed', { cause: { code, message } });
  expect(smokeRequestCause(named('TimeoutError'))).toBe('timeout');
  expect(smokeRequestCause(named('AbortError'))).toBe('abort');
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'EAI_FAIL']) {
    expect(smokeRequestCause(coded(code)), code).toBe('dns');
  }
  for (
    const code of [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EPIPE',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
    ]
  ) expect(smokeRequestCause(coded(code)), code).toBe('connect');
  for (
    const code of [
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'ERR_TLS_HANDSHAKE_TIMEOUT',
      'ERR_SSL_WRONG_VERSION_NUMBER',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
    ]
  ) expect(smokeRequestCause(coded(code)), code).toBe('tls');
  expect(smokeRequestCause(new TypeError('fetch failed', { cause: new Error('unexpected redirect') }))).toBe(
    'redirect',
  );
  expect(smokeRequestCause(coded('EUNKNOWN'))).toBe('other');
  expect(smokeRequestCause(new Error(`connect ${fixtureHostname} ${fixtureToken}`))).toBe('other');
  expect(smokeRequestCause(new Error('x', { cause: 'ECONNREFUSED' }))).toBe('other');
  for (const value of [undefined, null, 'ECONNREFUSED', 3]) expect(smokeRequestCause(value)).toBe('other');
  expect(SMOKE_REQUEST_CAUSE_WORDS).toEqual(['timeout', 'abort', 'dns', 'connect', 'tls', 'redirect', 'other']);
});
it('classifies the smoke token by its shape without its value or exact length', () => {
  expect(smokeTokenDetail(undefined)).toBe('smoke-token-empty');
  expect(smokeTokenDetail(null)).toBe('smoke-token-empty');
  expect(smokeTokenDetail(5)).toBe('smoke-token-empty');
  expect(smokeTokenDetail('')).toBe('smoke-token-empty');
  expect(smokeTokenDetail('\n')).toBe('smoke-token-empty');
  expect(smokeTokenDetail(' \t\r\n')).toBe('smoke-token-empty');
  expect(smokeTokenDetail(`${'a'.repeat(20)}\n`)).toBe('smoke-token-ok');
  expect(smokeTokenDetail(`${'a'.repeat(20)}\r\n`)).toBe('smoke-token-ok');
  expect(smokeTokenDetail(`${'a'.repeat(20)} `)).toBe('smoke-token-ok');
  expect(smokeTokenDetail(`${'a'.repeat(20)} \t\n`)).toBe('smoke-token-ok');
  expect(smokeTokenDetail(` ${'a'.repeat(20)}`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`\n${'a'.repeat(20)}`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`\t${'a'.repeat(20)}\n`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`${'a'.repeat(10)} ${'b'.repeat(10)}`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`${'a'.repeat(10)}\r\n${'b'.repeat(10)}`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`${'a'.repeat(10)}\n${'b'.repeat(10)}`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`${'a'.repeat(10)}\t${'b'.repeat(10)}`)).toBe('smoke-token-space');
  expect(smokeTokenDetail(`${'a'.repeat(15)}\n`)).toBe('smoke-token-short');
  expect(smokeTokenDetail(`${'a'.repeat(1025)}\n`)).toBe('smoke-token-long');
  expect(smokeTokenDetail(`${'a'.repeat(1024)}\n`)).toBe('smoke-token-ok');
  expect(smokeTokenDetail(`${'a'.repeat(20)}\u00e9`)).toBe('smoke-token-charset');
  expect(smokeTokenDetail(`${'a'.repeat(20)}\u3042`)).toBe('smoke-token-charset');
  expect(smokeTokenDetail(`${'a'.repeat(20)}\u0001`)).toBe('smoke-token-charset');
  expect(smokeTokenDetail(`${'a'.repeat(10)}\u007f${'b'.repeat(10)}`)).toBe('smoke-token-charset');
  expect(smokeTokenDetail(`${'a'.repeat(10)}\u00a0${'b'.repeat(10)}`)).toBe('smoke-token-charset');
  expect(smokeTokenDetail(`\u3042${'a'.repeat(3)}`)).toBe('smoke-token-charset');
  expect(smokeTokenDetail('a'.repeat(15))).toBe('smoke-token-short');
  expect(smokeTokenDetail('a'.repeat(16))).toBe('smoke-token-ok');
  expect(smokeTokenDetail('a'.repeat(1024))).toBe('smoke-token-ok');
  expect(smokeTokenDetail('a'.repeat(1025))).toBe('smoke-token-long');
  expect(tokenDetails).toEqual([
    'smoke-token-empty',
    'smoke-token-space',
    'smoke-token-charset',
    'smoke-token-short',
    'smoke-token-long',
    'smoke-token-ok',
  ]);
});
it('accepts the fixed smoke words only', () => {
  for (
    const word of [
      'smoke-readyz-503-status-text',
      'smoke-readyz-503-status-other',
      'smoke-inbox-none-request-timeout',
      'smoke-webfinger-none-request-redirect',
      'smoke-readyz-200-type',
      'smoke-readyz-200-json',
      'smoke-queue-none-token',
      'smoke-other-100-other',
      'smoke-token-empty',
      'smoke-token-charset',
      'smoke-token-ok',
    ]
  ) {
    expect(isSmokeDetail(word), word).toBe(true);
  }
  for (
    const word of [
      'WebFinger',
      'smoke-WebFinger-503-status-text',
      'smoke-Readyz-503-status-text',
      'smoke-READYZ-503-STATUS-TEXT',
      'smoke-secret-503-status-text',
      'smoke-readyz-503-body',
      'smoke-readyz-99-status-text',
      'smoke-readyz-600-status-text',
      'smoke-readyz-None-status-text',
      'smoke-readyz-503-status',
      'smoke-readyz-503-status-xml',
      'smoke-readyz-503-status-text-extra',
      'smoke-inbox-none-request',
      'smoke-inbox-none-request-foo',
      'smoke-inbox-none-request-Timeout',
      'smoke-token-bad',
      'smoke-token-ok-extra',
      'smoke-token-',
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
    'smoke-token-ok',
    'smoke-readyz-503-status-json',
    'smoke-webfinger-200-json',
    'smoke-inbox-none-request-other',
  ]);
  const serialized = JSON.stringify([error.message, error.diagnostic]);
  for (const secret of [fixtureHostname, fixtureWorkerHostname, fixtureToken, fixtureBody, 'https://']) {
    expect(serialized).not.toContain(secret);
  }
});
it('reports a text/plain admission rejection as a 503 status mismatch of the text kind', async () => {
  const error = await failureOf(path => (path === '/readyz' ? reply(503, 'text/plain', fixtureBody) : undefined));
  expect(error.diagnostic?.details).toEqual(['smoke-token-ok', 'smoke-readyz-503-status-text']);
});
it('reports a content type mismatch of the real reviewed smoke', async () => {
  const error = await failureOf(path =>
    path === '/healthz' ? reply(200, 'text/html', { ok: true, service: 'iori' }) : undefined
  );
  expect(error.diagnostic?.details).toEqual(['smoke-token-ok', 'smoke-healthz-200-type']);
});
it('reports a response that cannot be read as JSON in the real reviewed smoke', async () => {
  const error = await failureOf(
    path => (path === '/manifest.json' ? reply(200, 'application/json', fixtureBody) : undefined),
  );
  expect(error.diagnostic?.details).toEqual(['smoke-token-ok', 'smoke-asset-200-json']);
  expect(JSON.stringify(error.diagnostic)).not.toContain(fixtureBody);
});
it('reports the cause of a failed request of the real reviewed smoke', async () => {
  const error = await failureOf(path => {
    if (path === '/health') return Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    if (path === '/healthz') {
      return new TypeError('fetch failed', { cause: { code: 'ENOTFOUND', message: fixtureHostname } });
    }
    if (path === '/readyz') return new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    if (path === '/manifest.json') return new TypeError('fetch failed', { cause: { code: 'CERT_HAS_EXPIRED' } });
    if (path === '/inbox') return new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
    return undefined;
  });
  expect(error.diagnostic?.details).toEqual([
    'smoke-token-ok',
    'smoke-health-none-request-timeout',
    'smoke-healthz-none-request-dns',
    'smoke-readyz-none-request-connect',
    'smoke-asset-none-request-tls',
    'smoke-inbox-none-request-redirect',
  ]);
  expect(JSON.stringify(error.diagnostic)).not.toContain(fixtureHostname);
});
it('puts the token class first and reports every item as token-unavailable when the smoke token is empty', async () => {
  const error = await failureOf(() => undefined, '');
  expect(error.diagnostic?.details).toEqual([
    'smoke-token-empty',
    ...itemNames.map(name => `smoke-${SMOKE_ITEM_WORDS[name]}-none-token`),
  ]);
});
it.each([
  [' padded-smoke-queue-token ', 'smoke-token-space'],
  [`${'a'.repeat(10)}\n${'b'.repeat(10)}`, 'smoke-token-space'],
  [`${'a'.repeat(20)}\u3042`, 'smoke-token-charset'],
  [`${'a'.repeat(20)}\u0001`, 'smoke-token-charset'],
  [`${'a'.repeat(15)}\n`, 'smoke-token-short'],
  ['short', 'smoke-token-short'],
  ['a'.repeat(1025), 'smoke-token-long'],
])('puts %j first as %s without the value', async (token, word) => {
  const error = await failureOf(() => reply(503, 'text/plain', fixtureBody), token);
  expect(error.diagnostic?.details?.[0]).toBe(word);
  expect(JSON.stringify(error.diagnostic)).not.toContain('padded');
});
it('keeps every possible word within the public workflow log pattern and 40 characters', () => {
  const words = allWords();
  expect(words.length).toBeGreaterThan(500);
  for (const word of words) {
    expect(isSmokeDetail(word), word).toBe(true);
    expect(word.length, word).toBeLessThanOrEqual(40);
    const own = `IORI_DIAG stage=cutover-smoke-worker program=none exit=none signal=none reason=${word}`;
    expect(own, word).toMatch(publicLine);
    expect(assertWorkflowOutput(own), word).toEqual([]);
  }
  expect(Math.max(...words.map(word => word.length))).toBe('smoke-webfinger-none-request-redirect'.length);
  expect('smoke-webfinger-none-request-redirect'.length).toBeLessThanOrEqual(40);
});
it('caps the printed details at the number of items plus the token class line', async () => {
  expect(SMOKE_MAX_DETAIL_LINES).toBe(Object.keys(SMOKE_ITEM_WORDS).length + 1);
  expect(SMOKE_MAX_DETAIL_LINES).toBe(14);
  const everyFailure = await failureOf(() => reply(503, 'text/plain', fixtureBody));
  const tokenFailure = await failureOf(() => undefined, '');
  expect(everyFailure.diagnostic?.details).toHaveLength(SMOKE_MAX_DETAIL_LINES);
  expect(tokenFailure.diagnostic?.details).toHaveLength(SMOKE_MAX_DETAIL_LINES);
  const lines = cutoverFailureLines('smoke-canonical', everyFailure, false);
  expect(lines).toHaveLength(SMOKE_MAX_DETAIL_LINES + 1);
  expect(lines[0]).toMatch(/reason=smoke-token-ok$/);
  expect(lines[1]).toMatch(/reason=smoke-health-503-status-text$/);
  for (const line of lines) {
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line)).toEqual([]);
  }
  expect(lines.at(-1)).toMatch(/reason=smoke-failed$/);
});
it.each([
  [undefined, 'smoke-token-empty'],
  ['', 'smoke-token-empty'],
  [' padded-smoke-queue-token ', 'smoke-token-space'],
  [`${'a'.repeat(10)}\n${'b'.repeat(10)}`, 'smoke-token-space'],
  [`${'a'.repeat(20)}\u3042`, 'smoke-token-charset'],
  [`${'a'.repeat(20)}\u0001`, 'smoke-token-charset'],
  [`${'a'.repeat(15)}\n`, 'smoke-token-short'],
  ['short', 'smoke-token-short'],
  ['a'.repeat(1025), 'smoke-token-long'],
])('rejects the malformed smoke token %j with the fixed reason %s and without its value', (token, word) => {
  let thrown: (Error & { diagnostic?: { reason: string } }) | undefined;
  try {
    assertSmokeQueueToken(token);
  } catch (error) {
    thrown = error as Error;
  }
  expect(thrown?.message).toBe('Smoke queue token is malformed.');
  expect(thrown?.diagnostic?.reason).toBe(word);
  expect(JSON.stringify([thrown?.message, thrown?.diagnostic])).not.toContain('padded');
  expect(JSON.stringify([thrown?.message, thrown?.diagnostic])).not.toContain('aaaa');
});
it.each([
  `${'a'.repeat(20)}\n`,
  `${'a'.repeat(20)}\r\n`,
  `${'a'.repeat(20)} `,
  'a'.repeat(20),
])('accepts the smoke token %j without throwing', (token) => {
  expect(() => assertSmokeQueueToken(token)).not.toThrow();
});
it('accepts a well-formed smoke token without throwing', () => {
  expect(() => assertSmokeQueueToken(fixtureToken)).not.toThrow();
  expect(() => assertSmokeQueueToken('a'.repeat(16))).not.toThrow();
  expect(() => assertSmokeQueueToken('a'.repeat(1024))).not.toThrow();
});
it('recognizes a failure whose every item is a 503 and ignores the token class line', () => {
  const every = smokeFailureDetails(
    itemNames.map(name => ({ name, ok: false, status: 503, contentType: 'text/plain', failure: 'status mismatch' })),
  ) as string[];
  expect(isAllSmokeServiceUnavailable(every)).toBe(true);
  expect(isAllSmokeServiceUnavailable(['smoke-token-ok', ...every])).toBe(true);
  expect(isAllSmokeServiceUnavailable(['smoke-token-empty', ...every])).toBe(true);
  expect(isAllSmokeServiceUnavailable(every.map(word => word.replace(/-text$/, '-json')))).toBe(true);
  expect(isAllSmokeServiceUnavailable(every.slice(1))).toBe(false);
  expect(
    isAllSmokeServiceUnavailable(every.map((word, index) => (index === 0 ? word.replace('-503-', '-500-') : word))),
  )
    .toBe(false);
  expect(isAllSmokeServiceUnavailable(every.map(word => word.replace('-503-status-text', '-200-type')))).toBe(false);
  expect(isAllSmokeServiceUnavailable(['smoke-token-ok'])).toBe(false);
  expect(isAllSmokeServiceUnavailable([])).toBe(false);
  expect(isAllSmokeServiceUnavailable(undefined)).toBe(false);
  expect(isAllSmokeServiceUnavailable('smoke-health-503-status-text')).toBe(false);
});
it('keeps the retry reasons within the public workflow log pattern', () => {
  for (const attempt of [1, 2, 3]) {
    const line =
      `IORI_DIAG stage=cutover-smoke-worker program=none exit=none signal=none reason=smoke-retry-${attempt}-all-503`;
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line)).toEqual([]);
  }
});
