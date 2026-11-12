import { type RequestContext } from '@fedify/fedify';
import { Article as FedifyArticle, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { getLogger } from '@logtape/logtape';

import type { ArticleResolver } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import type { PostImagesResolverByPostId } from '../../domain/image/image.ts';
import {
  Post,
  type PostQuotesResolverByPostIds,
  type PostResolver,
  type PostWithAuthor,
  type ThreadResolver,
} from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { sanitizePostContent } from '../../domain/post/sanitizePostContent.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { GetPostUseCase } from '../../useCase/getPost.ts';
import { toMentionNoteFields } from '../../useCase/helper/mentionNote.ts';
import { toImageDocument } from '../../useCase/helper/postImageDocument.ts';
import { toQuoteNoteFields } from '../../useCase/helper/quoteNote.ts';
import { sanitizeArticleBody } from '../routes/helper/sanitizeArticleBody.ts';

export type ObjectDispatcherDeps = Readonly<{
  origin: string;
  postResolver: PostResolver;
  postImagesResolver: PostImagesResolverByPostId;
  postQuotesResolver?: PostQuotesResolverByPostIds;
  userResolverByUsername: UserResolverByUsername;
  articleResolver?: ArticleResolver;
  threadResolver?: ThreadResolver;
  articleBodyResolver: ArticleBodyResolver;
}>;

export const createObjectDispatcher = ({
  origin,
  postResolver,
  postImagesResolver,
  postQuotesResolver,
  userResolverByUsername,
  articleResolver,
  threadResolver,
  articleBodyResolver,
}: ObjectDispatcherDeps) => {
  const useCase = GetPostUseCase.create({ postResolver, postImagesResolver });
  const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) =>
    RA.flow(
      RA.ok(values.id),
      RA.andThen(PostId.parse),
      RA.andThen((postId) => useCase.run({ postId })),
      RA.andThen(({ post, postImages }) => {
        if (post.type !== 'local' || !Post.isVisibleToAnonymous(post)) {
          return RA.err(new Error('Post is not a public local post'));
        }
        return RA.flow(
          RA.ok(values.identifier),
          RA.andThen(Username.parse),
          RA.andThen((username) => userResolverByUsername.resolve(username)),
          RA.andThen((user) =>
            user?.id === post.userId ? RA.ok({ post, postImages }) : RA.err(new Error('Post author does not match'))
          ),
        );
      }),
      RA.andThen(async ({ post, postImages }) => {
        const quotes = await postQuotesResolver?.resolve([post.postId]);
        return RA.ok({ post, postImages, quote: quotes?.ok ? quotes.val.get(post.postId) : undefined });
      }),
      RA.match({
        ok: ({ post, postImages, quote }) => {
          const content = sanitizePostContent(post.content);
          const quoteFields = toQuoteNoteFields(quote);
          const mentionFields = toMentionNoteFields(content, quoteFields.actors);
          return new Note({
            id: ctx.getObjectUri(Note, values),
            attribution: ctx.getActorUri(values.identifier),
            to: PUBLIC_COLLECTION,
            ccs: [ctx.getFollowersUri(values.identifier), ...mentionFields.ccs],
            tags: mentionFields.tags,
            content,
            mediaType: 'text/html',
            published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
            url: ctx.getObjectUri(Note, values),
            summary: post.summary,
            sensitive: post.sensitive,
            replyTarget: post.inReplyToUri !== null ? new URL(post.inReplyToUri) : undefined,
            quoteUrl: quoteFields.quoteUrl,
            attachments: postImages.map((image) => toImageDocument(image, origin)),
          });
        },
        err: (error) => {
          getLogger().warn(`Failed to resolve post for federation: ${values.identifier} - ${values.id} - ${error}`);
          return null;
        },
      }),
    );
  const articleUseCase = articleResolver !== undefined && threadResolver !== undefined
    ? GetArticleWithThreadUseCase.create({ articleResolver, threadResolver, articleBodyResolver })
    : undefined;
  const ofArticle = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) => {
    if (articleUseCase === undefined) return null;
    return RA.flow(
      RA.ok(values.id),
      RA.andThen(ArticleId.parse),
      RA.andThen((articleId) => articleUseCase.run({ articleId })),
      RA.andThen(({ article, thread, body }) => {
        if (article.status !== 'published') return RA.err(new Error('Article is not published'));
        return RA.flow(
          RA.ok(values.identifier),
          RA.andThen(Username.parse),
          RA.andThen((username) => userResolverByUsername.resolve(username)),
          RA.andThen((user) =>
            user?.id === article.authorUserId
              ? RA.ok({ article, thread, body })
              : RA.err(new Error('Article author does not match'))
          ),
        );
      }),
      RA.match({
        ok: ({ article, thread, body }) =>
          new FedifyArticle({
            id: ctx.getObjectUri(FedifyArticle, values),
            attribution: ctx.getActorUri(values.identifier),
            to: PUBLIC_COLLECTION,
            cc: ctx.getFollowersUri(values.identifier),
            name: article.title,
            content: body === undefined ? formatThreadAsHtml(thread) : sanitizeArticleBody(body.html),
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
<div>${sanitizePostContent(post.content)}</div>
</article>`
  ).join('\n<hr>\n');
