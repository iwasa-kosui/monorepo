import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { AccessTokensResolverByAuthorizationCodeHash } from '../domain/oauth/accessToken.ts';
import { AccessToken, type AccessTokenIssuedStore, type AccessTokenRevokedStore } from '../domain/oauth/accessToken.ts';
import {
  AuthorizationCode,
  type AuthorizationCodeConsumedStore,
  type AuthorizationCodeResolverByCodeHash,
} from '../domain/oauth/authorizationCode.ts';
import type { OAuthApplication, OAuthApplicationResolverByClientId } from '../domain/oauth/oauthApplication.ts';
import { OAuthError } from '../domain/oauth/oauthError.ts';
import { CodeChallenge } from '../domain/oauth/pkce.ts';
import { Scope } from '../domain/oauth/scope.ts';
import { Secret, type SecretHash } from '../domain/oauth/secret.ts';
import type { UserId } from '../domain/user/userId.ts';
import { authenticateOAuthClientWith } from './helper/authenticateOAuthClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  grantType: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
  code: string | undefined;
  redirectUri: string | undefined;
  codeVerifier: string | undefined;
  scope: string | undefined;
}>;

type Ok = Readonly<{
  accessToken: string;
  scopes: ReadonlyArray<Scope>;
  createdAt: Instant;
}>;

export type ExchangeTokenUseCase = UseCase<Input, Ok, OAuthError>;

type Deps = Readonly<{
  oauthApplicationResolverByClientId: OAuthApplicationResolverByClientId;
  authorizationCodeResolverByCodeHash: AuthorizationCodeResolverByCodeHash;
  authorizationCodeConsumedStore: AuthorizationCodeConsumedStore;
  accessTokenIssuedStore: AccessTokenIssuedStore;
  accessTokenRevokedStore: AccessTokenRevokedStore;
  accessTokensResolverByAuthorizationCodeHash: AccessTokensResolverByAuthorizationCodeHash;
}>;

const invalidGrant = (message: string) => RA.err(OAuthError.create('invalid_grant', message));

