import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { AccessTokenRevoked, AccessTokenRevokedStore } from '../../../domain/oauth/accessToken.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAccessTokensTable } from '../schema.ts';
import { insertDomainEvent, runBatch } from './rows.ts';

export const createD1AccessTokenRevokedStore = (db: IoriD1Db): AccessTokenRevokedStore => ({
  store: (...events: readonly AccessTokenRevoked[]) =>
    RA.flow(
      fromD1(() =>
        runBatch(
          db,
          events.flatMap((event) => [
            db.update(oauthAccessTokensTable)
              .set({ revokedAt: new Date(event.eventPayload.revokedAt) })
              .where(and(
                eq(oauthAccessTokensTable.id, event.eventPayload.id),
                isNull(oauthAccessTokensTable.revokedAt),
              )),
            insertDomainEvent(db, event),
          ]),
        )
      ),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
