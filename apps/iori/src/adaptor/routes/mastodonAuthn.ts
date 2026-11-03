import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

import { Instant } from '../../domain/instant/instant.ts';
import type { OAuthApplicationId } from '../../domain/oauth/ids.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { SessionResolver } from '../../domain/session/session.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { resolveSessionWith } from '../../useCase/helper/resolve.ts';
import type { VerifyAccessTokenUseCase } from '../../useCase/verifyAccessToken.ts';

export type MastodonPrincipal = Readonly<{
  source: 'token' | 'session';
  applicationId: OAuthApplicationId | null;
  userId: UserId | null;
  sessionId: SessionId | null;
  scopes: ReadonlyArray<Scope>;
}>;

export type MastodonAuthEnv = {
  Variables: {
    principal: MastodonPrincipal | undefined;
  };
};

export type MastodonAuthnDeps = Readonly<{
  verifyAccessTokenUseCase: VerifyAccessTokenUseCase;
  sessionResolver: SessionResolver;
}>;

export type MastodonAuthn = Readonly<{
  optionalAuth: MiddlewareHandler<MastodonAuthEnv>;
  requireApp: MiddlewareHandler<MastodonAuthEnv>;
  requireUser: (...scopes: [Scope, ...Scope[]]) => MiddlewareHandler<MastodonAuthEnv>;
}>;

const unsafeMethods: ReadonlyArray<string> = ['POST', 'PUT', 'PATCH', 'DELETE'];

export const isSameOriginRequest = (request: Request): boolean => {
  const origin = request.headers.get('Origin');
  if (origin !== null) {
    return origin === new URL(request.url).origin;
  }
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
};

export const getMastodonPrincipal = (c: Context<MastodonAuthEnv>): MastodonPrincipal | undefined => c.get('principal');

type Authentication = Readonly<
  { response: Response } | { response?: undefined; principal: MastodonPrincipal | undefined }
>;

const invalidToken = (c: Context) => c.json({ error: 'The access token is invalid' }, 401);
const outsideScopes = (c: Context) => c.json({ error: 'This action is outside the authorized scopes' }, 403);

export const createMastodonAuthn = (
  { verifyAccessTokenUseCase, sessionResolver }: MastodonAuthnDeps,
): MastodonAuthn => {
  const authenticate = async (c: Context<MastodonAuthEnv>): Promise<Authentication> => {
    const authorization = c.req.header('Authorization');
    if (authorization !== undefined) {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
      if (match === null) {
        return { response: invalidToken(c) };
      }
      const verified = await verifyAccessTokenUseCase.run({ token: match[1]! });
      if (!verified.ok) {
        return { response: invalidToken(c) };
      }
      return {
        principal: {
          source: 'token',
          applicationId: verified.val.applicationId,
          userId: verified.val.userId,
          sessionId: null,
          scopes: verified.val.scopes,
        },
      };
    }

    const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
    if (!sessionId.ok) {
      return { principal: undefined };
    }
    const session = await resolveSessionWith(sessionResolver, Instant.now())(sessionId.val);
    if (!session.ok) {
      return { principal: undefined };
    }
    if (unsafeMethods.includes(c.req.method.toUpperCase()) && !isSameOriginRequest(c.req.raw)) {
      return { response: c.json({ error: 'Forbidden' }, 403) };
    }
    return {
      principal: {
        source: 'session',
        applicationId: null,
        userId: session.val.userId,
        sessionId: sessionId.val,
        scopes: Scope.fullAccess,
      },
    };
  };

  const guard = (
    check: (c: Context<MastodonAuthEnv>, principal: MastodonPrincipal | undefined) => Response | undefined,
  ): MiddlewareHandler<MastodonAuthEnv> =>
  async (c, next) => {
    const authentication = await authenticate(c);
    if (authentication.response !== undefined) {
      return authentication.response;
    }
    c.set('principal', authentication.principal);
    const rejection = check(c, authentication.principal);
    if (rejection !== undefined) {
      return rejection;
    }
    await next();
  };

  return {
    optionalAuth: guard(() => undefined),
    requireApp: guard((c, principal) => principal === undefined ? invalidToken(c) : undefined),
    requireUser: (...scopes) =>
      guard((c, principal) => {
        if (principal === undefined || principal.userId === null) {
          return invalidToken(c);
        }
        return Scope.includesAny(principal.scopes, scopes) ? undefined : outsideScopes(c);
      }),
  };
};