const create = (deps: Deps): ExchangeTokenUseCase => {
  const authenticateClient = authenticateOAuthClientWith(deps.oauthApplicationResolverByClientId);

  const issueToken = (
    now: Instant,
    params: Readonly<{
      application: OAuthApplication;
      userId: UserId | null;
      authorizationCodeHash: SecretHash | null;
      scopes: ReadonlyArray<Scope>;
    }>,
  ): RA<Ok, OAuthError> =>
    RA.flow(
      RA.ok(params),
      RA.bind('accessToken', () => Secret.generate()),
      RA.bind('tokenHash', ({ accessToken }) => Secret.hash(accessToken)),
      RA.andBind('issued', ({ application, userId, authorizationCodeHash, scopes, tokenHash }) => {
        const issued = AccessToken.issue(now)({
          tokenHash,
          applicationId: application.id,
          userId,
          authorizationCodeHash,
          scopes: [...scopes],
        });
        return issued.ok
          ? RA.ok(issued.val)
          : RA.err(OAuthError.create('invalid_request', 'The token request is invalid.'));
      }),
      RA.andThrough(({ issued }) => deps.accessTokenIssuedStore.store(issued)),
      RA.map(({ accessToken, scopes }): Ok => ({ accessToken, scopes, createdAt: now })),
    );

  const revokeIssuedTokens = (now: Instant, codeHash: SecretHash): RA<void, never> =>
    RA.flow(
      deps.accessTokensResolverByAuthorizationCodeHash.resolve(codeHash),
      RA.andThen((tokens) => {
        const events = tokens.flatMap((token) => {
          const revoked = AccessToken.revoke(now)(token);
          return revoked.ok ? [revoked.val] : [];
        });
        return events.length === 0 ? RA.ok(undefined) : deps.accessTokenRevokedStore.store(...events);
      }),
    );

  const exchangeAuthorizationCode = (
    application: OAuthApplication,
    input: Input,
    now: Instant,
  ): RA<Ok, OAuthError> =>
    RA.flow(
      RA.ok(input),
      RA.andThen(({ code, redirectUri }) =>
        code === undefined || code.length === 0 || redirectUri === undefined || redirectUri.length === 0
          ? RA.err(OAuthError.create('invalid_request', 'code and redirect_uri are required.'))
          : RA.ok({ code, redirectUri })
      ),
      RA.bind('codeHash', ({ code }) => Secret.hash(code)),
      RA.andBind('authorizationCode', async ({ codeHash }) => {
        const resolved = await deps.authorizationCodeResolverByCodeHash.resolve(codeHash);
        if (!resolved.ok || resolved.val === undefined || resolved.val.applicationId !== application.id) {
          return invalidGrant('The authorization code is invalid.');
        }
        return RA.ok(resolved.val);
      }),
      RA.andThen(async (state) => {
        if (state.authorizationCode.consumedAt !== null) {
          await revokeIssuedTokens(now, state.codeHash);
          return invalidGrant('The authorization code has already been used.');
        }
        if (AuthorizationCode.isExpired(state.authorizationCode, now)) {
          return invalidGrant('The authorization code has expired.');
        }
        if (state.authorizationCode.redirectUri !== state.redirectUri) {
          return invalidGrant('The redirect_uri does not match the authorization request.');
        }
        return RA.ok(state);
      }),
      RA.andThen(async (state) => {
        const { codeChallenge } = state.authorizationCode;
        if (codeChallenge === null) {
          return RA.ok(state);
        }
        const verified = input.codeVerifier !== undefined
          && await CodeChallenge.verify(codeChallenge, input.codeVerifier);
        return verified ? RA.ok(state) : invalidGrant('The code_verifier is invalid.');
      }),
      RA.andThen((state) => {
        const consumed = AuthorizationCode.consume(now)(state.authorizationCode);
        return consumed.ok ? RA.ok({ ...state, consumed: consumed.val }) : invalidGrant(consumed.err.message);
      }),
      RA.andThrough(({ consumed }) => deps.authorizationCodeConsumedStore.store(consumed)),
      RA.andThen(async (state) => {
        const stored = await deps.authorizationCodeResolverByCodeHash.resolve(state.codeHash);
        return stored.ok && stored.val?.consumedAt === now
          ? RA.ok(state)
          : invalidGrant('The authorization code has already been used.');
      }),
      RA.andThen(({ authorizationCode, codeHash }) =>
        issueToken(now, {
          application,
          userId: authorizationCode.userId,
          authorizationCodeHash: codeHash,
          scopes: authorizationCode.scopes,
        })
      ),
    );

  const exchangeClientCredentials = (
    application: OAuthApplication,
    input: Input,
    now: Instant,
  ): RA<Ok, OAuthError> => {
    const scopes = Scope.parseList(input.scope);
    if (!scopes.ok) {
      return RA.err(OAuthError.create('invalid_scope', scopes.err.message));
    }
    if (!Scope.isSubset(scopes.val, application.scopes)) {
      return RA.err(OAuthError.create('invalid_scope', 'The requested scope is outside the registered scopes.'));
    }
    return issueToken(now, {
      application,
      userId: null,
      authorizationCodeHash: null,
      scopes: scopes.val,
    });
  };

  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(input),
      RA.andBind('grant', ({ grantType }) => {
        if (grantType === undefined || grantType.length === 0) {
          return RA.err(OAuthError.create('invalid_request', 'grant_type is required.'));
        }
        if (grantType !== 'authorization_code' && grantType !== 'client_credentials') {
          return RA.err(OAuthError.create('unsupported_grant_type', 'The grant_type is not supported.'));
        }
        return RA.ok(grantType);
      }),
      RA.andBind('application', () => authenticateClient(input)),
      RA.andThen(({ grant, application }) =>
        grant === 'authorization_code'
          ? exchangeAuthorizationCode(application, input, now)
          : exchangeClientCredentials(application, input, now)
      ),
    );
  };

  return { run };
};

export const ExchangeTokenUseCase = {
  create,
} as const;
