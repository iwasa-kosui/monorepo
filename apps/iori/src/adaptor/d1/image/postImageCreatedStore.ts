import type { PostImage, PostImageCreatedStore } from '../../../domain/image/image.ts';
import type { IoriD1Db } from '../client.ts';
import { postImagesTable } from '../schema.ts';

const ROWS_PER_STATEMENT = 20;

export const chunkImages = (images: PostImage[]): PostImage[][] => {
  const chunks: PostImage[][] = [];
  for (let i = 0; i < images.length; i += ROWS_PER_STATEMENT) {
    chunks.push(images.slice(i, i + ROWS_PER_STATEMENT));
  }
  return chunks;
};

export const createD1PostImageCreatedStore = (db: IoriD1Db): PostImageCreatedStore => ({
  store: async (images: PostImage[]): Promise<void> => {
    const [first, ...rest] = chunkImages(images).map((chunk) =>
      db.insert(postImagesTable).values(
        chunk.map((image) => ({
          imageId: image.imageId,
          postId: image.postId,
          url: image.url,
          altText: image.altText,
          mediaType: image.mediaType,
          createdAt: new Date(image.createdAt),
        })),
      )
    );
    if (first === undefined) return;
    if (rest.length === 0) {
      await first;
      return;
    }
    await db.batch([first, ...rest]);
  },
});
