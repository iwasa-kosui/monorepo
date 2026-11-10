import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  AccessToken,
  type AccessTokenResolverByTokenHash,
  type AccessTokenRevokedStore,
} from '../domain/oauth/accessToken.ts';
import type { OAuthApplicationResolverByClientId } from '../domain/oauth/oauthApplication.ts';
import { OAuthError } from '../domain/oauth/oauthError.ts';
import { Secret } from '../domain/oauth/secret.ts';
import { authenticateOAuthClientWith } from './helper/authenticateOAuthClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  clientId: string | undefined;
  clientSecret: string | undefined;
  token: string | undefined;
}>;

export type RevokeTokenUseCase = UseCase<Input, void, OAuthError>;

type Deps = Readonly<{
  oauthApplicationResolverByClientId: OAuthApplicationResolverByClientId;
  accessTokenResolverByTokenHash: AccessTokenResolverByTokenHash;
  accessTokenRevokedStore: AccessTokenRevokedStore;
}>;

const create = ({
  oauthApplicationResolverByClientId,
  accessTokenResolverByTokenHash,
  accessTokenRevokedStore,
}: Deps): RevokeTokenUseCase => {
  const authenticateClient = authenticateOAuthClientWith(oauthApplicationResolverByClientId);

  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(input),
      RA.andBind('application', () => authenticateClient(input)),
      RA.andThen(({ token, application }) =>
        token === undefined || token.length === 0
          ? RA.err(OAuthError.create('invalid_request', 'token is required.'))
          : RA.ok({ token, application })
      ),
      RA.bind('tokenHash', ({ token }) => Secret.hash(token)),
      RA.andBind('accessToken', ({ tokenHash }) => accessTokenResolverByTokenHash.resolve(tokenHash)),
      RA.andThen(({ application, accessToken }) => {
        if (accessToken === undefined) {
          return RA.ok(undefined);
        }
        if (accessToken.applicationId !== application.id) {
          return RA.err(OAuthError.create('unauthorized_client', 'The token was issued to another client.'));
        }
        const revoked = AccessToken.revoke(now)(accessToken);
        return revoked.ok ? accessTokenRevokedStore.store(revoked.val) : RA.ok(undefined);
      }),
    );
  };

  return { run };
};

export const RevokeTokenUseCase = {
  create,
} as const;
