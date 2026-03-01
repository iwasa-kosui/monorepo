import { RA } from '@iwasa-kosui/result';
import { desc } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import type { AllRelaysResolver, Relay } from '../../../domain/relay/relay.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { relaysTable } from '../schema.ts';

const resolve = async (): RA<readonly Relay[], never> => {
  const result = await DB.getInstance()
    .select()
    .from(relaysTable)
    .orderBy(desc(relaysTable.createdAt));

  return RA.ok(
    result.map((row): Relay => ({
      relayId: RelayId.orThrow(row.relayId),
      inboxUrl: row.inboxUrl,
      actorUri: row.actorUri,
      status: row.status as Relay['status'],
      createdAt: Instant.orThrow(row.createdAt.getTime()),
      acceptedAt: row.acceptedAt ? Instant.orThrow(row.acceptedAt.getTime()) : null,
    })),
  );
};

const getInstance = singleton(
  (): AllRelaysResolver => ({
    resolve,
  }),
);

export const PgAllRelaysResolver = {
  getInstance,
} as const;
