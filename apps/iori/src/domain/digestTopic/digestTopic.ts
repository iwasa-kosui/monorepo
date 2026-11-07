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
    name: z.string().min(1).max(40),
    description: z.string().min(1).max(300),
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
export type DigestTopicParseError = ParseError;
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

export type DigestTopicEdited = DigestTopicEvent<
  DigestTopic,
  'digestTopic.edited',
  { userId: UserId; topicKey: string; name: string; description: string; updatedAt: Instant }
>;
export type DigestTopicEnabledChanged = DigestTopicEvent<
  DigestTopic,
  'digestTopic.enabledChanged',
  { userId: UserId; topicKey: string; enabled: boolean; updatedAt: Instant }
>;

export type DigestTopicNotFoundError = Readonly<{
  type: 'DigestTopicNotFoundError';
  message: string;
  detail: { topicKey: string };
}>;

export const DigestTopicNotFoundError = {
  create: (topicKey: string): DigestTopicNotFoundError => ({
    type: 'DigestTopicNotFoundError',
    message: `The digest topic "${topicKey}" is not found.`,
    detail: { topicKey },
  }),
} as const;

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

const edit = (
  topic: DigestTopic,
  input: Pick<DigestTopic, 'name' | 'description'>,
  now: Instant,
): Result<DigestTopicEdited, ParseError> => {
  const parsed = schema.parse({
    ...topic,
    name: input.name,
    description: input.description,
    embeddedAt: null,
    updatedAt: now,
  });
  if (!parsed.ok) return parsed;
  const edited = parsed.val;
  return ok(
    DigestTopicEvent.create(
      toAggregateId(edited),
      edited,
      'digestTopic.edited',
      {
        userId: edited.userId,
        topicKey: edited.topicKey,
        name: edited.name,
        description: edited.description,
        updatedAt: now,
      },
      now,
    ),
  );
};

const setEnabled = (
  topic: DigestTopic,
  enabled: boolean,
  now: Instant,
): Result<DigestTopicEnabledChanged, ParseError> => {
  const parsed = schema.parse({ ...topic, enabled, updatedAt: now });
  if (!parsed.ok) return parsed;
  const changed = parsed.val;
  return ok(
    DigestTopicEvent.create(
      toAggregateId(changed),
      changed,
      'digestTopic.enabledChanged',
      { userId: changed.userId, topicKey: changed.topicKey, enabled: changed.enabled, updatedAt: now },
      now,
    ),
  );
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
export type DigestTopicEditedStore = Agg.Store<DigestTopicEdited>;
export type DigestTopicEnabledChangedStore = Agg.Store<DigestTopicEnabledChanged>;
export type DigestTopicsResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<StoredDigestTopic>>;

export const DigestTopic = {
  ...schema,
  create,
  edit,
  setEnabled,
  embed,
  toEmbeddingText,
  toAggregateId,
} as const;
