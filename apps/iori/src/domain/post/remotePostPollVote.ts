import { err, ok, type RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from './postId.ts';
import { RemotePostPoll } from './remotePostPoll.ts';

const zodType = z.object({
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  choices: z.array(z.number().int().nonnegative()).min(1),
});
const schema = Schema.create(zodType);

export type RemotePostPollVote = z.infer<typeof zodType>;

export type RemotePostPollVoteAggregateId = Readonly<{
  postId: PostId;
  actorId: ActorId;
}>;
export type RemotePostPollVoteAggregate = Agg.Aggregate<
  RemotePostPollVoteAggregateId,
  'remotePostPollVote',
  RemotePostPollVote
>;

export const RemotePostPollVoteEvent = AggregateEvent.createFactory<RemotePostPollVoteAggregate>(
  'remotePostPollVote',
);

export type RemotePostPollVoted = DomainEvent<
  RemotePostPollVoteAggregate,
  RemotePostPollVote,
  'remotePostPollVote.voted',
  RemotePostPollVote
>;
export type RemotePostPollVotedStore = Readonly<{
  store: (event: RemotePostPollVoted) => RA<Readonly<{ written: boolean }>, never>;
}>;

export type RemotePostPollVotesResolverByPostIds = Agg.Resolver<
  Readonly<{ actorId: ActorId; postIds: ReadonlyArray<PostId> }>,
  ReadonlyMap<PostId, ReadonlyArray<number>>
>;

export type PollNotFoundError = Readonly<{
  type: 'PollNotFoundError';
  message: string;
  detail: { postId: PostId };
}>;

export const PollNotFoundError = {
  create: (postId: PostId): PollNotFoundError => ({
    type: 'PollNotFoundError',
    message: `The post "${postId}" has no remote poll.`,
    detail: { postId },
  }),
} as const;

export type PollClosedError = Readonly<{
  type: 'PollClosedError';
  message: string;
  detail: { postId: PostId };
}>;

export const PollClosedError = {
  create: (postId: PostId): PollClosedError => ({
    type: 'PollClosedError',
    message: `The poll of the post "${postId}" is closed.`,
    detail: { postId },
  }),
} as const;

export type AlreadyVotedError = Readonly<{
  type: 'AlreadyVotedError';
  message: string;
  detail: { actorId: ActorId; postId: PostId };
}>;

export const AlreadyVotedError = {
  create: ({ actorId, postId }: { actorId: ActorId; postId: PostId }): AlreadyVotedError => ({
    type: 'AlreadyVotedError',
    message: `The actor with ID "${actorId}" has already voted in the poll of the post "${postId}".`,
    detail: { actorId, postId },
  }),
} as const;

export type InvalidPollChoicesReason = 'empty' | 'outOfRange' | 'duplicated' | 'tooMany';

export type InvalidPollChoicesError = Readonly<{
  type: 'InvalidPollChoicesError';
  message: string;
  detail: { postId: PostId; reason: InvalidPollChoicesReason };
}>;

export const InvalidPollChoicesError = {
  create: (postId: PostId, reason: InvalidPollChoicesReason): InvalidPollChoicesError => ({
    type: 'InvalidPollChoicesError',
    message: `The choices for the poll of the post "${postId}" are invalid: ${reason}.`,
    detail: { postId, reason },
  }),
} as const;

export type PollAuthorBlockedError = Readonly<{
  type: 'PollAuthorBlockedError';
  message: string;
  detail: { postId: PostId };
}>;

export const PollAuthorBlockedError = {
  create: (postId: PostId): PollAuthorBlockedError => ({
    type: 'PollAuthorBlockedError',
    message: `The author of the poll of the post "${postId}" is blocked.`,
    detail: { postId },
  }),
} as const;

const validateChoices = (
  postId: PostId,
  poll: RemotePostPoll,
  choices: ReadonlyArray<number>,
): InvalidPollChoicesError | undefined => {
  if (choices.length === 0) return InvalidPollChoicesError.create(postId, 'empty');
  if (!choices.every((choice) => Number.isInteger(choice) && choice >= 0 && choice < poll.options.length)) {
    return InvalidPollChoicesError.create(postId, 'outOfRange');
  }
  if (new Set(choices).size !== choices.length) return InvalidPollChoicesError.create(postId, 'duplicated');
  if (!poll.multiple && choices.length > 1) return InvalidPollChoicesError.create(postId, 'tooMany');
  return undefined;
};

const vote = (
  payload: Readonly<{ postId: PostId; actorId: ActorId; choices: ReadonlyArray<number> }>,
  poll: RemotePostPoll,
  ownChoices: ReadonlyArray<number>,
  now: Instant,
): Result<RemotePostPollVoted, PollClosedError | AlreadyVotedError | InvalidPollChoicesError> => {
  if (RemotePostPoll.isExpired(poll, now)) return err(PollClosedError.create(payload.postId));
  if (ownChoices.length > 0) {
    return err(AlreadyVotedError.create({ actorId: payload.actorId, postId: payload.postId }));
  }
  const invalid = validateChoices(payload.postId, poll, payload.choices);
  if (invalid !== undefined) return err(invalid);
  const state: RemotePostPollVote = {
    postId: payload.postId,
    actorId: payload.actorId,
    choices: [...payload.choices].sort((a, b) => a - b),
  };
  return ok(RemotePostPollVoteEvent.create(
    { postId: state.postId, actorId: state.actorId },
    state,
    'remotePostPollVote.voted',
    state,
    now,
  ));
};

export const RemotePostPollVote = {
  ...schema,
  vote,
} as const;
