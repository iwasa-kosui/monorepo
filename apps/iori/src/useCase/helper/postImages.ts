import type { PostImage } from '../../domain/image/image.ts';
import { ImageId } from '../../domain/image/imageId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostId } from '../../domain/post/postId.ts';

export type PostImageSource = Readonly<{ url: string; altText: string | null }>;

export type PostImagesInput =
  | Readonly<{ imageUrls: string[] }>
  | Readonly<{ images: ReadonlyArray<PostImageSource> }>;

export const toPostImages = (postId: PostId, input: PostImagesInput, now: Instant): PostImage[] => {
  const sources: ReadonlyArray<PostImageSource> = 'images' in input
    ? input.images
    : input.imageUrls.map((url) => ({ url, altText: null }));
  return sources.map(({ url, altText }, index) => ({
    imageId: ImageId.generate(),
    postId,
    url,
    altText,
    mediaType: null,
    createdAt: Instant.addDuration(now, index),
  }));
};
