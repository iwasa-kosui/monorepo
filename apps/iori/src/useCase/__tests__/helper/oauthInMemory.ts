import { RA } from '@iwasa-kosui/result';

import type { AnyDomainEvent } from '../../../domain/aggregate/event.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { AccessToken } from '../../../domain/oauth/accessToken.ts';
import type { AuthorizationCode } from '../../../domain/oauth/authorizationCode.ts';
import type { OAuthApplication } from '../../../domain/oauth/oauthApplication.ts';
import type { SecretHash } from '../../../domain/oauth/secret.ts';
import type { Session } from '../../../domain/session/session.ts';
import { SessionId } from '../../../domain/session/sessionId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { ExchangeTokenUseCase } from '../../exchangeToken.ts';
import { IssueAuthorizationCodeUseCase } from '../../issueAuthorizationCode.ts';
import { RegisterOAuthApplicationUseCase } from '../../registerOAuthApplication.ts';
import { RevokeTokenUseCase } from '../../revokeToken.ts';
import { ValidateAuthorizationRequestUseCase } from '../../validateAuthorizationRequest.ts';
import { VerifyAccessTokenUseCase } from '../../verifyAccessToken.ts';

export const createOAuthInMemory = () => {
  const applications = new Map<string, OAuthApplication>();
  const codes = new Map<string, AuthorizationCode>();
  const tokens = new Map<string, AccessToken>();
  const sessions = new Map<SessionId, Session>();
  const events: AnyDomainEvent[] = [];
  const usageRecords: Array<{ id: string; usedAt: Instant }> = [];

  const ok = <T>(value: T) => RA.ok(value) as RA<T, never>;

  const oauthApplicationRegisteredStore = {
    store: (...batch: Array<{ aggregateState: OAuthApplication } & AnyDomainEvent>) => {
      for (const event of batch) {
        applications.set(event.aggregateState.id, event.aggregateState);
        events.push(event);
      }
      return ok(undefined);
    },
  };
  const oauthApplicationResolverByClientId = {
    resolve: (clientId: string) =>
      ok([...applications.values()].find((application) => application.clientId === clientId)),
  };
  const oauthApplicationResolver = {
    resolve: (id: string) => ok(applications.get(id)),
  };
  const authorizationCodeIssuedStore = {
    store: (...batch: Array<{ aggregateState: AuthorizationCode } & AnyDomainEvent>) => {
      for (const event of batch) {
        codes.set(event.aggregateState.codeHash, event.aggregateState);
        events.push(event);
      }
      return ok(undefined);
    },
  };
  const authorizationCodeConsumedStore = {
    store: (event: { aggregateState: AuthorizationCode } & AnyDomainEvent) => {
      const current = codes.get(event.aggregateState.codeHash);
      if (current === undefined || current.consumedAt !== null) {
        return ok(false);
      }
      codes.set(current.codeHash, event.aggregateState);
      events.push(event);
      return ok(true);
    },
  };
  const authorizationCodeResolverByCodeHash = {
    resolve: (codeHash: SecretHash) => ok(codes.get(codeHash)),
  };
  const accessTokenIssuedStore = {
    store: (...batch: Array<{ aggregateState: AccessToken } & AnyDomainEvent>) => {
      for (const event of batch) {
        tokens.set(event.aggregateState.id, event.aggregateState);
        events.push(event);
      }
      return ok(undefined);
    },
  };
  const accessTokenRevokedStore = {
    store: (...batch: Array<{ aggregateState: AccessToken } & AnyDomainEvent>) => {
      for (const event of batch) {
        const current = tokens.get(event.aggregateState.id);
        if (current !== undefined && current.revokedAt === null) {
          tokens.set(current.id, event.aggregateState);
        }
        events.push(event);
      }
      return ok(undefined);
    },
  };
  const accessTokenResolverByTokenHash = {
    resolve: (tokenHash: SecretHash) => ok([...tokens.values()].find((token) => token.tokenHash === tokenHash)),
  };
  const accessTokensResolverByAuthorizationCodeHash = {
    resolve: (codeHash: SecretHash) =>
      ok([...tokens.values()].filter((token) => token.authorizationCodeHash === codeHash)),
  };
  const accessTokenUsageRecorder = {
    record: ({ id, usedAt }: { id: string; usedAt: Instant }) => {
      usageRecords.push({ id, usedAt });
      const current = tokens.get(id);
      if (current !== undefined) tokens.set(id, { ...current, lastUsedAt: usedAt });
      return ok(undefined);
    },
  };
  const sessionResolver = {
    resolve: (sessionId: SessionId) => ok(sessions.get(sessionId)),
  };

  const addSession = (
    userId: UserId = UserId.generate(),
    expires: Instant = Instant.addDuration(Instant.now(), 60_000),
  ) => {
    const sessionId = SessionId.generate();
    sessions.set(sessionId, { sessionId, userId, expires });
    return { sessionId, userId };
  };

  const deps = {
    oauthApplicationRegisteredStore,
    oauthApplicationResolverByClientId,
    oauthApplicationResolver,
    authorizationCodeIssuedStore,
    authorizationCodeConsumedStore,
    authorizationCodeResolverByCodeHash,
    accessTokenIssuedStore,
    accessTokenRevokedStore,
    accessTokenResolverByTokenHash,
    accessTokensResolverByAuthorizationCodeHash,
    accessTokenUsageRecorder,
    sessionResolver,
  } as unknown as
    & Parameters<typeof RegisterOAuthApplicationUseCase.create>[0]
    & Parameters<typeof IssueAuthorizationCodeUseCase.create>[0]
    & Parameters<typeof ExchangeTokenUseCase.create>[0]
    & Parameters<typeof RevokeTokenUseCase.create>[0]
    & Parameters<typeof VerifyAccessTokenUseCase.create>[0]
    & Parameters<typeof ValidateAuthorizationRequestUseCase.create>[0];

  return {
    applications,
    codes,
    tokens,
    events,
    usageRecords,
    addSession,
    deps,
    useCases: {
      registerOAuthApplicationUseCase: RegisterOAuthApplicationUseCase.create(deps),
      validateAuthorizationRequestUseCase: ValidateAuthorizationRequestUseCase.create(deps),
      issueAuthorizationCodeUseCase: IssueAuthorizationCodeUseCase.create(deps),
      exchangeTokenUseCase: ExchangeTokenUseCase.create(deps),
      revokeTokenUseCase: RevokeTokenUseCase.create(deps),
      verifyAccessTokenUseCase: VerifyAccessTokenUseCase.create(deps),
    },
    oauthApplicationResolver,
    sessionResolver,
  };
};

export type OAuthInMemory = ReturnType<typeof createOAuthInMemory>;
