import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { ImageId } from './imageId.ts';

const postImageZodType = z.object({
  imageId: ImageId.zodType,
  postId: PostId.zodType,
  url: z.string(),
  altText: z.string().nullable(),
  createdAt: Instant.zodType,
});

export type PostImage = z.infer<typeof postImageZodType>;
export const PostImage = Schema.create(postImageZodType);

export type PostImageCreatedStore = {
  store: (images: PostImage[]) => Promise<void>;
};

export type PostImagesResolverByPostId = Agg.Resolver<PostId, PostImage[]>;
export type PostImagesResolverByPostIds = Agg.Resolver<PostId[], Map<string, PostImage[]>>;
