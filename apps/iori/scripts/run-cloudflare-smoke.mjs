const DEFAULT_TIMEOUT_MS = 10_000;

const requiredBindings = {
  database: true,
  r2: true,
  kv: true,
  queue: true,
  assets: true,
  auth: true,
};

/**
 * The default paths use only staging fixture identifiers. A protected deploy
 * runner may replace these checks with paths created in its staging fixture.
 * None of the checks includes a request body or an authenticated credential.
 */
export const DEFAULT_STAGING_SMOKE_CHECKS = Object.freeze([
  { name: 'health', path: '/health', expectedStatus: 200, expectedContentType: 'text/plain' },
  {
    name: 'healthz',
    path: '/healthz',
    expectedStatus: 200,
    expectedContentType: 'application/json',
    json: [{ path: 'ok', equals: true }, { path: 'service', equals: 'iori' }],
  },
  {
    name: 'readyz',
    path: '/readyz',
    expectedStatus: 200,
    expectedContentType: 'application/json',
    json: [
      { path: 'ok', equals: true },
      ...Object.entries(requiredBindings).map(([path, equals]) => ({
        path: `bindings.${path}`,
        equals,
      })),
    ],
  },
  {
    name: 'static asset',
    path: '/manifest.json',
    expectedStatus: 200,
    expectedContentType: 'application/json',
    json: [{ path: 'name', type: 'string', minLength: 1 }],
  },
  {
    name: 'auth rejection',
    path: '/api/v1/home',
    expectedStatus: 401,
    expectedContentType: 'application/json',
    json: [{ path: 'error', type: 'string', minLength: 1 }],
  },
  {
    name: 'WebFinger',
    path: '/.well-known/webfinger?resource=acct:iori-smoke@example.invalid',
    expectedStatus: 200,
    expectedContentType: 'application/jrd+json',
    json: [{ path: 'subject', type: 'string', minLength: 1 }, { path: 'links', type: 'array' }],
  },
  {
    name: 'actor',
    path: '/users/iori-smoke',
    expectedStatus: 200,
    expectedContentType: 'application/activity+json',
    json: [{ path: 'id', type: 'string', minLength: 1 }, { path: 'type', type: 'string', minLength: 1 }],
  },
  {
    name: 'outbox',
    path: '/users/iori-smoke/outbox',
    expectedStatus: 200,
    expectedContentType: 'application/activity+json',
    json: [{ path: 'id', type: 'string', minLength: 1 }, { path: 'type', type: 'string', minLength: 1 }],
  },
  { name: 'inbox', path: '/inbox', expectedStatus: 405, expectedContentType: 'application/json' },
  {
    name: 'upload retrieval',
    path: '/uploads/00000000-0000-4000-8000-000000000000.png',
    expectedStatus: 200,
    expectedContentType: 'image/png',
  },
  {
    name: 'OGP PNG',
    path: '/api/og/articles/00000000-0000-4000-8000-000000000000',
    expectedStatus: 200,
    expectedContentType: 'image/png',
  },
  {
    name: 'Queue enqueue',
    path: '/__smoke__/queue-enqueue',
    method: 'POST',
    requiresSmokeQueueToken: true,
    expectedStatus: 200,
    expectedContentType: 'application/json',
    json: [{ path: 'accepted', equals: true }, { path: 'queue.enqueued', type: 'number' }],
  },
  {
    name: 'Web Push public key',
    path: '/api/v1/push/vapid-public-key',
    expectedStatus: 200,
    expectedContentType: 'application/json',
    json: [{ path: 'publicKey', type: 'string', minLength: 1 }],
  },
]);

const mandatoryCheck = (check, { omitPath = false, omitContentType = false } = {}) =>
  JSON.stringify({
    name: check.name,
    ...(!omitPath && { path: check.path }),
    method: check.method,
    requiresSmokeQueueToken: check.requiresSmokeQueueToken,
    expectedStatus: check.expectedStatus,
    ...(!omitContentType && { expectedContentType: check.expectedContentType }),
    json: check.json,
  });

