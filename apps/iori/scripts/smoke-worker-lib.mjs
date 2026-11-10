const expectStatus = async (fetchRequest, origin, path, expectedStatus, init) => {
  const response = await fetchRequest(new URL(path, origin), init);
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return response;
};

const expectJson = async (response, path) => {
  try {
    return await response.json();
  } catch {
    throw new Error(`${path} did not return JSON`);
  }
};

export const runSmokeChecks = async (origin, fetchRequest = fetch) => {
  const health = await expectStatus(fetchRequest, origin, '/health', 200);
  if ((await health.text()).trim() !== 'OK') throw new Error('/health did not return OK');
  const healthz = await expectJson(await expectStatus(fetchRequest, origin, '/healthz', 200), '/healthz');
  if (healthz.ok !== true || healthz.service !== 'iori') throw new Error('/healthz returned an invalid payload');
  const readiness = await expectJson(await expectStatus(fetchRequest, origin, '/readyz', 200), '/readyz');
  const requiredBindings = ['database', 'r2', 'kv', 'queue', 'assets', 'auth'];
  if (readiness.ok !== true || requiredBindings.some((name) => readiness.bindings?.[name] !== true)) {
    throw new Error('/readyz reported an unavailable binding');
  }
  const root = await expectStatus(fetchRequest, origin, '/', 200);
  if (!(root.headers.get('Content-Type') ?? '').includes('text/html')) throw new Error('/ did not return HTML');
  const rootHtml = await root.text();
  if (rootHtml.includes('noindex') || rootHtml.includes('移行中')) throw new Error('/ returned the migration shell');
  if (!rootHtml.includes('/static/home.js')) throw new Error('/ did not load the home client asset');
  await expectStatus(fetchRequest, origin, '/manifest.json', 200);
  await expectStatus(fetchRequest, origin, '/api/v1/home', 401);
  await expectStatus(fetchRequest, origin, '/api/v1/sign-in', 400, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const push = await expectJson(
    await expectStatus(fetchRequest, origin, '/api/v1/push/vapid-public-key', 200),
    '/api/v1/push/vapid-public-key',
  );
  if (typeof push.publicKey !== 'string' || push.publicKey.length === 0) {
    throw new Error('/api/v1/push/vapid-public-key returned no key');
  }
  await expectStatus(fetchRequest, origin, '/api/og/articles/00000000-0000-4000-8000-000000000000', 404);
  const webfinger = await expectStatus(
    fetchRequest,
    origin,
    '/.well-known/webfinger?resource=acct:__iori_smoke__@invalid.example',
    404,
  );
  if ((webfinger.headers.get('Content-Type') ?? '').includes('text/html')) {
    throw new Error('/.well-known/webfinger fell through to an HTML page');
  }
};
