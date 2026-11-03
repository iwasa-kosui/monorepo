import { Article as FedifyArticle, PUBLIC_COLLECTION, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { getLogger } from '@logtape/logtape';

import { ArticleId } from '../../domain/article/articleId.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { Env } from '../../env.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgPostImagesResolverByPostId } from '../pg/image/postImagesResolver.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';
import { PgUserResolverByUsername } from '../pg/user/userResolverByUsername.ts';
import { createObjectDispatcher } from './objectDispatcherFactory.ts';

export { createObjectDispatcher, type ObjectDispatcherDeps } from './objectDispatcherFactory.ts';

const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) =>
  createObjectDispatcher({
    origin: Env.getInstance().ORIGIN,
    postResolver: PgPostResolver.getInstance(),
    postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
  }).ofNote(ctx, values);

const formatThreadAsHtml = (thread: PostWithAuthor[]): string => {
  return thread
    .map((post) => {
      const authorName = post.username;
      return `<article>
<header><strong>${authorName}</strong></header>
<div>${post.content}</div>
</article>`;
    })
    .join('\n<hr>\n');
};

const ofArticle = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) => {
  const useCase = GetArticleWithThreadUseCase.create({
    articleResolver: PgArticleResolver.getInstance(),
    threadResolver: PgThreadResolver.getInstance(),
  });
  return RA.flow(
    RA.ok({
      articleId: ArticleId.orThrow(values.id),
    }),
    RA.andThen(async (input) => useCase.run(input)),
    RA.match({
      ok: ({ article, thread }) => {
        const htmlContent = formatThreadAsHtml(thread);
        return new FedifyArticle({
          id: ctx.getObjectUri(FedifyArticle, values),
          attribution: ctx.getActorUri(values.identifier),
          to: PUBLIC_COLLECTION,
          cc: ctx.getFollowersUri(values.identifier),
          name: article.title,
          content: htmlContent,
          mediaType: 'text/html',
          published: article.publishedAt
            ? Temporal.Instant.fromEpochMilliseconds(article.publishedAt)
            : Temporal.Instant.fromEpochMilliseconds(article.createdAt),
          url: ctx.getObjectUri(FedifyArticle, values),
        });
      },
      err: (err) => {
        getLogger().warn(
          `Failed to resolve article for federation: ${values.identifier} - ${values.id} - ${err}`,
        );
        return null;
      },
    }),
  );
};

export const ObjectDispatcher = {
  ofNote,
  ofArticle,
} as const;
