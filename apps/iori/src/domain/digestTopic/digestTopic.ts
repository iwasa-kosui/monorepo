import { ok, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { Embedding, type EmbeddingDimensionsError } from '../interestSource/embedding.ts';
import { UserId } from '../user/userId.ts';

const zodType = z
  .object({
    userId: UserId.zodType,
    topicKey: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    embeddedAt: z.nullable(Instant.zodType),
    sortOrder: z.number().int().nonnegative(),
    enabled: z.boolean(),
    createdAt: Instant.zodType,
    updatedAt: Instant.zodType,
  })
  .describe('DigestTopic');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type DigestTopic = z.output<typeof zodType>;
type ParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];
export type StoredDigestTopic = DigestTopic & Readonly<{ embedding: Float32Array | null }>;

export type DigestTopicAggregateId = Readonly<{
  userId: UserId;
  topicKey: string;
}>;
export type DigestTopicAggregate = Agg.Aggregate<DigestTopicAggregateId, 'digestTopic', DigestTopic>;
const toAggregateId = (topic: Pick<DigestTopic, 'userId' | 'topicKey'>): DigestTopicAggregateId => ({
  userId: topic.userId,
  topicKey: topic.topicKey,
});

type DigestTopicEvent<
  TAggregateState extends Agg.InferState<DigestTopicAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<DigestTopicAggregate, TAggregateState, TEventName, TEventPayload>;
const DigestTopicEvent = AggregateEvent.createFactory<DigestTopicAggregate>('digestTopic');

export type DigestTopicCreated = DigestTopicEvent<DigestTopic, 'digestTopic.created', DigestTopic>;
export type DigestTopicEmbedded = DigestTopicEvent<
  DigestTopic,
  'digestTopic.embedded',
  { userId: UserId; topicKey: string; embedding: Float32Array; embeddedAt: Instant }
>;

export type CreateDigestTopicPayload = Pick<DigestTopic, 'userId' | 'topicKey' | 'name' | 'description' | 'sortOrder'>;

const create = (payload: CreateDigestTopicPayload, now: Instant): Result<DigestTopicCreated, ParseError> => {
  const parsed = schema.parse({
    ...payload,
    embeddedAt: null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  if (!parsed.ok) return parsed;
  const topic = parsed.val;
  return {
    ...parsed,
    val: DigestTopicEvent.create(toAggregateId(topic), topic, 'digestTopic.created', topic, now),
  };
};

const toEmbeddingText = (topic: Pick<DigestTopic, 'name' | 'description'>): string =>
  `${topic.name}: ${topic.description}`;

const embed = (
  topic: DigestTopic,
  embedding: Float32Array,
  now: Instant,
): Result<DigestTopicEmbedded, EmbeddingDimensionsError> => {
  const validated = Embedding.validate(embedding);
  if (!validated.ok) return validated;
  const embedded: DigestTopic = { ...topic, embeddedAt: now };
  return ok(
    DigestTopicEvent.create(
      toAggregateId(embedded),
      embedded,
      'digestTopic.embedded',
      { userId: embedded.userId, topicKey: embedded.topicKey, embedding: validated.val, embeddedAt: now },
      now,
    ),
  );
};

export type DigestTopicCreatedStore = Agg.Store<DigestTopicCreated>;
export type DigestTopicEmbeddedStore = Agg.Store<DigestTopicEmbedded>;
export type DigestTopicsResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<StoredDigestTopic>>;

export const DigestTopic = {
  ...schema,
  create,
  embed,
  toEmbeddingText,
  toAggregateId,
} as const;
