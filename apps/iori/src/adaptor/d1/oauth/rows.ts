import type { AnyDomainEvent } from '../../../domain/aggregate/event.ts';
import { AccessToken } from '../../../domain/oauth/accessToken.ts';
import { AuthorizationCode } from '../../../domain/oauth/authorizationCode.ts';
import { OAuthApplication } from '../../../domain/oauth/oauthApplication.ts';
import { Scope } from '../../../domain/oauth/scope.ts';
import type { IoriD1Db } from '../client.ts';
import {
  domainEventsTable,
  type oauthAccessTokensTable,
  type oauthApplicationsTable,
  type oauthAuthorizationCodesTable,
} from '../schema.ts';

export const toMs = (value: Date | number): number => value instanceof Date ? value.getTime() : value;
const toNullableMs = (value: Date | number | null): number | null => value === null ? null : toMs(value);

const parseScopes = (scopes: string): Scope[] => {
  const parsed = Scope.parseList(scopes);
  if (!parsed.ok) {
    throw new Error(parsed.err.message);
  }
  return [...parsed.val];
};

export const toOAuthApplication = (row: typeof oauthApplicationsTable.$inferSelect): OAuthApplication =>
  OAuthApplication.orThrow({
    id: row.id,
    clientId: row.clientId,
    clientSecretHash: row.clientSecretHash,
    name: row.name,
    website: row.website,
    redirectUris: JSON.parse(row.redirectUris),
    scopes: parseScopes(row.scopes),
    createdAt: toMs(row.createdAt),
  });

export const toAuthorizationCode = (row: typeof oauthAuthorizationCodesTable.$inferSelect): AuthorizationCode =>
  AuthorizationCode.orThrow({
    codeHash: row.codeHash,
    applicationId: row.applicationId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    scopes: parseScopes(row.scopes),
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod as 'S256' | null,
    expiresAt: toMs(row.expiresAt),
    consumedAt: toNullableMs(row.consumedAt),
    createdAt: toMs(row.createdAt),
  });

export const toAccessToken = (row: typeof oauthAccessTokensTable.$inferSelect): AccessToken =>
  AccessToken.orThrow({
    id: row.id,
    tokenHash: row.tokenHash,
    applicationId: row.applicationId,
    userId: row.userId,
    authorizationCodeHash: row.authorizationCodeHash,
    scopes: parseScopes(row.scopes),
    createdAt: toMs(row.createdAt),
    revokedAt: toNullableMs(row.revokedAt),
    lastUsedAt: toNullableMs(row.lastUsedAt),
  });

type BatchQueries = Parameters<IoriD1Db['batch']>[0];

export const insertDomainEvent = (db: IoriD1Db, event: AnyDomainEvent) =>
  db.insert(domainEventsTable).values({
    eventId: event.eventId,
    aggregateId: String(event.aggregateId),
    aggregateName: event.aggregateName,
    aggregateState: JSON.stringify(event.aggregateState),
    eventName: event.eventName,
    eventPayload: JSON.stringify(event.eventPayload),
    occurredAt: new Date(event.occurredAt),
  });

export const runBatch = async (db: IoriD1Db, queries: ReadonlyArray<BatchQueries[number]>): Promise<void> => {
  if (queries.length === 0) {
    return;
  }
  await db.batch(queries as unknown as BatchQueries);
};
