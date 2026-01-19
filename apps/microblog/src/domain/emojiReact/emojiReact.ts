import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { EmojiReactId } from './emojiReactId.ts';

const zodType = z
  .object({
    emojiReactId: EmojiReactId.zodType,
    actorId: ActorId.zodType,
    objectUri: z.string(),
    emoji: z.string(),
    emojiReactActivityUri: z.nullable(z.string()),
    emojiImageUrl: z.nullable(z.string()),
  })
  .describe('EmojiReact');

const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type EmojiReact = z.output<typeof zodType>;
export type EmojiReactAggregateId = Readonly<{
  emojiReactId: EmojiReactId;
}>;
export type EmojiReactAggregate = Agg.Aggregate<EmojiReactAggregateId, 'emojiReact', EmojiReact>;
const toAggregateId = (emojiReact: EmojiReact): EmojiReactAggregateId => ({
  emojiReactId: emojiReact.emojiReactId,
});

type EmojiReactEvent<
  TAggregateState extends Agg.InferState<EmojiReactAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<EmojiReactAggregate, TAggregateState, TEventName, TEventPayload>;
const EmojiReactEvent = AggregateEvent.createFactory<EmojiReactAggregate>('emojiReact');

export type EmojiReactCreated = EmojiReactEvent<EmojiReact, 'emojiReact.emojiReactCreated', EmojiReact>;
export type EmojiReactDeleted = EmojiReactEvent<
  undefined,
  'emojiReact.emojiReactDeleted',
  { emojiReactActivityUri: string }
>;

const createEmojiReact = (payload: EmojiReact, now: Instant): EmojiReactCreated => {
  return EmojiReactEvent.create(
    toAggregateId(payload),
    payload,
    'emojiReact.emojiReactCreated',
    payload,
    now,
  );
};

const deleteEmojiReact = (emojiReact: EmojiReact, now: Instant): EmojiReactDeleted => {
  if (!emojiReact.emojiReactActivityUri) {
    throw new Error('Cannot delete an emoji react without emojiReactActivityUri');
  }
  return EmojiReactEvent.create(
    toAggregateId(emojiReact),
    undefined,
    'emojiReact.emojiReactDeleted',
    { emojiReactActivityUri: emojiReact.emojiReactActivityUri },
    now,
  );
};

export type EmojiReactCreatedStore = Agg.Store<EmojiReactCreated>;
export type EmojiReactDeletedStore = Agg.Store<EmojiReactDeleted>;
export type EmojiReactResolverByActivityUri = Agg.Resolver<
  { emojiReactActivityUri: string },
  EmojiReact | undefined
>;
export type EmojiReactResolverByActorAndObjectAndEmoji = Agg.Resolver<
  { actorId: ActorId; objectUri: string; emoji: string },
  EmojiReact | undefined
>;
export type EmojiReactsResolverByObjectUri = Agg.Resolver<
  { objectUri: string },
  ReadonlyArray<EmojiReact>
>;

export const EmojiReact = {
  ...schema,
  createEmojiReact,
  deleteEmojiReact,
  toAggregateId,
} as const;

export type AlreadyReactedError = Readonly<{
  type: 'AlreadyReactedError';
  message: string;
  detail: {
    actorId: ActorId;
    objectUri: string;
    emoji: string;
  };
}>;

export const AlreadyReactedError = {
  create: ({
    actorId,
    objectUri,
    emoji,
  }: { actorId: ActorId; objectUri: string; emoji: string }): AlreadyReactedError => ({
    type: 'AlreadyReactedError',
    message: `The actor with ID "${actorId}" has already reacted with "${emoji}" to the object "${objectUri}".`,
    detail: { actorId, objectUri, emoji },
  }),
} as const;

export type EmojiReactNotFoundError = Readonly<{
  type: 'EmojiReactNotFoundError';
  message: string;
  detail: {
    emojiReactActivityUri: string;
  };
}>;

export const EmojiReactNotFoundError = {
  create: ({ emojiReactActivityUri }: { emojiReactActivityUri: string }): EmojiReactNotFoundError => ({
    type: 'EmojiReactNotFoundError',
    message: `The emoji react activity "${emojiReactActivityUri}" was not found.`,
    detail: { emojiReactActivityUri },
  }),
} as const;
