import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { LinkPreviewId } from './linkPreviewId.ts';

const linkPreviewZodType = z.object({
  linkPreviewId: LinkPreviewId.zodType,
  postId: PostId.zodType,
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  siteName: z.string().nullable(),
  createdAt: Instant.zodType,
});

export type LinkPreview = z.infer<typeof linkPreviewZodType>;
export const LinkPreview = Schema.create(linkPreviewZodType);

export type LinkPreviewCreatedStore = {
  store: (previews: LinkPreview[]) => Promise<void>;
};

export type LinkPreviewsResolverByPostId = Agg.Resolver<PostId, LinkPreview[]>;
export type LinkPreviewsResolverByPostIds = Agg.Resolver<PostId[], Map<string, LinkPreview[]>>;
