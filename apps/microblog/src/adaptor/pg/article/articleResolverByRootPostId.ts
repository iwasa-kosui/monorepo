import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleResolverByRootPostId } from '../../../domain/article/article.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable } from '../schema.ts';
import { PgArticleResolver } from './articleResolver.ts';

const getInstance = singleton((): ArticleResolverByRootPostId => {
  const resolve = async ({ rootPostId }: { rootPostId: PostId }) => {
    const [row, ...rest] = await DB.getInstance().select()
      .from(articlesTable)
      .where(eq(articlesTable.rootPostId, rootPostId))
      .execute();

    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple articles found with the same rootPostId: ${rootPostId}`);
    }

    return RA.ok(PgArticleResolver.reconstructArticle(row));
  };
  return { resolve };
});

export const PgArticleResolverByRootPostId = {
  getInstance,
} as const;
