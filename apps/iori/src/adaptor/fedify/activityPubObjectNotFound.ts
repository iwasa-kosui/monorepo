import type { Federation } from '@fedify/fedify';
import type { Context, MiddlewareHandler } from 'hono';

const OBJECT_PATH = /^\/users\/[^/]+\/(?:articles|posts)\/[^/]+$/;
const INBOX_PATH = /^(?:\/users\/[^/]+)?\/inbox$/;
const MEDIA_TYPE = /^\s*([^\s/;]+)\/([^;\s]+)\s*(?:;(.*))?$/;

const preferredMediaTypes = (accept: string): string[] =>
  accept
    .split(',')
    .flatMap((part, index) => {
      const match = MEDIA_TYPE.exec(part.trim());
      if (match === null) return [];
      let quality = 1;
      for (const param of (match[3] ?? '').split(';')) {
        const [key, value] = param.trim().split('=');
        if (key?.toLowerCase() !== 'q' || !value) continue;
        quality = parseFloat(value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);
        break;
      }
      return quality > 0 ? [{ fullType: `${match[1]}/${match[2]}`, quality, index }] : [];
    })
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((spec) => spec.fullType);

const prefersActivityPub = (accept: string | null): boolean => {
  const types = accept ? preferredMediaTypes(accept) : ['*/*'];
  if (types[0] === 'text/html' || types[0] === 'application/xhtml+xml') return false;
  return types.includes('application/activity+json')
    || types.includes('application/ld+json')
    || types.includes('application/json');
};

export const isActivityPubObjectRequest = (request: Request): boolean =>
  OBJECT_PATH.test(new URL(request.url).pathname) && prefersActivityPub(request.headers.get('Accept'));

export const federationWithObjectNotFound = <TContextData>(
  federation: Federation<TContextData>,
  contextDataFactory: (c: Context) => TContextData | Promise<TContextData>,
): MiddlewareHandler =>
async (c, next) => {
  if (c.req.method === 'POST' && !INBOX_PATH.test(c.req.path)) return next();
  return federation.fetch(c.req.raw, {
    contextData: await contextDataFactory(c),
    async onNotFound(request) {
      if (isActivityPubObjectRequest(request)) {
        return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain', Vary: 'Accept' } });
      }
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
};
