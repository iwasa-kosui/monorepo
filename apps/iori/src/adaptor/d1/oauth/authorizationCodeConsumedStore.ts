import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type {
  AuthorizationCodeConsumed,
  AuthorizationCodeConsumedStore,
} from '../../../domain/oauth/authorizationCode.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAuthorizationCodesTable } from '../schema.ts';
import { insertDomainEvent, runBatch } from './rows.ts';

export const createD1AuthorizationCodeConsumedStore = (db: IoriD1Db): AuthorizationCodeConsumedStore => ({
  store: (...events: readonly AuthorizationCodeConsumed[]) =>
    RA.flow(
      fromD1(() =>
        runBatch(
          db,
          events.flatMap((event) => [
            db.update(oauthAuthorizationCodesTable)
              .set({ consumedAt: new Date(event.eventPayload.consumedAt) })
              .where(and(
                eq(oauthAuthorizationCodesTable.codeHash, event.eventPayload.codeHash),
                isNull(oauthAuthorizationCodesTable.consumedAt),
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