const customizableCheckNames = new Set(['WebFinger', 'actor', 'outbox', 'upload retrieval', 'OGP PNG']);
const mandatoryCheckNames = new Set(DEFAULT_STAGING_SMOKE_CHECKS.map((check) => check.name));
const uuidPath = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const validCustomizableRoutes = (checks) => {
  const byName = Object.fromEntries(checks.map((check) => [check.name, check]));
  const webFinger = byName.WebFinger?.path.match(/^\/\.well-known\/webfinger\?resource=acct:([^@/?#]+)@([^/?#]+)$/);
  const actor = byName.actor?.path.match(/^\/users\/([^/?#]+)$/);
  const outbox = byName.outbox?.path.match(/^\/users\/([^/?#]+)\/outbox$/);
  const upload = byName['upload retrieval'];
  const uploadMatch = upload?.path.match(new RegExp(`^/uploads/${uuidPath}\\.(gif|jpe?g|png|webp)$`, 'i'));
  const expectedUploadContentType = uploadMatch === null || uploadMatch === undefined ? undefined : ({
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  })[uploadMatch[1].toLowerCase()];
  return webFinger !== null && webFinger !== undefined
    && actor !== null && actor !== undefined
    && outbox !== null && outbox !== undefined
    && webFinger[1] === actor[1] && actor[1] === outbox[1]
    && upload?.expectedContentType === expectedUploadContentType
    && new RegExp(`^/api/og/articles/${uuidPath}$`, 'i').test(byName['OGP PNG']?.path ?? '');
};

const contentTypeOf = (response) =>
  response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? null;

const valueAt = (value, path) =>
  path.split('.').reduce((current, segment) => (
    current !== null && typeof current === 'object' && segment in current ? current[segment] : undefined
  ), value);

const matchesJsonRequirement = (value, requirement) => {
  const actual = valueAt(value, requirement.path);
  if (Object.hasOwn(requirement, 'equals') && actual !== requirement.equals) return false;
  if (
    requirement.type === 'array'
      ? !Array.isArray(actual)
      : requirement.type !== undefined && typeof actual !== requirement.type
  ) return false;
  return requirement.minLength === undefined || typeof actual !== 'string' || actual.length >= requirement.minLength;
};

const privateOrLocalHost = (hostname) =>
  hostname === 'localhost'
  || hostname === '::1'
  || hostname.startsWith('127.')
  || hostname.startsWith('10.')
  || hostname.startsWith('192.168.')
  || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  || /^fc|^fd|^fe80/i.test(hostname);

const validateInput = ({ baseUrl, expectedOrigin, checks, allowedHostname, allowLocalFixture = false }) => {
  const base = new URL(baseUrl);
  const expected = new URL(expectedOrigin);
  const origin = expected.origin;
  if (base.origin !== origin) throw new Error('baseUrl origin must match expectedOrigin');
  if (allowLocalFixture) {
    if (base.protocol !== 'http:' || !privateOrLocalHost(base.hostname)) {
      throw new Error('local fixture origin is invalid');
    }
  } else if (
    base.protocol !== 'https:'
    || privateOrLocalHost(base.hostname)
    || typeof allowedHostname !== 'string'
    || allowedHostname.length === 0
    || base.hostname.toLowerCase() !== allowedHostname.toLowerCase()
  ) throw new Error('protected smoke origin is invalid');
  if (!Array.isArray(checks) || checks.length === 0) throw new Error('checks must be a non-empty array');
  for (const check of checks) {
    if (typeof check?.name !== 'string' || typeof check.path !== 'string' || !check.path.startsWith('/')) {
      throw new Error('each check requires a name and origin-relative path');
    }
    if (!Number.isInteger(check.expectedStatus)) throw new Error('each check requires an expected status');
    if (typeof check.expectedContentType !== 'string') throw new Error('each check requires an expected content type');
    if (check.method !== undefined && !['GET', 'POST'].includes(check.method)) {
      throw new Error('check method must be GET or POST');
    }
    if (new URL(check.path, base).origin !== origin) throw new Error('check path must remain on expectedOrigin');
  }
  const coversMandatoryChecks = DEFAULT_STAGING_SMOKE_CHECKS.every((required) =>
    checks.some((check) =>
      mandatoryCheck(check, {
        omitPath: customizableCheckNames.has(required.name),
        omitContentType: required.name === 'upload retrieval',
      }) === mandatoryCheck(required, {
        omitPath: customizableCheckNames.has(required.name),
        omitContentType: required.name === 'upload retrieval',
      })
    )
  );
  const mandatoryChecksHaveUniqueNames = checks.filter((check) => mandatoryCheckNames.has(check.name)).length
    === mandatoryCheckNames.size;
  if (!coversMandatoryChecks || !mandatoryChecksHaveUniqueNames || !validCustomizableRoutes(checks)) {
    throw new Error('checks must cover the mandatory Iori smoke checklist');
  }
  return { base, origin };
};

const checkResponse = async (response, check) => {
  const contentType = contentTypeOf(response);
  if (response.status !== check.expectedStatus) {
    return { name: check.name, ok: false, status: response.status, contentType, failure: 'status mismatch' };
  }
  if (contentType !== check.expectedContentType) {
    return { name: check.name, ok: false, status: response.status, contentType, failure: 'content type mismatch' };
  }
  if (check.json === undefined) return { name: check.name, ok: true, status: response.status, contentType };

  try {
    const json = await response.json();
    if (!check.json.every((requirement) => matchesJsonRequirement(json, requirement))) {
      return { name: check.name, ok: false, status: response.status, contentType, failure: 'JSON structure mismatch' };
    }
  } catch {
    return { name: check.name, ok: false, status: response.status, contentType, failure: 'invalid JSON response' };
  }
  return { name: check.name, ok: true, status: response.status, contentType };
};

/**
 * Checks status, content type, and structural JSON only. SmokeResult stores
 * neither response bodies nor URLs, so it is safe to add to a workflow summary.
 */
export const runCloudflareSmoke = async (
  {
    baseUrl,
    expectedOrigin,
    checks,
    smokeQueueToken,
    allowedHostname,
    allowLocalFixture = false,
    fetchRequest = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  },
) => {
  const { base } = validateInput({ baseUrl, expectedOrigin, checks, allowedHostname, allowLocalFixture });
  const results = [];

  for (const check of checks) {
    if (
      (typeof smokeQueueToken !== 'string' || smokeQueueToken.length === 0)
    ) {
      results.push({
        name: check.name,
        ok: false,
        status: null,
        contentType: null,
        failure: 'smoke queue token unavailable',
      });
      continue;
    }
    try {
      const headers = new Headers();
      headers.set('x-iori-smoke-token', smokeQueueToken);
      headers.set('Accept', check.expectedContentType);
      const response = await fetchRequest(new URL(check.path, base), {
        method: check.method ?? 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      results.push(await checkResponse(response, check));
    } catch {
      results.push({ name: check.name, ok: false, status: null, contentType: null, failure: 'request failed' });
    }
  }

  return { ok: results.every((result) => result.ok), checks: results };
};

export const formatSmokeResult = (result) =>
  result.checks.map((check) =>
    [
      `${check.ok ? 'PASS' : 'FAIL'} ${check.name}`,
      `status=${check.status ?? 'unavailable'}`,
      `content_type=${check.contentType ?? 'missing'}`,
      ...(check.failure === undefined ? [] : [`reason=${check.failure}`]),
    ].join(' ')
  ).join('\n');

const valueFor = (argv, name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

export const runCli = async (argv = process.argv.slice(2)) => {
  const baseUrl = valueFor(argv, '--base-url');
  const expectedOrigin = valueFor(argv, '--expected-origin') ?? baseUrl;
  if (baseUrl === undefined || expectedOrigin === undefined) {
    throw new Error('base URL and expected origin are required');
  }
  const checksJson = valueFor(argv, '--checks-json');
  const checks = checksJson === undefined ? DEFAULT_STAGING_SMOKE_CHECKS : JSON.parse(checksJson);
  if (argv.some((argument) => argument === '--smoke-queue-token' || argument.startsWith('--smoke-queue-token='))) {
    throw new Error('Smoke credentials must use the protected environment.');
  }
  const smokeQueueToken = process.env.IORI_SMOKE_QUEUE_TOKEN;
  const result = await runCloudflareSmoke({
    baseUrl,
    expectedOrigin,
    checks,
    smokeQueueToken,
    allowedHostname: valueFor(argv, '--allowed-hostname'),
  });
  process.stdout.write(`${formatSmokeResult(result)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch(() => {
    process.stderr.write('Cloudflare smoke runner input was invalid.\n');
    process.exitCode = 1;
  });
}
