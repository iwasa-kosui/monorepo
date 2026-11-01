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
const lookup = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : OTHER_WORD);
const statusWord = (status) => (Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : 'none');
const alternatives = (words) => [...new Set([...words, OTHER_WORD])].join('|');
const smokeDetailPattern = new RegExp(
  `^smoke-(?:${alternatives(Object.values(SMOKE_ITEM_WORDS))})-(?:[1-5]\\d{2}|none)-(?:${
    alternatives(Object.values(SMOKE_KIND_WORDS))
  })$`,
);

export const smokeFailureDetails = (checks) =>
  (Array.isArray(checks) ? checks : [])
    .filter((check) => check?.ok !== true)
    .map((check) =>
      `smoke-${lookup(SMOKE_ITEM_WORDS, check?.name)}-${statusWord(check?.status)}-${
        lookup(SMOKE_KIND_WORDS, check?.failure)
      }`
    );

export const isSmokeDetail = (value) => typeof value === 'string' && smokeDetailPattern.test(value);
