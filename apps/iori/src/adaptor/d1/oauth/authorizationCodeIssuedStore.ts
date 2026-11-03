import { RA } from '@iwasa-kosui/result';

import type { AuthorizationCodeIssued, AuthorizationCodeIssuedStore } from '../../../domain/oauth/authorizationCode.ts';
import { Scope } from '../../../domain/oauth/scope.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAuthorizationCodesTable } from '../schema.ts';
import { insertDomainEvent, runBatch } from './rows.ts';

export const createD1AuthorizationCodeIssuedStore = (db: IoriD1Db): AuthorizationCodeIssuedStore => ({
  store: (...events: readonly AuthorizationCodeIssued[]) =>
    RA.flow(
      fromD1(() =>
        runBatch(
          db,
          events.flatMap((event) => {
            const code = event.aggregateState;
            return [
              db.insert(oauthAuthorizationCodesTable).values({
                codeHash: code.codeHash,
                applicationId: code.applicationId,
                userId: code.userId,
                redirectUri: code.redirectUri,
                scopes: Scope.serialize(code.scopes),
                codeChallenge: code.codeChallenge,
                codeChallengeMethod: code.codeChallengeMethod,
                expiresAt: new Date(code.expiresAt),
                consumedAt: code.consumedAt === null ? null : new Date(code.consumedAt),
                createdAt: new Date(code.createdAt),
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
