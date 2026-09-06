import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RelayResolverByActorUri } from '../../../domain/relay/relay.ts';
import type { IoriD1Db } from '../client.ts';
import { relaysTable } from '../schema.ts';
import { reconstructD1Relay } from './toRelay.ts';

export const createD1RelayResolverByActorUri = (db: IoriD1Db): RelayResolverByActorUri => ({
  resolve: async ({ actorUri }) => {
    const [row] = await db.select().from(relaysTable).where(eq(relaysTable.actorUri, actorUri)).limit(1);
    return RA.ok(row === undefined ? undefined : reconstructD1Relay(row));
  },
});
