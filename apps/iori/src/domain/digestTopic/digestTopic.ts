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
    examples: z.array(z.string().min(1).max(120)).max(10),
    excludes: z.array(z.string().min(1).max(120)).max(10),
    embeddedAt: z.nullable(Instant.zodType),
    sortOrder: z.number().int().nonnegative(),
    enabled: z.boolean(),
    materialWindowHours: z.nullable(z.number().int().min(24).max(336)),
    createdAt: Instant.zodType,
    updatedAt: Instant.zodType,
  })
  .describe('DigestTopic');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type DigestTopic = z.output<typeof zodType>;
type ParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];
export type DigestTopicParseError = ParseError;
export type StoredDigestTopic =
  & DigestTopic
  & Readonly<{ embedding: Float32Array | null; excludeEmbedding: Float32Array | null }>;

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
  {
    userId: UserId;
    topicKey: string;
    embedding: Float32Array;
    excludeEmbedding: Float32Array | null;
    embeddedAt: Instant;
  }
>;

export type DigestTopicEdited = DigestTopicEvent<
  DigestTopic,
  'digestTopic.edited',
  {
    userId: UserId;
    topicKey: string;
    name: string;
    description: string;
    examples: ReadonlyArray<string>;
    excludes: ReadonlyArray<string>;
    updatedAt: Instant;
  }
>;
export type DigestTopicEnabledChanged = DigestTopicEvent<
  DigestTopic,
  'digestTopic.enabledChanged',
  { userId: UserId; topicKey: string; enabled: boolean; updatedAt: Instant }
>;
export type DigestTopicMaterialWindowChanged = DigestTopicEvent<
  DigestTopic,
  'digestTopic.materialWindowChanged',
  { userId: UserId; topicKey: string; materialWindowHours: number | null; updatedAt: Instant }
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

export type CreateDigestTopicPayload =
  & Pick<DigestTopic, 'userId' | 'topicKey' | 'name' | 'description' | 'sortOrder'>
  & Partial<Pick<DigestTopic, 'examples' | 'excludes'>>;

const create = (payload: CreateDigestTopicPayload, now: Instant): Result<DigestTopicCreated, ParseError> => {
  const parsed = schema.parse({
    examples: [],
    excludes: [],
    ...payload,
    embeddedAt: null,
    enabled: true,
    materialWindowHours: null,
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
  input: Pick<DigestTopic, 'name' | 'description'> & Partial<Pick<DigestTopic, 'examples' | 'excludes'>>,
  now: Instant,
): Result<DigestTopicEdited, ParseError> => {
  const parsed = schema.parse({
    ...topic,
    name: input.name,
    description: input.description,
    examples: input.examples ?? topic.examples,
    excludes: input.excludes ?? topic.excludes,
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
        examples: edited.examples,
        excludes: edited.excludes,
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

const setMaterialWindowHours = (
  topic: DigestTopic,
  materialWindowHours: number | null,
  now: Instant,
): Result<DigestTopicMaterialWindowChanged, ParseError> => {
  const parsed = schema.parse({ ...topic, materialWindowHours, updatedAt: now });
  if (!parsed.ok) return parsed;
  const changed = parsed.val;
  return ok(
    DigestTopicEvent.create(
      toAggregateId(changed),
      changed,
      'digestTopic.materialWindowChanged',
      {
        userId: changed.userId,
        topicKey: changed.topicKey,
        materialWindowHours: changed.materialWindowHours,
        updatedAt: now,
      },
      now,
    ),
  );
};

const toEmbeddingText = (topic: Pick<DigestTopic, 'name' | 'description'>): string =>
  `${topic.name}: ${topic.description}`;

const toEmbeddingTexts = (
  topic: Pick<DigestTopic, 'name' | 'description' | 'examples' | 'excludes'>,
): ReadonlyArray<string> => [toEmbeddingText(topic), ...topic.examples, ...topic.excludes];

const meanNormalized = (vectors: ReadonlyArray<ReadonlyArray<number>>): Float32Array => {
  const mean = new Float32Array(vectors[0]!.length);
  for (const vector of vectors) {
    for (let i = 0; i < mean.length; i++) mean[i]! += vector[i] ?? 0;
  }
  let squared = 0;
  for (let i = 0; i < mean.length; i++) {
    mean[i]! /= vectors.length;
    squared += mean[i]! * mean[i]!;
  }
  const norm = Math.sqrt(squared);
  if (norm > 0) {
    for (let i = 0; i < mean.length; i++) mean[i]! /= norm;
  }
  return mean;
};

const combineEmbeddings = (
  topic: Pick<DigestTopic, 'examples' | 'excludes'>,
  vectors: ReadonlyArray<ReadonlyArray<number>>,
): Readonly<{ embedding: Float32Array; excludeEmbedding: Float32Array | null }> => {
  const topicVectors = vectors.slice(0, 1 + topic.examples.length);
  const excludeVectors = vectors.slice(1 + topic.examples.length);
  return {
    embedding: topic.examples.length === 0 ? Float32Array.from(topicVectors[0]!) : meanNormalized(topicVectors),
    excludeEmbedding: excludeVectors.length === 0 ? null : meanNormalized(excludeVectors),
  };
};

const embed = (
  topic: DigestTopic,
  embeddings: Readonly<{ embedding: Float32Array; excludeEmbedding: Float32Array | null }>,
  now: Instant,
): Result<DigestTopicEmbedded, EmbeddingDimensionsError> => {
  const validated = Embedding.validate(embeddings.embedding);
  if (!validated.ok) return validated;
  if (embeddings.excludeEmbedding !== null) {
    const validatedExclude = Embedding.validate(embeddings.excludeEmbedding);
    if (!validatedExclude.ok) return validatedExclude;
  }
  const embedded: DigestTopic = { ...topic, embeddedAt: now };
  return ok(
    DigestTopicEvent.create(
      toAggregateId(embedded),
      embedded,
      'digestTopic.embedded',
      {
        userId: embedded.userId,
        topicKey: embedded.topicKey,
        embedding: validated.val,
        excludeEmbedding: embeddings.excludeEmbedding,
        embeddedAt: now,
      },
      now,
    ),
  );
};

export type DigestTopicCreatedStore = Agg.Store<DigestTopicCreated>;
export type DigestTopicEmbeddedStore = Agg.Store<DigestTopicEmbedded>;
export type DigestTopicEditedStore = Agg.Store<DigestTopicEdited>;
export type DigestTopicEnabledChangedStore = Agg.Store<DigestTopicEnabledChanged>;
export type DigestTopicMaterialWindowChangedStore = Agg.Store<DigestTopicMaterialWindowChanged>;
export type DigestTopicsResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<StoredDigestTopic>>;

export const DigestTopic = {
  ...schema,
  create,
  edit,
  setEnabled,
  setMaterialWindowHours,
  embed,
  toEmbeddingText,
  toEmbeddingTexts,
  combineEmbeddings,
  toAggregateId,
} as const;
