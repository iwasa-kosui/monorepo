import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { WebAuthnChallenge, type WebAuthnChallengeConsumer } from '../../../domain/passkey/webAuthnChallenge.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, webauthnChallengesTable } from '../schema.ts';

export const createD1WebAuthnChallengeConsumer = (db: IoriD1Db): WebAuthnChallengeConsumer => ({
  consume: async (challengeId, now) => {
    const [row] = await db.delete(webauthnChallengesTable)
      .where(eq(webauthnChallengesTable.challengeId, challengeId))
      .returning();
    if (row === undefined) {
      return RA.ok(undefined);
    }
    const challenge = WebAuthnChallenge.orThrow({
      challengeId: row.challengeId,
      challenge: row.challenge,
      purpose: row.purpose as WebAuthnChallenge['purpose'],
      userId: row.userId,
      expires: row.expires.getTime(),
    });
    await db.insert(domainEventsTable).values(toD1DomainEventRow(WebAuthnChallenge.consume(now)(challenge)));
    return RA.ok(challenge);
  },
});
