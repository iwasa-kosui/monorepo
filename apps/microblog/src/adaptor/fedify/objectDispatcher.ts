import { Article as FedifyArticle, Document, Note, PUBLIC_COLLECTION, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { getLogger } from '@logtape/logtape';

import { ArticleId } from '../../domain/article/articleId.ts';
import { getMimeTypeFromUrl } from '../../domain/image/mimeType.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { Env } from '../../env.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { GetPostUseCase } from '../../useCase/getPost.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgPostImagesResolverByPostId } from '../pg/image/postImagesResolver.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';

const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) => {
  const useCase = GetPostUseCase.create({
    postResolver: PgPostResolver.getInstance(),
    postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
  });
  return RA.flow(
    RA.ok({
      postId: PostId.orThrow(values.id),
    }),
    RA.andThen(async (input) => useCase.run(input)),
    RA.match({
      ok: ({ post, postImages }) => {
        const inReplyToUri = post.type === 'local' && post.inReplyToUri ? new URL(post.inReplyToUri) : undefined;
        return new Note({
          id: ctx.getObjectUri(Note, values),
          attribution: ctx.getActorUri(values.identifier),
          to: PUBLIC_COLLECTION,
          cc: ctx.getFollowersUri(values.identifier),
          content: post.content,
          mediaType: 'text/html',
          published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
          url: ctx.getObjectUri(Note, values),
          replyTarget: inReplyToUri,
          attachments: postImages.map((image) =>
            new Document({
              url: new URL(`${Env.getInstance().ORIGIN}${image.url}`),
              mediaType: getMimeTypeFromUrl(image.url),
            })
          ),
        });
      },
      err: (err) => {
        getLogger().warn(
          `Failed to resolve post for federation: ${values.identifier} - ${values.id} - ${err}`,
        );
        return null;
      },
    }),
  );
};

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
