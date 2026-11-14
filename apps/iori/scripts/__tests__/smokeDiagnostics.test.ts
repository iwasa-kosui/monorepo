import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
// @ts-expect-error The smoke runner is executed directly by Node as ESM.
import { DEFAULT_STAGING_SMOKE_CHECKS } from '../run-cloudflare-smoke.mjs';
import {
  assertSmokeQueueToken,
  isAllSmokeServiceUnavailable,
  isSmokeDetail,
  SMOKE_ITEM_WORDS,
  SMOKE_REQUEST_CAUSE_WORDS,
  SMOKE_STATUS_TYPE_WORDS,
  SMOKE_TOKEN_CLASS_WORDS,
  smokeFailureDetails,
  smokeRequestCause,
  smokeTokenDetail,
  // @ts-expect-error The smoke diagnostics module is executed directly by Node as ESM.
} from '../smoke-diagnostics.mjs';

const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const fixtureHostname = 'smoke-fixture-host.example';
const fixtureToken = 'fixture-smoke-queue-token';
const itemNames = DEFAULT_STAGING_SMOKE_CHECKS.map((check: { name: string }) => check.name) as string[];

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
