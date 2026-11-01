import { withReason } from './target-preparation-diagnostics.mjs';

export const SMOKE_ITEM_WORDS = Object.freeze({
  health: 'health',
  healthz: 'healthz',
  readyz: 'readyz',
  'static asset': 'asset',
  'auth rejection': 'auth',
  WebFinger: 'webfinger',
  actor: 'actor',
  outbox: 'outbox',
  inbox: 'inbox',
  'upload retrieval': 'upload',
  'OGP PNG': 'ogp',
  'Queue enqueue': 'queue',
  'Web Push public key': 'push',
});
export const SMOKE_KIND_WORDS = Object.freeze({
  'status mismatch': 'status',
  'content type mismatch': 'type',
  'JSON structure mismatch': 'json',
  'invalid JSON response': 'json',
  'request failed': 'request',
  'smoke queue token unavailable': 'token',
});
const OTHER_WORD = 'other';
export const SMOKE_STATUS_TYPE_WORDS = Object.freeze(['text', 'json', 'html', 'none', OTHER_WORD]);
export const SMOKE_REQUEST_CAUSE_WORDS = Object.freeze([
  'timeout',
  'abort',
  'dns',
  'connect',
  'tls',
  'redirect',
  OTHER_WORD,
]);
export const SMOKE_TOKEN_CLASS_WORDS = Object.freeze(['empty', 'space', 'charset', 'short', 'long', 'ok']);
export const SMOKE_MAX_DETAIL_LINES = Object.keys(SMOKE_ITEM_WORDS).length + 1;
const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 1024;
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'EAI_FAIL']);
const CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const lookup = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : OTHER_WORD);
const statusWord = (status) => (Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : 'none');
const alternatives = (words) => [...new Set([...words, OTHER_WORD])].join('|');
const contentTypeWord = (contentType) => {
  if (typeof contentType !== 'string' || contentType === '') return 'none';
  if (contentType === 'text/plain') return 'text';
  if (contentType === 'application/json' || contentType.endsWith('+json')) return 'json';
  if (contentType === 'text/html') return 'html';
  return OTHER_WORD;
};
const causeWord = (cause) => (SMOKE_REQUEST_CAUSE_WORDS.includes(cause) ? cause : OTHER_WORD);
const kindWord = (check) => {
  const kind = lookup(SMOKE_KIND_WORDS, check?.failure);
  if (kind === 'status') return `status-${contentTypeWord(check.contentType)}`;
  if (kind === 'request') return `request-${causeWord(check.cause)}`;
  return kind;
};
const plainKindWords = Object.values(SMOKE_KIND_WORDS).filter((word) => word !== 'status' && word !== 'request');
const smokeDetailPattern = new RegExp(
  `^smoke-(?:(?:${alternatives(Object.values(SMOKE_ITEM_WORDS))})-(?:[1-5]\\d{2}|none)-(?:${
    alternatives(plainKindWords)
  }|status-(?:${SMOKE_STATUS_TYPE_WORDS.join('|')})|request-(?:${SMOKE_REQUEST_CAUSE_WORDS.join('|')}))|token-(?:${
    SMOKE_TOKEN_CLASS_WORDS.join('|')
  }))$`,
);

export const smokeRequestCause = (error) => {
  if (error?.name === 'TimeoutError') return 'timeout';
  if (error?.name === 'AbortError') return 'abort';
  const cause = error?.cause;
  const code = cause?.code;
  if (typeof code === 'string') {
    if (DNS_CODES.has(code)) return 'dns';
    if (CONNECT_CODES.has(code)) return 'connect';
    if (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_') || TLS_CODES.has(code)) return 'tls';
  }
  return cause?.message === 'unexpected redirect' ? 'redirect' : OTHER_WORD;
};

export const smokeTokenDetail = (input) => {
  const token = typeof input === 'string' ? input.replace(/[\t\n\r ]+$/, '') : '';
  if (token.length === 0) return 'smoke-token-empty';
  if (/[\t\n\r ]/.test(token)) return 'smoke-token-space';
  if (!/^[\x21-\x7e]+$/.test(token)) return 'smoke-token-charset';
  if (token.length < MIN_TOKEN_LENGTH) return 'smoke-token-short';
  return token.length > MAX_TOKEN_LENGTH ? 'smoke-token-long' : 'smoke-token-ok';
};

export const smokeFailureDetails = (checks) =>
  (Array.isArray(checks) ? checks : [])
    .filter((check) => check?.ok !== true)
    .map((check) => `smoke-${lookup(SMOKE_ITEM_WORDS, check?.name)}-${statusWord(check?.status)}-${kindWord(check)}`);

export const assertSmokeQueueToken = (token) => {
  const detail = smokeTokenDetail(token);
  if (detail === 'smoke-token-ok') return;
  throw withReason(new Error('Smoke queue token is malformed.'), detail);
};

export const isSmokeDetail = (value) => typeof value === 'string' && smokeDetailPattern.test(value);

const itemWords = Object.values(SMOKE_ITEM_WORDS);
const unavailableDetailPattern = new RegExp(
  `^smoke-(${itemWords.join('|')})-503-status-(?:${SMOKE_STATUS_TYPE_WORDS.join('|')})$`,
);

export const isAllSmokeServiceUnavailable = (details) => {
  if (!Array.isArray(details)) return false;
  const seen = new Set();
  for (const detail of details) {
    const match = typeof detail === 'string' ? unavailableDetailPattern.exec(detail) : null;
    if (match) seen.add(match[1]);
  }
  return itemWords.every((word) => seen.has(word));
};
