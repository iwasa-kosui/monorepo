import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { RemoteLike, type RemoteLikeResolverByActivityUri } from '../../../domain/like/like.ts';
import type { IoriD1Db } from '../client.ts';
import { likesTable, remoteLikesTable } from '../schema.ts';

export const createD1RemoteLikeResolverByActivityUri = (db: IoriD1Db): RemoteLikeResolverByActivityUri => ({
  resolve: async ({ likeActivityUri }) => {
    const [row] = await db.select().from(remoteLikesTable).innerJoin(
      likesTable,
      eq(remoteLikesTable.likeId, likesTable.likeId),
    ).where(eq(remoteLikesTable.likeActivityUri, likeActivityUri)).limit(1);
    return RA.ok(
      row === undefined
        ? undefined
        : RemoteLike.orThrow({ ...row.likes, likeActivityUri: row.remote_likes.likeActivityUri, type: 'remote' }),
    );
  },
});
