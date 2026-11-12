import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RemotePostRecipientsResolverByPostId } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { remotePostRecipientsTable } from '../schema.ts';

export const createD1RemotePostRecipientsResolverByPostId = (db: IoriD1Db): RemotePostRecipientsResolverByPostId => ({
  resolve: async (postId) => {
    const rows = await db.select({ actorUri: remotePostRecipientsTable.actorUri }).from(remotePostRecipientsTable)
      .where(eq(remotePostRecipientsTable.postId, postId));
    return RA.ok(rows.map((row) => row.actorUri));
  },
});
