import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DirectPostParticipantsResolverByPostId } from '../../../domain/post/directPostParticipants.ts';
import type { IoriD1Db } from '../client.ts';
import { directPostParticipantsTable } from '../schema.ts';

export const createD1DirectPostParticipantsResolverByPostId = (
  db: IoriD1Db,
): DirectPostParticipantsResolverByPostId => ({
  resolve: async (postId) => {
    const rows = await db.select({ actorUri: directPostParticipantsTable.actorUri }).from(directPostParticipantsTable)
      .where(eq(directPostParticipantsTable.postId, postId));
    return RA.ok(rows.map((row) => row.actorUri));
  },
});
