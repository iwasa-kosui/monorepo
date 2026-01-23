import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { UserId } from '../user/userId.ts';
import { ArticleId } from './articleId.ts';

const ArticleStatus = z.enum(['draft', 'published', 'unpublished']);
export type ArticleStatus = z.infer<typeof ArticleStatus>;

const articleZodType = z.object({
  articleId: ArticleId.zodType,
  authorActorId: ActorId.zodType,
  authorUserId: UserId.zodType,
  rootPostId: PostId.zodType,
  title: z.string().min(1).max(200),
  status: ArticleStatus,
  createdAt: Instant.zodType,
  publishedAt: z.nullable(Instant.zodType),
  unpublishedAt: z.nullable(Instant.zodType),
});

export type Article = z.infer<typeof articleZodType>;
const schema = Schema.create(articleZodType);

type ArticleAggregate = Agg.Aggregate<ArticleId, 'article', Article>;

export type ArticleEvent<
  TAggregateState extends Agg.InferState<ArticleAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<ArticleAggregate, TAggregateState, TEventName, TEventPayload>;

export const ArticleEvent = AggregateEvent.createFactory<ArticleAggregate>('article');

export type ArticleCreated = ArticleEvent<Article, 'article.created', Article>;
export type ArticlePublished = ArticleEvent<
  Article,
  'article.published',
  { articleId: ArticleId; publishedAt: Instant }
>;
export type ArticleUnpublished = ArticleEvent<
  Article,
  'article.unpublished',
  { articleId: ArticleId; unpublishedAt: Instant }
>;
export type ArticleDeleted = ArticleEvent<undefined, 'article.deleted', { articleId: ArticleId; deletedAt: Instant }>;

const createArticle = (now: Instant) =>
(
  payload: Omit<Article, 'articleId' | 'createdAt' | 'status' | 'publishedAt' | 'unpublishedAt'>,
): ArticleCreated => {
  const articleId = ArticleId.generate();
  const article: Article = {
    ...payload,
    articleId,
    status: 'draft',
    createdAt: now,
    publishedAt: null,
    unpublishedAt: null,
  };
  return ArticleEvent.create(articleId, article, 'article.created', article, now);
};

const publishArticle = (now: Instant) => (article: Article): ArticlePublished => {
  const publishedArticle: Article = {
    ...article,
    status: 'published',
    publishedAt: now,
  };
  return ArticleEvent.create(
    article.articleId,
    publishedArticle,
    'article.published',
    { articleId: article.articleId, publishedAt: now },
    now,
  );
};

const unpublishArticle = (now: Instant) => (article: Article): ArticleUnpublished => {
  const unpublishedArticle: Article = {
    ...article,
    status: 'unpublished',
    unpublishedAt: now,
  };
  return ArticleEvent.create(
    article.articleId,
    unpublishedArticle,
    'article.unpublished',
    { articleId: article.articleId, unpublishedAt: now },
    now,
  );
};

const deleteArticle = (now: Instant) => (articleId: ArticleId): ArticleDeleted => {
  return ArticleEvent.create(articleId, undefined, 'article.deleted', { articleId, deletedAt: now }, now);
};

export const Article = {
  ...schema,
  createArticle,
  publishArticle,
  unpublishArticle,
  deleteArticle,
} as const;

export type ArticleCreatedStore = Agg.Store<ArticleCreated>;
export type ArticlePublishedStore = Agg.Store<ArticlePublished>;
export type ArticleUnpublishedStore = Agg.Store<ArticleUnpublished>;
export type ArticleDeletedStore = Agg.Store<ArticleDeleted>;

export type ArticleResolver = Agg.Resolver<ArticleId, Article | undefined>;
export type ArticleResolverByRootPostId = Agg.Resolver<{ rootPostId: PostId }, Article | undefined>;
export type ArticlesResolverByAuthorActorId = Agg.Resolver<{ actorId: ActorId }, Article[]>;

export type ArticleNotFoundError = Readonly<{
  type: 'ArticleNotFoundError';
  message: string;
  detail: {
    articleId: ArticleId;
  };
}>;

export const ArticleNotFoundError = {
  create: (articleId: ArticleId): ArticleNotFoundError => ({
    type: 'ArticleNotFoundError',
    message: `The article with ID "${articleId}" was not found.`,
    detail: { articleId },
  }),
} as const;

export type ArticleAlreadyExistsError = Readonly<{
  type: 'ArticleAlreadyExistsError';
  message: string;
  detail: {
    rootPostId: PostId;
  };
}>;

export const ArticleAlreadyExistsError = {
  create: (rootPostId: PostId): ArticleAlreadyExistsError => ({
    type: 'ArticleAlreadyExistsError',
    message: `An article already exists for the post with ID "${rootPostId}".`,
    detail: { rootPostId },
  }),
} as const;

export type ArticleInvalidStatusError = Readonly<{
  type: 'ArticleInvalidStatusError';
  message: string;
  detail: {
    articleId: ArticleId;
    currentStatus: ArticleStatus;
    expectedStatus: ArticleStatus[];
  };
}>;

export const ArticleInvalidStatusError = {
  create: (
    articleId: ArticleId,
    currentStatus: ArticleStatus,
    expectedStatus: ArticleStatus[],
  ): ArticleInvalidStatusError => ({
    type: 'ArticleInvalidStatusError',
    message: `The article with ID "${articleId}" has status "${currentStatus}" but expected one of: ${
      expectedStatus.join(', ')
    }.`,
    detail: { articleId, currentStatus, expectedStatus },
  }),
} as const;
