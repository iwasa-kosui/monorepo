import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RelayResolver } from '../../../domain/relay/relay.ts';
import type { IoriD1Db } from '../client.ts';
import { relaysTable } from '../schema.ts';
import { reconstructD1Relay } from './toRelay.ts';

export const createD1RelayResolver = (db: IoriD1Db): RelayResolver => ({
  resolve: async ({ relayId }) => {
    const [row] = await db.select().from(relaysTable).where(eq(relaysTable.relayId, relayId)).limit(1);
    return RA.ok(row === undefined ? undefined : reconstructD1Relay(row));
  },
});
