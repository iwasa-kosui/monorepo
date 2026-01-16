import type { PostImage, PostImageCreatedStore } from "../../../domain/image/image.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { postImagesTable } from "../schema.ts";

const store = async (images: PostImage[]): Promise<void> => {
  if (images.length === 0) return;

  await DB.getInstance().insert(postImagesTable).values(
    images.map((image) => ({
      imageId: image.imageId,
      postId: image.postId,
      url: image.url,
      altText: image.altText,
      createdAt: new Date(image.createdAt),
    }))
  );
};

const getInstance = singleton((): PostImageCreatedStore => ({
  store,
}));

export const PgPostImageCreatedStore = {
  getInstance,
} as const;
