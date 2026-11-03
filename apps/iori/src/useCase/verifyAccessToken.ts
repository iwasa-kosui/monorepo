import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  AccessToken,
  type AccessTokenResolverByTokenHash,
  type AccessTokenUsageRecorder,
} from '../domain/oauth/accessToken.ts';
import type { OAuthApplicationId } from '../domain/oauth/ids.ts';
import type { Scope } from '../domain/oauth/scope.ts';
import { Secret } from '../domain/oauth/secret.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  token: string;
}>;

type Ok = Readonly<{
  applicationId: OAuthApplicationId;
  userId: UserId | null;
  scopes: ReadonlyArray<Scope>;
}>;

export type AccessTokenInvalidError = Readonly<{
  type: 'AccessTokenInvalidError';
  message: string;
}>;

const AccessTokenInvalidError = {
  create: (): AccessTokenInvalidError => ({
    type: 'AccessTokenInvalidError',
    message: 'The access token is invalid.',
  }),
} as const;

export type VerifyAccessTokenUseCase = UseCase<Input, Ok, AccessTokenInvalidError>;

type Deps = Readonly<{
  accessTokenResolverByTokenHash: AccessTokenResolverByTokenHash;
  accessTokenUsageRecorder: AccessTokenUsageRecorder;
}>;

const create = ({ accessTokenResolverByTokenHash, accessTokenUsageRecorder }: Deps): VerifyAccessTokenUseCase => {
  const run = async ({ token }: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(token),
      RA.map((value) => Secret.hash(value)),
      RA.andThen((tokenHash) => accessTokenResolverByTokenHash.resolve(tokenHash)),
      RA.andThen((accessToken) =>
        accessToken !== undefined && AccessToken.isActive(accessToken)
          ? RA.ok(accessToken)
          : RA.err(AccessTokenInvalidError.create())
      ),
      RA.andThrough((accessToken) =>
        AccessToken.shouldRecordUsage(accessToken, now)
          ? accessTokenUsageRecorder.record({ id: accessToken.id, usedAt: now })
          : RA.ok(undefined)
      ),
      RA.map((accessToken): Ok => ({
        applicationId: accessToken.applicationId,
        userId: accessToken.userId,
        scopes: accessToken.scopes,
      })),
    );
  };

  return { run };
};

export const VerifyAccessTokenUseCase = {
  create,
} as const;
