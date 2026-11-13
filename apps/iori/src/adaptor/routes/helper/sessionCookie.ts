import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';

import type { SessionId } from '../../../domain/session/sessionId.ts';

export const setSessionCookie = (c: Context, sessionId: SessionId): void => {
  setCookie(c, 'sessionId', sessionId, {
    httpOnly: true,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    sameSite: 'lax',
    secure: true,
  });
};

export const deleteSessionCookie = (c: Context): void => {
  deleteCookie(c, 'sessionId', { path: '/', secure: true });
};
