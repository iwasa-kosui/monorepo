import { type RA, Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { AccessTokenId, OAuthApplicationId } from './ids.ts';
import type { ParseResult } from './oauthError.ts';
import { Scope } from './scope.ts';
import { SecretHash } from './secret.ts';

const USAGE_RECORD_INTERVAL_MS = 60 * 60 * 1000;

const zodType = z.object({
  id: AccessTokenId.zodType,
  tokenHash: SecretHash.zodType,
  applicationId: OAuthApplicationId.zodType,
  userId: z.nullable(UserId.zodType),
  authorizationCodeHash: z.nullable(SecretHash.zodType),
  scopes: z.array(Scope.zodType).min(1),
  createdAt: Instant.zodType,
  revokedAt: z.nullable(Instant.zodType),
  lastUsedAt: z.nullable(Instant.zodType),
}).describe('AccessToken');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type AccessToken = z.output<typeof zodType>;
export type AccessTokenAggregate = Agg.Aggregate<AccessTokenId, 'accessToken', AccessToken>;
export type AccessTokenEvent<
  TAggregateState extends Agg.InferState<AccessTokenAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<AccessTokenAggregate, TAggregateState, TEventName, TEventPayload>;

export const AccessTokenEvent = AggregateEvent.createFactory<AccessTokenAggregate>('accessToken');

export type AccessTokenIssued = AccessTokenEvent<AccessToken, 'accessToken.issued', AccessToken>;
export type AccessTokenRevoked = AccessTokenEvent<
  AccessToken,
  'accessToken.revoked',
  { id: AccessTokenId; tokenHash: SecretHash; revokedAt: Instant }
>;
export type AccessTokenIssuedStore = Agg.Store<AccessTokenIssued>;
export type AccessTokenRevokedStore = Agg.Store<AccessTokenRevoked>;
export type AccessTokenResolverByTokenHash = Agg.Resolver<SecretHash, AccessToken | undefined>;
export type AccessTokensResolverByAuthorizationCodeHash = Agg.Resolver<SecretHash, ReadonlyArray<AccessToken>>;
export type AccessTokenUsageRecorder = Readonly<{
  record: (input: Readonly<{ id: AccessTokenId; usedAt: Instant }>) => RA<void, never>;
}>;

export type AccessTokenAlreadyRevokedError = Readonly<{
  type: 'AccessTokenAlreadyRevokedError';
  message: string;
}>;

export const AccessTokenAlreadyRevokedError = {
  create: (): AccessTokenAlreadyRevokedError => ({
    type: 'AccessTokenAlreadyRevokedError',
    message: 'The access token has already been revoked.',
  }),
} as const;

const issue = (now: Instant) =>
(
  input: Pick<AccessToken, 'tokenHash' | 'applicationId' | 'userId' | 'authorizationCodeHash' | 'scopes'>,
): ParseResult<AccessTokenIssued> =>
  Result.flow(
    schema.of({
      ...input,
      id: AccessTokenId.generate(),
      createdAt: now,
      revokedAt: null,
      lastUsedAt: null,
    }),
    Result.map((token: AccessToken): AccessTokenIssued =>
      AccessTokenEvent.create(token.id, token, 'accessToken.issued', token, now)
    ),
  );

const revoke = (now: Instant) =>
(
  token: AccessToken,
): Result<AccessTokenRevoked, AccessTokenAlreadyRevokedError> => {
  if (token.revokedAt !== null) {
    return Result.err(AccessTokenAlreadyRevokedError.create());
  }
  return Result.ok(
    AccessTokenEvent.create(
      token.id,
      { ...token, revokedAt: now },
      'accessToken.revoked',
      { id: token.id, tokenHash: token.tokenHash, revokedAt: now },
      now,
    ),
  );
};

export const AccessToken = {
  ...schema,
  issue,
  revoke,
  isActive: (token: AccessToken): boolean => token.revokedAt === null,
  shouldRecordUsage: (token: AccessToken, now: Instant): boolean =>
    token.lastUsedAt === null || now - token.lastUsedAt >= USAGE_RECORD_INTERVAL_MS,
} as const;
