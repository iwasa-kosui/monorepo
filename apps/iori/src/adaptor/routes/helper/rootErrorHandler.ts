import type { ErrorHandler } from 'hono';

import { renderErrorPage } from '../../../errorPage.ts';
import { describeErrorForLog, internalServerError } from './mastodonErrors.ts';

const plainTextError = (): Response =>
  new Response('Internal Server Error', {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
  });

export const rootErrorHandler: ErrorHandler = (err, c) => {
  if ('getResponse' in err && typeof err.getResponse === 'function') {
    return err.getResponse();
  }
  const { pathname } = new URL(c.req.url);
  console.error('Request failed.', {
    method: c.req.method,
    path: pathname,
    error: describeErrorForLog(err),
  });
  if (pathname.startsWith('/api/') || pathname.startsWith('/oauth/')) {
    return c.json(internalServerError, 500);
  }
  const accept = c.req.header('Accept') ?? '';
  if (accept.includes('application/activity+json') || accept.includes('application/ld+json')) {
    return plainTextError();
  }
  if (accept.includes('text/html')) {
    return c.html(renderErrorPage(pathname), 500);
  }
  return plainTextError();
};
