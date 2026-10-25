import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import type { AcceptedRelaysResolver, Relay } from '../../../domain/relay/relay.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import type { IoriD1Db } from '../client.ts';
import { relaysTable } from '../schema.ts';

const toTimestampMs = (timestamp: Date | number): number => timestamp instanceof Date ? timestamp.getTime() : timestamp;

export const createD1AcceptedRelaysResolver = (db: IoriD1Db): AcceptedRelaysResolver => ({
  resolve: async () => {
    const rows = await db.select()
      .from(relaysTable)
      .where(eq(relaysTable.status, 'accepted'));
    return RA.ok(rows.map((row): Relay => ({
      relayId: RelayId.orThrow(row.relayId),
      inboxUrl: row.inboxUrl,
      actorUri: row.actorUri,
      status: row.status as Relay['status'],
      createdAt: Instant.orThrow(toTimestampMs(row.createdAt)),
      acceptedAt: row.acceptedAt === null ? null : Instant.orThrow(toTimestampMs(row.acceptedAt)),
    })));
  },
});
