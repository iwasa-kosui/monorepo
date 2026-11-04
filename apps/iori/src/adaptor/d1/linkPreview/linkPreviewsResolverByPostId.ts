import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { LinkPreview, type LinkPreviewsResolverByPostId } from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import type { IoriD1Db } from '../client.ts';
import { linkPreviewsTable } from '../schema.ts';

export const createD1LinkPreviewsResolverByPostId = (db: IoriD1Db): LinkPreviewsResolverByPostId => ({
  resolve: async (postId) =>
    RA.ok(
      (await db.select().from(linkPreviewsTable).where(eq(linkPreviewsTable.postId, postId))).map((row) =>
        LinkPreview.orThrow({
          linkPreviewId: LinkPreviewId.orThrow(row.linkPreviewId),
          postId: row.postId,
          url: row.url,
          title: row.title,
          description: row.description,
          imageUrl: row.imageUrl,
          faviconUrl: row.faviconUrl,
          siteName: row.siteName,
          createdAt: row.createdAt.getTime(),
        })
      ),
    ),
});
