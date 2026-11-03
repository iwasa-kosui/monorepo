import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { AuthorizationCodeConsumedStore } from '../../../domain/oauth/authorizationCode.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { oauthAuthorizationCodesTable } from '../schema.ts';
import { insertDomainEvent } from './rows.ts';

export const createD1AuthorizationCodeConsumedStore = (db: IoriD1Db): AuthorizationCodeConsumedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        const updated = await db.update(oauthAuthorizationCodesTable)
          .set({ consumedAt: new Date(event.eventPayload.consumedAt) })
          .where(and(
            eq(oauthAuthorizationCodesTable.codeHash, event.eventPayload.codeHash),
            isNull(oauthAuthorizationCodesTable.consumedAt),
          ))
          .returning({ codeHash: oauthAuthorizationCodesTable.codeHash });
        if (updated.length === 0) {
          return false;
        }
        await insertDomainEvent(db, event);
        return true;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
