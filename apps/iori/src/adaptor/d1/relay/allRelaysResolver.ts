import { RA } from '@iwasa-kosui/result';
import { desc } from 'drizzle-orm';

import type { AllRelaysResolver } from '../../../domain/relay/relay.ts';
import type { IoriD1Db } from '../client.ts';
import { relaysTable } from '../schema.ts';
import { reconstructD1Relay } from './toRelay.ts';

export const createD1AllRelaysResolver = (db: IoriD1Db): AllRelaysResolver => ({
  resolve: async () =>
    RA.ok((await db.select().from(relaysTable).orderBy(desc(relaysTable.createdAt))).map(reconstructD1Relay)),
});
