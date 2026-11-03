import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { ArticleId } from '../article/articleId.ts';
import { Instant } from '../instant/instant.ts';

const articleBodyZodType = z.object({
  articleId: ArticleId.zodType,
  privateHtml: z.string(),
  publicHtml: z.string(),
  updatedAt: Instant.zodType,
});

export type ArticleBody = z.infer<typeof articleBodyZodType>;
const schema = Schema.create(articleBodyZodType);

type ArticleBodyAggregate = Agg.Aggregate<ArticleId, 'articleBody', ArticleBody>;

export type ArticleBodyEvent<
  TAggregateState extends Agg.InferState<ArticleBodyAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<ArticleBodyAggregate, TAggregateState, TEventName, TEventPayload>;

export const ArticleBodyEvent = AggregateEvent.createFactory<ArticleBodyAggregate>('articleBody');

export type ArticleBodyWritten = ArticleBodyEvent<
  ArticleBody,
  'articleBody.written',
  { articleId: ArticleId; updatedAt: Instant }
>;
export type ArticleBodyDeleted = ArticleBodyEvent<
  undefined,
  'articleBody.deleted',
  { articleId: ArticleId; deletedAt: Instant }
>;

const writeArticleBody = (now: Instant) => (payload: Omit<ArticleBody, 'updatedAt'>): ArticleBodyWritten => {
  const body: ArticleBody = { ...payload, updatedAt: now };
  return ArticleBodyEvent.create(
    body.articleId,
    body,
    'articleBody.written',
    { articleId: body.articleId, updatedAt: now },
    now,
  );
};

const deleteArticleBody = (now: Instant) => (articleId: ArticleId): ArticleBodyDeleted =>
  ArticleBodyEvent.create(articleId, undefined, 'articleBody.deleted', { articleId, deletedAt: now }, now);

export const ArticleBody = {
  ...schema,
  writeArticleBody,
  deleteArticleBody,
} as const;

export type ArticleBodyWrittenStore = Agg.Store<ArticleBodyWritten>;
export type ArticleBodyDeletedStore = Agg.Store<ArticleBodyDeleted>;

export type ArticleBodyResolver = Agg.Resolver<ArticleId, ArticleBody | undefined>;
