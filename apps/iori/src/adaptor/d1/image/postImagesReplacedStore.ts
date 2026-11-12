import { eq } from 'drizzle-orm';

import type { PostImagesReplacedStore } from '../../../domain/image/image.ts';
import type { IoriD1Db } from '../client.ts';
import { postImagesTable } from '../schema.ts';
import { chunkImages } from './postImageCreatedStore.ts';

export const createD1PostImagesReplacedStore = (db: IoriD1Db): PostImagesReplacedStore => ({
  store: async ({ postId, images }) => {
    const inserts = chunkImages(images).map((chunk) =>
      db.insert(postImagesTable).values(
        chunk.map((image) => ({
          imageId: image.imageId,
          postId: image.postId,
          url: image.url,
          altText: image.altText,
          createdAt: new Date(image.createdAt),
        })),
      )
    );
    await db.batch([db.delete(postImagesTable).where(eq(postImagesTable.postId, postId)), ...inserts]);
  },
});
