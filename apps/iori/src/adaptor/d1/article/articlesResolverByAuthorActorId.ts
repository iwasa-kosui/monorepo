import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticlesResolverByAuthorActorId } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { articlesTable } from '../schema.ts';
import { reconstructD1Article } from './articleResolver.ts';

export const createD1ArticlesResolverByAuthorActorId = (
  db: IoriD1Db,
): ArticlesResolverByAuthorActorId => ({
  resolve: async ({ actorId }) =>
    RA.ok((await db.select().from(articlesTable).where(eq(articlesTable.authorActorId, actorId)))
      .map(reconstructD1Article)),
});
