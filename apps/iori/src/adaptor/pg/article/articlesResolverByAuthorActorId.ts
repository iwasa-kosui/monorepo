import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { ArticlesResolverByAuthorActorId } from '../../../domain/article/article.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable } from '../schema.ts';
import { PgArticleResolver } from './articleResolver.ts';

const getInstance = singleton((): ArticlesResolverByAuthorActorId => {
  const resolve = async ({ actorId }: { actorId: ActorId }) => {
    const rows = await DB.getInstance().select()
      .from(articlesTable)
      .where(eq(articlesTable.authorActorId, actorId))
      .execute();

    return RA.ok(rows.map(PgArticleResolver.reconstructArticle));
  };
  return { resolve };
});

export const PgArticlesResolverByAuthorActorId = {
  getInstance,
} as const;
