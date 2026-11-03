import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { OAuthApplicationId } from './ids.ts';
import type { ParseResult } from './oauthError.ts';
import { CodeChallenge, CodeChallengeMethodSchema } from './pkce.ts';
import { RedirectUri } from './redirectUri.ts';
import { Scope } from './scope.ts';
import { SecretHash } from './secret.ts';

const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;

const zodType = z.object({
  codeHash: SecretHash.zodType,
  applicationId: OAuthApplicationId.zodType,
  userId: UserId.zodType,
  redirectUri: RedirectUri.zodType,
  scopes: z.array(Scope.zodType).min(1),
  codeChallenge: z.nullable(CodeChallenge.zodType),
  codeChallengeMethod: z.nullable(CodeChallengeMethodSchema),
  expiresAt: Instant.zodType,
  consumedAt: z.nullable(Instant.zodType),
  createdAt: Instant.zodType,
}).refine(
  (code) => (code.codeChallenge === null) === (code.codeChallengeMethod === null),
  'codeChallenge and codeChallengeMethod must be given together',
).describe('AuthorizationCode');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type AuthorizationCode = z.output<typeof zodType>;
export type AuthorizationCodeAggregate = Agg.Aggregate<SecretHash, 'authorizationCode', AuthorizationCode>;
export type AuthorizationCodeEvent<
  TAggregateState extends Agg.InferState<AuthorizationCodeAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<AuthorizationCodeAggregate, TAggregateState, TEventName, TEventPayload>;

export const AuthorizationCodeEvent = AggregateEvent.createFactory<AuthorizationCodeAggregate>('authorizationCode');

export type AuthorizationCodeIssued = AuthorizationCodeEvent<
  AuthorizationCode,
  'authorizationCode.issued',
  AuthorizationCode
>;
export type AuthorizationCodeConsumed = AuthorizationCodeEvent<
  AuthorizationCode,
  'authorizationCode.consumed',
  { codeHash: SecretHash; consumedAt: Instant }
>;
export type AuthorizationCodeIssuedStore = Agg.Store<AuthorizationCodeIssued>;
export type AuthorizationCodeConsumedStore = Agg.Store<AuthorizationCodeConsumed>;
export type AuthorizationCodeResolverByCodeHash = Agg.Resolver<SecretHash, AuthorizationCode | undefined>;

export type AuthorizationCodeAlreadyConsumedError = Readonly<{
  type: 'AuthorizationCodeAlreadyConsumedError';
  message: string;
}>;

export const AuthorizationCodeAlreadyConsumedError = {
  create: (): AuthorizationCodeAlreadyConsumedError => ({
    type: 'AuthorizationCodeAlreadyConsumedError',
    message: 'The authorization code has already been used.',
  }),
} as const;

const issue = (now: Instant) =>
(
  input: Pick<
    AuthorizationCode,
    'codeHash' | 'applicationId' | 'userId' | 'redirectUri' | 'scopes' | 'codeChallenge' | 'codeChallengeMethod'
  >,
): ParseResult<AuthorizationCodeIssued> =>
  Result.flow(
    schema.of({
      ...input,
      expiresAt: Instant.addDuration(now, AUTHORIZATION_CODE_TTL_MS),
      consumedAt: null,
      createdAt: now,
    }),
    Result.map((code: AuthorizationCode): AuthorizationCodeIssued =>
      AuthorizationCodeEvent.create(code.codeHash, code, 'authorizationCode.issued', code, now)
    ),
  );

const consume = (now: Instant) =>
(
  code: AuthorizationCode,
): Result<AuthorizationCodeConsumed, AuthorizationCodeAlreadyConsumedError> => {
  if (code.consumedAt !== null) {
    return Result.err(AuthorizationCodeAlreadyConsumedError.create());
  }
  return Result.ok(
    AuthorizationCodeEvent.create(
      code.codeHash,
      { ...code, consumedAt: now },
      'authorizationCode.consumed',
      { codeHash: code.codeHash, consumedAt: now },
      now,
    ),
  );
};

export const AuthorizationCode = {
  ...schema,
  issue,
  consume,
  isExpired: (code: AuthorizationCode, now: Instant): boolean => code.expiresAt <= now,
} as const;
