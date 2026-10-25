import { z } from 'zod';

const hostname = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const identitySchema = z.object({
  environment: z.enum(['production', 'staging', 'local']),
  generation: z.string().regex(/^[a-z][a-z0-9]{7,19}$/),
  mainSha: z.string().regex(/^[a-f0-9]{40}$/),
  runId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  hostname,
  workerHostname: hostname,
  smoke: z.object({
    username: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    uploadFilename: z.string().regex(new RegExp(`^${uuid}\\.(gif|jpe?g|png|webp)$`)),
    articleId: z.string().regex(new RegExp(`^${uuid}$`)),
  }).strict(),
}).strict();
const modeSchema = z.enum(['sealed', 'smoke', 'active']);
type AdmissionEnvironment = Readonly<
  {
    IORI_ADMISSION_IDENTITY?: string;
    IORI_ADMISSION_MODE?: string;
    ORIGIN?: string;
    SMOKE_QUEUE_TOKEN?: string;
    STAGING_ACCESS_TOKEN?: string;
  }
>;
export type AdmissionIdentity = Readonly<z.infer<typeof identitySchema> & { mode: z.infer<typeof modeSchema> }>;
export const parseAdmission = (env: AdmissionEnvironment): AdmissionIdentity | undefined => {
  try {
    const identity = identitySchema.safeParse(JSON.parse(env.IORI_ADMISSION_IDENTITY ?? 'null'));
    const mode = modeSchema.safeParse(env.IORI_ADMISSION_MODE);
    if (!identity.success || !mode.success) return undefined;
    const origin = new URL(env.ORIGIN ?? '');
    const value = identity.data;
    if (value.environment === 'local') {
      if (
        value.hostname !== 'localhost' || origin.protocol !== 'http:' || origin.hostname !== 'localhost'
        || origin.origin !== env.ORIGIN || value.generation !== 'fixture1'
        || value.workerHostname !== 'iori-local-fixture1.fixture.workers.dev'
      ) return undefined;
      return { ...value, mode: mode.data };
    }
    if (
      origin.protocol !== 'https:' || origin.host !== value.hostname || origin.origin !== env.ORIGIN
      || !value.workerHostname.startsWith(`iori-${value.environment}-${value.generation}.`)
      || !value.workerHostname.endsWith('.workers.dev') || value.hostname.endsWith('.workers.dev')
    ) return undefined;
    return { ...value, mode: mode.data };
  } catch {
    return undefined;
  }
};
const tokenMatches = async (actual: string | null, expected: string | undefined) => {
  if (!actual || !expected || expected.length < 16 || actual.length > 1024) return false;
  // Compare fixed-length digests; never log credentials or include them in control responses.
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [actual, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  );
  const left = new Uint8Array(a!);
  const right = new Uint8Array(b!);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
};
const smokePath = (request: Request, identity: AdmissionIdentity) => {
  const url = new URL(request.url);
  if (request.method === 'POST') {
    return url.pathname === '/__smoke__/queue-enqueue' && !url.search && request.body === null;
  }
  if (request.method !== 'GET' || request.headers.has('cookie') || request.headers.has('authorization')) return false;
  if (url.pathname === '/.well-known/webfinger') {
    return url.searchParams.size === 1
      && url.searchParams.get('resource') === `acct:${identity.smoke.username}@${identity.hostname}`;
  }
  const paths = [
    '/health',
    '/healthz',
    '/readyz',
    '/manifest.json',
    '/api/v1/home',
    '/inbox',
    '/api/v1/push/vapid-public-key',
    `/users/${identity.smoke.username}`,
    `/users/${identity.smoke.username}/outbox`,
    `/uploads/${identity.smoke.uploadFilename}`,
    `/api/og/articles/${identity.smoke.articleId}`,
  ];
  return !url.search && paths.includes(url.pathname);
};
export const admitWorkerRequest = async (request: Request, env: AdmissionEnvironment) => {
  const identity = parseAdmission(env);
  if (!identity || identity.mode === 'sealed') return undefined;
  const url = new URL(request.url);
  if (identity.environment === 'local') {
    return identity.mode === 'active' && url.origin === env.ORIGIN
      ? { capability: 'active', identity } as const
      : undefined;
  }
  if (url.protocol !== 'https:' || ![identity.hostname, identity.workerHostname].includes(url.host)) return undefined;
  if (
    smokePath(request, identity) && await tokenMatches(request.headers.get('x-iori-smoke-token'), env.SMOKE_QUEUE_TOKEN)
  ) return { capability: 'smoke', identity } as const;
  if (identity.mode === 'active' && url.host === identity.hostname) {
    if (identity.environment === 'production') return { capability: 'active', identity } as const;
    if (
      env.STAGING_ACCESS_TOKEN !== env.SMOKE_QUEUE_TOKEN
      && await tokenMatches(request.headers.get('x-iori-staging-token'), env.STAGING_ACCESS_TOKEN)
    ) return { capability: 'active', identity } as const;
  }
  return undefined;
};
export const smokeMarker = (identity: AdmissionIdentity) => ({
  type: 'iori-smoke',
  schema: 1,
  environment: identity.environment,
  generation: identity.generation,
  mainSha: identity.mainSha,
  runId: identity.runId,
});
export const isSmokeMarker = (value: unknown, identity: AdmissionIdentity) => {
  const expected = smokeMarker(identity);
  return value !== null && typeof value === 'object' && Object.keys(value).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, item]) => Reflect.get(value, key) === item);
};
export const admissionRejected = () =>
  new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
