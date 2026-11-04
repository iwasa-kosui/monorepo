import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';

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
