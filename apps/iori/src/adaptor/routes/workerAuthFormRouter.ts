import type { Context } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { Password } from '../../domain/password/password.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import { resolveNextPath } from '../../helper/signInNext.ts';
import type { createSignInUseCase } from '../../useCase/signIn.ts';
import type { SignOutUseCase } from '../../useCase/signOut.ts';
import type { createSignUpUseCase } from '../../useCase/signUp.ts';
import { deleteSessionCookie, setSessionCookie } from './helper/sessionCookie.ts';
import { isSameOriginRequest } from './mastodonAuthn.ts';

export type WorkerAuthFormRouterDeps = Readonly<{
  signInUseCase: ReturnType<typeof createSignInUseCase>;
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  signOutUseCase: SignOutUseCase;
  createContext: (request: Request) => Context<unknown>;
}>;

const signInErrorUrl = (error: 'invalid_credentials' | 'invalid_input', next: string): string =>
  `/sign-in?error=${error}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`;

const rawNext = (data: unknown): string | null => {
  const value: unknown = typeof data === 'object' && data !== null ? Reflect.get(data, 'next') : undefined;
  return typeof value === 'string' ? value : null;
};

export const createWorkerAuthFormRouter = ({
  signInUseCase,
  signUpUseCase,
  signOutUseCase,
  createContext,
}: WorkerAuthFormRouterDeps): Hono =>
  new Hono()
    .post(
      '/sign-in',
      async (c, next) => {
        if (!isSameOriginRequest(c.req.raw)) return c.json({ error: 'Forbidden' }, 403);
        await next();
      },
      sValidator(
        'form',
        z.object({
          username: Username.zodType,
          password: Password.zodType,
          next: z.string().optional(),
        }),
        (result, c) => {
          if (result.success) return undefined;
          const next = resolveNextPath(rawNext(result.data), new URL(c.req.url).origin);
          return c.redirect(signInErrorUrl('invalid_input', next), 303);
        },
      ),
      async (c) => {
        const { username, password, next } = c.req.valid('form');
        const nextPath = resolveNextPath(next ?? null, new URL(c.req.url).origin);
        return RA.flow(
          signInUseCase.run({ username, password, ctx: createContext(c.req.raw) }),
          RA.match({
            ok: ({ sessionId }) => {
              setSessionCookie(c, sessionId);
              return c.redirect(nextPath, 303);
            },
            err: () => c.redirect(signInErrorUrl('invalid_credentials', nextPath), 303),
          }),
        );
      },
    )
    .post(
      '/sign-up',
      async (c, next) => {
        if (!isSameOriginRequest(c.req.raw)) return c.json({ error: 'Forbidden' }, 403);
        await next();
      },
      sValidator(
        'form',
        z.object({ username: Username.zodType, password: Password.zodType }),
        (result, c) => {
          if (result.success) return undefined;
          return c.redirect('/sign-up?error=invalid_input', 303);
        },
      ),
      async (c) => {
        const { username, password } = c.req.valid('form');
        const result = await signUpUseCase.run({ username, password, ctx: createContext(c.req.raw) });
        if (result.ok) return c.redirect('/sign-in?registered=1', 303);
        const code = result.err.type === 'UnacceptableUsernameError'
          ? 'username_unacceptable'
          : result.err.type === 'UsernameAlreadyTakenError'
          ? 'username_taken'
          : 'failed';
        return c.redirect(`/sign-up?error=${code}`, 303);
      },
    )
    .post(
      '/sign-out',
      async (c, next) => {
        if (!isSameOriginRequest(c.req.raw)) return c.json({ error: 'Forbidden' }, 403);
        await next();
      },
      async (c) => {
        const parsed = SessionId.parse(getCookie(c, 'sessionId'));
        await signOutUseCase.run({ sessionId: parsed.ok ? parsed.val : undefined });
        deleteSessionCookie(c);
        return c.redirect('/sign-in', 303);
      },
    );
