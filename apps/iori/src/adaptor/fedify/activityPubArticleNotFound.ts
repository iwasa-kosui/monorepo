import type { Federation } from '@fedify/fedify';
import type { Context, MiddlewareHandler } from 'hono';

const ARTICLE_OBJECT_PATH = /^\/users\/[^/]+\/articles\/[^/]+$/;
const ACTIVITY_STREAMS_PROFILE = 'https://www.w3.org/ns/activitystreams';

const parseMediaRange = (range: string) => {
  const [type = '', ...params] = range.split(';').map((part) => part.trim());
  const parameters = new Map<string, string>();
  for (const param of params) {
    const separator = param.indexOf('=');
    if (separator < 0) continue;
    parameters.set(
      param.slice(0, separator).trim().toLowerCase(),
      param.slice(separator + 1).trim().replace(/^"|"$/g, ''),
    );
  }
  const quality = Number(parameters.get('q') ?? '1');
  return { type: type.toLowerCase(), parameters, quality: Number.isNaN(quality) ? 0 : quality };
};

const prefersActivityPub = (accept: string | null): boolean => {
  if (accept === null) return false;
  const preferred = accept
    .split(',')
    .map(parseMediaRange)
    .filter((range) => range.quality > 0)
    .reduce<ReturnType<typeof parseMediaRange> | undefined>(
      (best, range) => best === undefined || range.quality > best.quality ? range : best,
      undefined,
    );
  if (preferred === undefined) return false;
  if (preferred.type === 'application/activity+json') return true;
  return preferred.type === 'application/ld+json'
    && preferred.parameters.get('profile')?.split(/\s+/).includes(ACTIVITY_STREAMS_PROFILE) === true;
};

export const isActivityPubArticleRequest = (request: Request): boolean =>
  ARTICLE_OBJECT_PATH.test(new URL(request.url).pathname) && prefersActivityPub(request.headers.get('Accept'));

export const federationWithArticleNotFound = <TContextData>(
  federation: Federation<TContextData>,
  contextDataFactory: (c: Context) => TContextData | Promise<TContextData>,
): MiddlewareHandler =>
async (c, next) =>
  federation.fetch(c.req.raw, {
    contextData: await contextDataFactory(c),
    async onNotFound(request) {
      if (isActivityPubArticleRequest(request)) return new Response('Not Found', { status: 404 });
      await next();
      return c.res;
    },
    async onNotAcceptable() {
      await next();
      if (c.res.status !== 404) return c.res;
      return new Response('Not acceptable', {
        status: 406,
        headers: { 'Content-Type': 'text/plain', Vary: 'Accept' },
      });
    },
  });
