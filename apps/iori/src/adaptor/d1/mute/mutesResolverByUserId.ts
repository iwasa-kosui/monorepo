import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { MutesResolverByUserId } from '../../../domain/mute/mute.ts';
import type { IoriD1Db } from '../client.ts';
import { mutesTable } from '../schema.ts';
import { reconstructMute } from './muteResolver.ts';

export const createD1MutesResolverByUserId = (db: IoriD1Db): MutesResolverByUserId => ({
  resolve: async (userId) =>
    RA.ok((await db.select().from(mutesTable).where(eq(mutesTable.userId, userId))).map(reconstructMute)),
});
