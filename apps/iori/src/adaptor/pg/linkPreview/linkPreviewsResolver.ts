import { RA } from '@iwasa-kosui/result';
import { eq, inArray } from 'drizzle-orm';

import {
  LinkPreview,
  type LinkPreviewsResolverByPostId,
  type LinkPreviewsResolverByPostIds,
} from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { linkPreviewsTable } from '../schema.ts';

const getInstanceByPostId = singleton((): LinkPreviewsResolverByPostId => {
  const resolve = async (postId: PostId) => {
    const rows = await DB.getInstance()
      .select()
      .from(linkPreviewsTable)
      .where(eq(linkPreviewsTable.postId, postId))
      .execute();

    return RA.ok(
      rows.map((row) =>
        LinkPreview.orThrow({
          linkPreviewId: LinkPreviewId.orThrow(row.linkPreviewId),
          postId: row.postId as PostId,
          url: row.url,
          title: row.title,
          description: row.description,
          imageUrl: row.imageUrl,
          faviconUrl: row.faviconUrl,
          siteName: row.siteName,
          createdAt: row.createdAt.getTime(),
        })
      ),
    );
  };
  return { resolve };
});

const getInstanceByPostIds = singleton((): LinkPreviewsResolverByPostIds => {
  const resolve = async (postIds: PostId[]) => {
    if (postIds.length === 0) {
      return RA.ok(new Map<string, LinkPreview[]>());
    }

    const rows = await DB.getInstance()
      .select()
      .from(linkPreviewsTable)
      .where(inArray(linkPreviewsTable.postId, postIds))
      .execute();

    const previewsByPostId = new Map<string, LinkPreview[]>();
    for (const row of rows) {
      const postId = row.postId;
      const preview = LinkPreview.orThrow({
        linkPreviewId: LinkPreviewId.orThrow(row.linkPreviewId),
        postId: postId as PostId,
        url: row.url,
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
        faviconUrl: row.faviconUrl,
        siteName: row.siteName,
        createdAt: row.createdAt.getTime(),
      });
      const existing = previewsByPostId.get(postId) ?? [];
      existing.push(preview);
      previewsByPostId.set(postId, existing);
    }

    return RA.ok(previewsByPostId);
  };
  return { resolve };
});

export const PgLinkPreviewsResolverByPostId = {
  getInstance: getInstanceByPostId,
} as const;

export const PgLinkPreviewsResolverByPostIds = {
  getInstance: getInstanceByPostIds,
} as const;
