import { RA } from '@iwasa-kosui/result';

import type { AccessTokenIssued, AccessTokenIssuedStore } from '../../../domain/oauth/accessToken.ts';
import { Scope } from '../../../domain/oauth/scope.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAccessTokensTable } from '../schema.ts';
import { insertDomainEvent, runBatch } from './rows.ts';

export const createD1AccessTokenIssuedStore = (db: IoriD1Db): AccessTokenIssuedStore => ({
  store: (...events: readonly AccessTokenIssued[]) =>
    RA.flow(
      fromD1(() =>
        runBatch(
          db,
          events.flatMap((event) => {
            const token = event.aggregateState;
            return [
              db.insert(oauthAccessTokensTable).values({
                id: token.id,
                tokenHash: token.tokenHash,
                applicationId: token.applicationId,
                userId: token.userId,
                authorizationCodeHash: token.authorizationCodeHash,
                scopes: Scope.serialize(token.scopes),
                createdAt: new Date(token.createdAt),
                revokedAt: token.revokedAt === null ? null : new Date(token.revokedAt),
                lastUsedAt: token.lastUsedAt === null ? null : new Date(token.lastUsedAt),
              }),
              insertDomainEvent(db, event),
            ];
          }),
        )
      ),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
