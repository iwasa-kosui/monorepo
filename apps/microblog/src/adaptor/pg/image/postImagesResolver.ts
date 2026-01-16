import { RA } from "@iwasa-kosui/result";
import { eq, inArray } from "drizzle-orm";

import { PostImage, type PostImagesResolverByPostId, type PostImagesResolverByPostIds } from "../../../domain/image/image.ts";
import { ImageId } from "../../../domain/image/imageId.ts";
import type { PostId } from "../../../domain/post/postId.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { postImagesTable } from "../schema.ts";

const getInstanceByPostId = singleton((): PostImagesResolverByPostId => {
  const resolve = async (postId: PostId) => {
    const rows = await DB.getInstance()
      .select()
      .from(postImagesTable)
      .where(eq(postImagesTable.postId, postId))
      .execute();

    return RA.ok(
      rows.map((row) =>
        PostImage.orThrow({
          imageId: ImageId.orThrow(row.imageId),
          postId: row.postId as PostId,
          url: row.url,
          altText: row.altText,
          createdAt: row.createdAt.getTime(),
        })
      )
    );
  };
  return { resolve };
});

const getInstanceByPostIds = singleton((): PostImagesResolverByPostIds => {
  const resolve = async (postIds: PostId[]) => {
    if (postIds.length === 0) {
      return RA.ok(new Map<string, PostImage[]>());
    }

    const rows = await DB.getInstance()
      .select()
      .from(postImagesTable)
      .where(inArray(postImagesTable.postId, postIds))
      .execute();

    const imagesByPostId = new Map<string, PostImage[]>();
    for (const row of rows) {
      const postId = row.postId;
      const image = PostImage.orThrow({
        imageId: ImageId.orThrow(row.imageId),
        postId: postId as PostId,
        url: row.url,
        altText: row.altText,
        createdAt: row.createdAt.getTime(),
      });
      const existing = imagesByPostId.get(postId) ?? [];
      existing.push(image);
      imagesByPostId.set(postId, existing);
    }

    return RA.ok(imagesByPostId);
  };
  return { resolve };
});

export const PgPostImagesResolverByPostId = {
  getInstance: getInstanceByPostId,
} as const;

export const PgPostImagesResolverByPostIds = {
  getInstance: getInstanceByPostIds,
} as const;
