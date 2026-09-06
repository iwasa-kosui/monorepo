import { Article as FedifyArticle, Document, Note, PUBLIC_COLLECTION, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { getLogger } from '@logtape/logtape';

import type { ArticleResolver } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { PostImagesResolverByPostId } from '../../domain/image/image.ts';
import { getMimeTypeFromUrl } from '../../domain/image/mimeType.ts';
import type { PostResolver, PostWithAuthor, ThreadResolver } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { GetPostUseCase } from '../../useCase/getPost.ts';

export type ObjectDispatcherDeps = Readonly<{
  origin: string;
  postResolver: PostResolver;
  postImagesResolver: PostImagesResolverByPostId;
  articleResolver?: ArticleResolver;
  threadResolver?: ThreadResolver;
}>;

export const createObjectDispatcher = ({
  origin,
  postResolver,
  postImagesResolver,
  articleResolver,
  threadResolver,
}: ObjectDispatcherDeps) => {
  const useCase = GetPostUseCase.create({ postResolver, postImagesResolver });
  const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) =>
    RA.flow(
      RA.ok({ postId: PostId.orThrow(values.id) }),
      RA.andThen((input) => useCase.run(input)),
      RA.match({
        ok: ({ post, postImages }) =>
          new Note({
            id: ctx.getObjectUri(Note, values),
            attribution: ctx.getActorUri(values.identifier),
            to: PUBLIC_COLLECTION,
            cc: ctx.getFollowersUri(values.identifier),
            content: post.content,
            mediaType: 'text/html',
            published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
            url: ctx.getObjectUri(Note, values),
            replyTarget: post.type === 'local' && post.inReplyToUri !== null ? new URL(post.inReplyToUri) : undefined,
            attachments: postImages.map((image) =>
              new Document({ url: new URL(image.url, origin), mediaType: getMimeTypeFromUrl(image.url) })
            ),
          }),
        err: (error) => {
          getLogger().warn(`Failed to resolve post for federation: ${values.identifier} - ${values.id} - ${error}`);
          return null;
        },
      }),
    );
  const articleUseCase = articleResolver !== undefined && threadResolver !== undefined
    ? GetArticleWithThreadUseCase.create({ articleResolver, threadResolver })
    : undefined;
  const ofArticle = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) => {
    if (articleUseCase === undefined) return null;
    return RA.flow(
      articleUseCase.run({ articleId: ArticleId.orThrow(values.id) }),
      RA.match({
        ok: ({ article, thread }) =>
          new FedifyArticle({
            id: ctx.getObjectUri(FedifyArticle, values),
            attribution: ctx.getActorUri(values.identifier),
            to: PUBLIC_COLLECTION,
            cc: ctx.getFollowersUri(values.identifier),
            name: article.title,
            content: formatThreadAsHtml(thread),
            mediaType: 'text/html',
            published: Temporal.Instant.fromEpochMilliseconds(article.publishedAt ?? article.createdAt),
            url: ctx.getObjectUri(FedifyArticle, values),
          }),
        err: (error) => {
          getLogger().warn(`Failed to resolve article for federation: ${values.identifier} - ${values.id} - ${error}`);
          return null;
        },
      }),
    );
  };
  return { ofNote, ofArticle };
};

const formatThreadAsHtml = (thread: PostWithAuthor[]): string =>
  thread.map((post) =>
    `<article>
<header><strong>${post.username}</strong></header>
<div>${post.content}</div>
</article>`
  ).join('\n<hr>\n');
