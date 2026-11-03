import { ok, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { Embedding, type EmbeddingDimensionsError } from './embedding.ts';
import { InterestSourceId } from './interestSourceId.ts';

export const interestSourceKinds = ['kosui_post', 'kosui_talk', 'kosui_external', 'own_post', 'own_like'] as const;
const kindZodType = z.enum(interestSourceKinds);
export type InterestSourceKind = z.output<typeof kindZodType>;

const weights: Readonly<Record<InterestSourceKind, number>> = {
  kosui_post: 1.0,
  kosui_talk: 1.0,
  kosui_external: 0.8,
  own_post: 0.5,
  own_like: 0.7,
};

const zodType = z
  .object({
    interestSourceId: InterestSourceId.zodType,
    userId: UserId.zodType,
    kind: kindZodType,
    ref: z.string().min(1),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    weight: z.number().positive(),
    occurredAt: Instant.zodType,
    embeddedAt: z.nullable(Instant.zodType),
    deletedAt: z.nullable(Instant.zodType),
    createdAt: Instant.zodType,
    updatedAt: Instant.zodType,
  })
  .describe('InterestSource');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type InterestSource = z.output<typeof zodType>;
type ParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];
export type InterestSourceParseError = ParseError;

export type InterestSourceAggregateId = Readonly<{
  interestSourceId: InterestSourceId;
}>;
export type InterestSourceAggregate = Agg.Aggregate<InterestSourceAggregateId, 'interestSource', InterestSource>;
const toAggregateId = (source: Pick<InterestSource, 'interestSourceId'>): InterestSourceAggregateId => ({
  interestSourceId: source.interestSourceId,
});

type InterestSourceEvent<
  TAggregateState extends Agg.InferState<InterestSourceAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<InterestSourceAggregate, TAggregateState, TEventName, TEventPayload>;
const InterestSourceEvent = AggregateEvent.createFactory<InterestSourceAggregate>('interestSource');

export type InterestSourceCreated = InterestSourceEvent<InterestSource, 'interestSource.created', InterestSource>;
export type InterestSourceContentChanged = InterestSourceEvent<
  InterestSource,
  'interestSource.contentChanged',
  { interestSourceId: InterestSourceId; contentHash: string; occurredAt: Instant }
>;
export type InterestSourceDeleted = InterestSourceEvent<
  InterestSource,
  'interestSource.deleted',
  { interestSourceId: InterestSourceId; deletedAt: Instant }
>;
export type InterestSourceEmbedded = InterestSourceEvent<
  InterestSource,
  'interestSource.embedded',
  { interestSourceId: InterestSourceId; embedding: Float32Array; embeddedAt: Instant }
>;

export type CreateInterestSourcePayload = Readonly<{
  userId: UserId;
  kind: InterestSourceKind;
  ref: string;
  contentHash: string;
  occurredAt: Instant;
}>;

const create = (
  payload: CreateInterestSourcePayload,
  now: Instant,
): Result<InterestSourceCreated, ParseError> => {
  const parsed = schema.parse({
    ...payload,
    interestSourceId: InterestSourceId.generate(),
    weight: weights[payload.kind],
    embeddedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  if (!parsed.ok) return parsed;
  const source = parsed.val;
  return {
    ...parsed,
    val: InterestSourceEvent.create(toAggregateId(source), source, 'interestSource.created', source, now),
  };
};

const changeContent = (
  source: InterestSource,
  change: Readonly<{ contentHash: string; occurredAt: Instant }>,
  now: Instant,
): Result<InterestSourceContentChanged, ParseError> => {
  const parsed = schema.parse({
    ...source,
    contentHash: change.contentHash,
    occurredAt: change.occurredAt,
    embeddedAt: null,
    deletedAt: null,
    updatedAt: now,
  });
  if (!parsed.ok) return parsed;
  const changed = parsed.val;
  return {
    ...parsed,
    val: InterestSourceEvent.create(
      toAggregateId(changed),
      changed,
      'interestSource.contentChanged',
      { interestSourceId: changed.interestSourceId, contentHash: changed.contentHash, occurredAt: changed.occurredAt },
      now,
    ),
  };
};

const markDeleted = (source: InterestSource, now: Instant): InterestSourceDeleted => {
  const deleted: InterestSource = { ...source, deletedAt: now };
  return InterestSourceEvent.create(
    toAggregateId(deleted),
    deleted,
    'interestSource.deleted',
    { interestSourceId: deleted.interestSourceId, deletedAt: now },
    now,
  );
};

const embed = (
  source: InterestSource,
  embedding: Float32Array,
  now: Instant,
): Result<InterestSourceEmbedded, EmbeddingDimensionsError> => {
  const validated = Embedding.validate(embedding);
  if (!validated.ok) return validated;
  const embedded: InterestSource = { ...source, embeddedAt: now };
  return ok(
    InterestSourceEvent.create(
      toAggregateId(embedded),
      embedded,
      'interestSource.embedded',
      { interestSourceId: embedded.interestSourceId, embedding: validated.val, embeddedAt: now },
      now,
    ),
  );
};

export type InterestSourceCreatedStore = Agg.Store<InterestSourceCreated>;
export type InterestSourceContentChangedStore = Agg.Store<InterestSourceContentChanged>;
export type InterestSourceDeletedStore = Agg.Store<InterestSourceDeleted>;
export type InterestSourceEmbeddedStore = Agg.Store<InterestSourceEmbedded>;
export type InterestSourcesResolverByUserIdAndKind = Agg.Resolver<
  { userId: UserId; kind: InterestSourceKind },
  ReadonlyArray<InterestSource>
>;
export type InterestSourcesResolverByUserIdAndKindIncludingDeleted = Agg.Resolver<
  { userId: UserId; kind: InterestSourceKind },
  ReadonlyArray<InterestSource>
>;
export type InterestSourcesResolverByUserIdAndKindsPendingEmbedding = Agg.Resolver<
  { userId: UserId; kinds: ReadonlyArray<InterestSourceKind>; limit: number },
  ReadonlyArray<InterestSource>
>;

export const InterestSource = {
  ...schema,
  weights,
  create,
  changeContent,
  markDeleted,
  embed,
  toAggregateId,
} as const;
