import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { PostImage, type PostImagesResolverByPostId } from '../../../domain/image/image.ts';
import { ImageId } from '../../../domain/image/imageId.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { postImagesTable } from '../schema.ts';

export const createD1PostImagesResolverByPostId = (db: IoriD1Db): PostImagesResolverByPostId => ({
  resolve: (postId) =>
    RA.flow(
      fromD1(async () =>
        (await db.select().from(postImagesTable).where(eq(postImagesTable.postId, postId))).map((row) =>
          PostImage.orThrow({
            imageId: ImageId.orThrow(row.imageId),
            postId: row.postId,
            url: row.url,
            altText: row.altText,
            createdAt: row.createdAt.getTime(),
          })
        )
      ),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
