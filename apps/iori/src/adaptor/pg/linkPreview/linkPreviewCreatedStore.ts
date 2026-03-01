import type { LinkPreview, LinkPreviewCreatedStore } from '../../../domain/linkPreview/linkPreview.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { linkPreviewsTable } from '../schema.ts';

const store = async (previews: LinkPreview[]): Promise<void> => {
  if (previews.length === 0) return;

  await DB.getInstance().insert(linkPreviewsTable).values(
    previews.map((preview) => ({
      linkPreviewId: preview.linkPreviewId,
      postId: preview.postId,
      url: preview.url,
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
      faviconUrl: preview.faviconUrl,
      siteName: preview.siteName,
      createdAt: new Date(preview.createdAt),
    })),
  );
};

const getInstance = singleton((): LinkPreviewCreatedStore => ({
  store,
}));

export const PgLinkPreviewCreatedStore = {
  getInstance,
} as const;
