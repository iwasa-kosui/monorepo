import { RA } from '@iwasa-kosui/result';
import { lt } from 'drizzle-orm';

import type { WebAuthnChallengeIssuedStore } from '../../../domain/passkey/webAuthnChallenge.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, webauthnChallengesTable } from '../schema.ts';

export const createD1WebAuthnChallengeIssuedStore = (db: IoriD1Db): WebAuthnChallengeIssuedStore => ({
  store: async (event) => {
    const { challengeId, challenge, purpose, userId, expires } = event.aggregateState;
    await db.batch([
      db.delete(webauthnChallengesTable).where(lt(webauthnChallengesTable.expires, new Date(event.occurredAt))),
      db.insert(webauthnChallengesTable).values({
        challengeId,
        challenge,
        purpose,
        userId,
        expires: new Date(expires),
      }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
