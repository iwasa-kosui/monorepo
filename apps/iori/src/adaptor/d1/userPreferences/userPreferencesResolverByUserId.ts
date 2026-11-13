import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import {
  DefaultPostVisibility,
  type UserPreferencesResolverByUserId,
} from '../../../domain/userPreferences/userPreferences.ts';
import type { IoriD1Db } from '../client.ts';
import { userPreferencesTable } from '../schema.ts';

export const createD1UserPreferencesResolverByUserId = (
  db: IoriD1Db,
): UserPreferencesResolverByUserId => ({
  resolve: async (userId) => {
    const [row] = await db.select().from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        userId,
        defaultPostVisibility: DefaultPostVisibility.parseOrThrow(row.defaultPostVisibility),
        createdAt: Instant.orThrow(row.createdAt.getTime()),
        updatedAt: Instant.orThrow(row.updatedAt.getTime()),
      },
    );
  },
});
