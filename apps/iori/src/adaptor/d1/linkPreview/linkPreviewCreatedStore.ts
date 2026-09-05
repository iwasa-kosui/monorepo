import type { LinkPreview, LinkPreviewCreatedStore } from '../../../domain/linkPreview/linkPreview.ts';
import type { IoriD1Db } from '../client.ts';
import { linkPreviewsTable } from '../schema.ts';

export const createD1LinkPreviewCreatedStore = (db: IoriD1Db): LinkPreviewCreatedStore => ({
  store: async (previews: LinkPreview[]): Promise<void> => {
    if (previews.length === 0) return;

    await db.insert(linkPreviewsTable).values(previews.map((preview) => ({
      linkPreviewId: preview.linkPreviewId,
      postId: preview.postId,
      url: preview.url,
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
      faviconUrl: preview.faviconUrl,
      siteName: preview.siteName,
      createdAt: new Date(preview.createdAt),
    })));
  },
});
