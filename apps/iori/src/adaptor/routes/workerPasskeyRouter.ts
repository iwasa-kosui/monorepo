import { RA } from '@iwasa-kosui/result';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import type { PasskeyCredential } from '../../domain/passkey/passkeyCredential.ts';
import { PasskeyCredentialId } from '../../domain/passkey/passkeyCredentialId.ts';
import { WebAuthnChallengeId } from '../../domain/passkey/webAuthnChallengeId.ts';
import { Password } from '../../domain/password/password.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { resolveNextPath } from '../../helper/signInNext.ts';
import type { DeletePasskeyUseCase } from '../../useCase/deletePasskey.ts';
import type { FinishPasskeyAuthenticationUseCase } from '../../useCase/finishPasskeyAuthentication.ts';
import type { FinishPasskeyRegistrationUseCase } from '../../useCase/finishPasskeyRegistration.ts';
import type { ListPasskeysUseCase } from '../../useCase/listPasskeys.ts';
import type { StartPasskeyAuthenticationUseCase } from '../../useCase/startPasskeyAuthentication.ts';
import type { StartPasskeyRegistrationUseCase } from '../../useCase/startPasskeyRegistration.ts';
import { setSessionCookie } from './helper/sessionCookie.ts';
import {
  getMastodonPrincipal,
  isSameOriginRequest,
  type MastodonAuthEnv,
  type MastodonAuthn,
} from './mastodonAuthn.ts';

export type WorkerPasskeyRouterDeps = Readonly<{
  startPasskeyRegistrationUseCase: StartPasskeyRegistrationUseCase;
  finishPasskeyRegistrationUseCase: FinishPasskeyRegistrationUseCase;
  startPasskeyAuthenticationUseCase: StartPasskeyAuthenticationUseCase;
  finishPasskeyAuthenticationUseCase: FinishPasskeyAuthenticationUseCase;
  listPasskeysUseCase: ListPasskeysUseCase;
  deletePasskeyUseCase: DeletePasskeyUseCase;
  authn: MastodonAuthn;
}>;

const CHALLENGE_COOKIE = 'webauthnChallengeId';
const CHALLENGE_COOKIE_PATH = '/auth/passkey';
const CHALLENGE_MAX_AGE_SECONDS = 5 * 60;

const base64Url = z.string().min(1);

const registrationResponseSchema = z.object({
  id: base64Url,
  rawId: base64Url,
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.looseObject({}),
  response: z.looseObject({
    clientDataJSON: base64Url,
    attestationObject: base64Url,
    transports: z.array(z.string()).optional(),
  }),
});

const authenticationResponseSchema = z.object({
  id: base64Url,
  rawId: base64Url,
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.looseObject({}),
  response: z.looseObject({
    clientDataJSON: base64Url,
    authenticatorData: base64Url,
    signature: base64Url,
    userHandle: base64Url.optional(),
  }),
});

const optionsBodySchema = z.object({ password: z.string() });
const registrationBodySchema = z.object({
  response: registrationResponseSchema,
  name: z.string().trim().min(1).max(100).optional(),
});
const signInBodySchema = z.object({
  response: authenticationResponseSchema,
  next: z.string().optional(),
});

const readJson = async <T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T> | undefined> => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

const toCredentialJson = (credential: PasskeyCredential) => ({
  credentialId: credential.credentialId,
  name: credential.name,
  createdAt: new Date(credential.createdAt).toISOString(),
  lastUsedAt: credential.lastUsedAt === null ? null : new Date(credential.lastUsedAt).toISOString(),
  deviceType: credential.deviceType,
  backedUp: credential.backedUp,
});

const setChallengeCookie = (c: Context, challengeId: string): void => {
  setCookie(c, CHALLENGE_COOKIE, challengeId, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: CHALLENGE_COOKIE_PATH,
    maxAge: CHALLENGE_MAX_AGE_SECONDS,
  });
};

const clearChallengeCookie = (c: Context): void => {
  deleteCookie(c, CHALLENGE_COOKIE, { path: CHALLENGE_COOKIE_PATH, secure: true });
};

const readChallengeId = (c: Context): WebAuthnChallengeId | undefined => {
  const parsed = WebAuthnChallengeId.parse(getCookie(c, CHALLENGE_COOKIE));
  return parsed.ok ? parsed.val : undefined;
};

const requireSameOrigin: MiddlewareHandler = async (c, next) => {
  if (!isSameOriginRequest(c.req.raw)) return c.json({ error: 'Forbidden' }, 403);
  await next();
};

