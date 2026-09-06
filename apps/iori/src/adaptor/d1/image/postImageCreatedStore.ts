import type { PostImage, PostImageCreatedStore } from '../../../domain/image/image.ts';
import type { IoriD1Db } from '../client.ts';
import { postImagesTable } from '../schema.ts';

export const createD1PostImageCreatedStore = (db: IoriD1Db): PostImageCreatedStore => ({
  store: async (images: PostImage[]): Promise<void> => {
    if (images.length === 0) return;

    await db.insert(postImagesTable).values(
      images.map((image) => ({
        imageId: image.imageId,
        postId: image.postId,
        url: image.url,
        altText: image.altText,
        createdAt: new Date(image.createdAt),
      })),
    );
  },
});
