import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorHandler } from 'hono';

import { renderErrorPage } from '../../../errorPage.ts';
import { describeErrorForLog, internalServerError } from './mastodonErrors.ts';

const plainTextError = (): Response =>
  new Response('Internal Server Error', {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
  });

const stackForLog = (err: unknown): string | undefined => {
  if (err instanceof DrizzleQueryError) {
    return err.cause instanceof Error ? err.cause.stack : undefined;
  }
  return err instanceof Error ? err.stack : undefined;
};

export const rootErrorHandler: ErrorHandler = (err, c) => {
  if ('getResponse' in err && typeof err.getResponse === 'function') {
    return err.getResponse();
  }
  const { pathname } = new URL(c.req.url);
  console.error('Request failed.', {
    method: c.req.method,
    path: pathname,
    error: describeErrorForLog(err),
    stack: stackForLog(err),
  });
  const accept = c.req.header('Accept') ?? '';
  if (pathname.startsWith('/api/')) {
    return c.json(internalServerError, 500);
  }
  if (pathname.startsWith('/oauth/') && !accept.includes('text/html')) {
    return c.json(internalServerError, 500);
  }
  if (accept.includes('application/activity+json') || accept.includes('application/ld+json')) {
    return plainTextError();
  }
  if (accept.includes('text/html')) {
    return c.html(renderErrorPage(), 500);
  }
  return plainTextError();
};