export const createWorkerPasskeyRouter = ({
  startPasskeyRegistrationUseCase,
  finishPasskeyRegistrationUseCase,
  startPasskeyAuthenticationUseCase,
  finishPasskeyAuthenticationUseCase,
  listPasskeysUseCase,
  deletePasskeyUseCase,
  authn,
}: WorkerPasskeyRouterDeps): Hono<MastodonAuthEnv> => {
  const sessionUserId = (c: Context<MastodonAuthEnv>): UserId | undefined => {
    const principal = getMastodonPrincipal(c);
    return principal?.source === 'session' ? principal.userId ?? undefined : undefined;
  };
  const unauthorized = (c: Context) => c.json({ error: 'unauthorized' }, 401);

  return new Hono<MastodonAuthEnv>()
    .post('/registration-options', requireSameOrigin, authn.optionalAuth, async (c) => {
      const userId = sessionUserId(c);
      if (userId === undefined) return unauthorized(c);
      const body = await readJson(c, optionsBodySchema);
      if (body === undefined) return c.json({ error: 'invalid_request' }, 400);
      const password = Password.parse(body.password);
      if (!password.ok) return c.json({ error: 'invalid_password' }, 400);
      return RA.flow(
        startPasskeyRegistrationUseCase.run({ userId, password: password.val }),
        RA.match({
          ok: ({ options, challengeId }) => {
            setChallengeCookie(c, challengeId);
            return c.json(options);
          },
          err: (error) =>
            error.type === 'InvalidPassword'
              ? c.json({ error: 'invalid_password' }, 400)
              : unauthorized(c),
        }),
      );
    })
    .post('/registrations', requireSameOrigin, authn.optionalAuth, async (c) => {
      const userId = sessionUserId(c);
      if (userId === undefined) return unauthorized(c);
      const challengeId = readChallengeId(c);
      const body = await readJson(c, registrationBodySchema);
      clearChallengeCookie(c);
      if (challengeId === undefined || body === undefined) return c.json({ error: 'registration_failed' }, 400);
      return RA.flow(
        finishPasskeyRegistrationUseCase.run({
          userId,
          challengeId,
          response: body.response as RegistrationResponseJSON,
          name: body.name,
        }),
        RA.match({
          ok: ({ credential }) => c.json({ credential: toCredentialJson(credential) }, 201),
          err: () => c.json({ error: 'registration_failed' }, 400),
        }),
      );
    })
    .post('/authentication-options', requireSameOrigin, async (c) =>
      RA.flow(
        startPasskeyAuthenticationUseCase.run({}),
        RA.match({
          ok: ({ options, challengeId }) => {
            setChallengeCookie(c, challengeId);
            return c.json(options);
          },
          err: (): never => {
            throw new Error('unreachable');
          },
        }),
      ))
    .post('/sign-in', requireSameOrigin, async (c) => {
      const challengeId = readChallengeId(c);
      const body = await readJson(c, signInBodySchema);
      clearChallengeCookie(c);
      if (challengeId === undefined || body === undefined) return c.json({ error: 'authentication_failed' }, 401);
      const redirectTo = resolveNextPath(body.next ?? null, new URL(c.req.url).origin);
      return RA.flow(
        finishPasskeyAuthenticationUseCase.run({
          challengeId,
          response: body.response as AuthenticationResponseJSON,
        }),
        RA.match({
          ok: ({ sessionId }) => {
            setSessionCookie(c, sessionId);
            return c.json({ redirectTo });
          },
          err: () => c.json({ error: 'authentication_failed' }, 401),
        }),
      );
    })
    .get('/credentials', authn.optionalAuth, async (c) => {
      const userId = sessionUserId(c);
      if (userId === undefined) return unauthorized(c);
      return RA.flow(
        listPasskeysUseCase.run({ userId }),
        RA.match({
          ok: ({ credentials }) => c.json({ credentials: credentials.map(toCredentialJson) }),
          err: (): never => {
            throw new Error('unreachable');
          },
        }),
      );
    })
    .delete('/credentials/:credentialId', requireSameOrigin, authn.optionalAuth, async (c) => {
      const userId = sessionUserId(c);
      if (userId === undefined) return unauthorized(c);
      const credentialId = PasskeyCredentialId.parse(c.req.param('credentialId'));
      if (!credentialId.ok) return c.json({ error: 'not_found' }, 404);
      return RA.flow(
        deletePasskeyUseCase.run({ userId, credentialId: credentialId.val }),
        RA.match({
          ok: () => c.body(null, 204),
          err: () => c.json({ error: 'not_found' }, 404),
        }),
      );
    });
};
