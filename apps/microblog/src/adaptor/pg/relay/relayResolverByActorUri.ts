import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import type { Relay, RelayResolverByActorUri } from '../../../domain/relay/relay.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { relaysTable } from '../schema.ts';

const resolve = async (
  { actorUri }: { actorUri: string },
): RA<Relay | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(relaysTable)
    .where(eq(relaysTable.actorUri, actorUri))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    relayId: RelayId.orThrow(row.relayId),
    inboxUrl: row.inboxUrl,
    actorUri: row.actorUri,
    status: row.status as Relay['status'],
    createdAt: Instant.orThrow(row.createdAt.getTime()),
    acceptedAt: row.acceptedAt ? Instant.orThrow(row.acceptedAt.getTime()) : null,
  });
};

const getInstance = singleton(
  (): RelayResolverByActorUri => ({
    resolve,
  }),
);

export const PgRelayResolverByActorUri = {
  getInstance,
} as const;
