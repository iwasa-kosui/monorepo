import { type RequestContext } from '@fedify/fedify';
import { Create, isActor, Note, Question } from '@fedify/vocab';
import { RA, type Result } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import type { BlockedActorUriResolverByUsername } from '../domain/block/block.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PostNotFoundError, type PostResolver, type RemotePost } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { RemotePostPoll, RemotePostPollsResolverByPostIds } from '../domain/post/remotePostPoll.ts';
import {
  AlreadyVotedError,
  type InvalidPollChoicesError,
  PollAuthorBlockedError,
  type PollClosedError,
  PollNotFoundError,
  RemotePostPollVote,
  type RemotePostPollVoted,
  type RemotePostPollVotedStore,
  type RemotePostPollVotesResolverByPostIds,
} from '../domain/post/remotePostPollVote.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { Username } from '../domain/user/username.ts';
import { isBlockedActorUri } from './helper/isBlockedActorUri.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import { RemoteNoteLookupError } from './sendLike.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    postId: PostId;
    choices: ReadonlyArray<number>;
    ctx: RequestContext<unknown>;
  }>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | PollNotFoundError
  | PollClosedError
  | AlreadyVotedError
  | InvalidPollChoicesError
  | PollAuthorBlockedError
  | RemoteNoteLookupError;

export type VotePollUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: Agg.Resolver<ActorId, Actor | undefined>;
  postResolver: PostResolver;
  remotePostPollsResolver: RemotePostPollsResolverByPostIds;
  remotePostPollVotesResolver: RemotePostPollVotesResolverByPostIds;
  remotePostPollVotedStore: RemotePostPollVotedStore;
  blockedActorUriResolverByUsername: BlockedActorUriResolverByUsername;
  isBlockedUri: (uri: string) => boolean;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  actorResolverById,
  postResolver,
  remotePostPollsResolver,
  remotePostPollVotesResolver,
  remotePostPollVotedStore,
  blockedActorUriResolverByUsername,
  isBlockedUri,
}: Deps): VotePollUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const resolveRemotePostOrErr = (postId: PostId): RA<RemotePost, PostNotFoundError | PollNotFoundError> =>
    RA.flow(
      postResolver.resolve(postId),
      RA.andThen((post): RA<RemotePost, PostNotFoundError | PollNotFoundError> =>
        post === undefined
          ? RA.err(PostNotFoundError.create(postId))
          : post.type === 'remote'
          ? RA.ok(post)
          : RA.err(PollNotFoundError.create(postId))
      ),
    );

  const resolvePollOrErr = (postId: PostId): RA<RemotePostPoll, PollNotFoundError> =>
    RA.flow(
      remotePostPollsResolver.resolve([postId]),
      RA.andThen((polls) => {
        const poll = polls.get(postId);
        return poll === undefined ? RA.err(PollNotFoundError.create(postId)) : RA.ok(poll);
      }),
    );

  const resolveOwnChoices = (actorId: ActorId, postId: PostId): RA<ReadonlyArray<number>, never> =>
    RA.flow(
      remotePostPollVotesResolver.resolve({ actorId, postIds: [postId] }),
      RA.map((votes) => votes.get(postId) ?? []),
    );

  const errIfAuthorBlocked = async (
    post: RemotePost,
    username: Username,
  ): Promise<Result<void, PollAuthorBlockedError | RemoteNoteLookupError>> => {
    const author = await actorResolverById.resolve(post.actorId);
    if (!author.ok || author.val === undefined) {
      return RA.err(RemoteNoteLookupError.create(post.uri, 'Could not resolve poll author'));
    }
    const blocked = isBlockedUri(post.uri) || isBlockedUri(author.val.uri)
      || await isBlockedActorUri(blockedActorUriResolverByUsername, username, author.val.uri);
    return blocked ? RA.err(PollAuthorBlockedError.create(post.postId)) : RA.ok(undefined);
  };

  const lookupQuestion = async (
    ctx: RequestContext<unknown>,
    username: Username,
    objectUri: string,
  ) => {
    const documentLoader = await ctx.getDocumentLoader({ identifier: username });
    const result = await ctx.lookupObject(objectUri.trim(), { documentLoader });
    if (!(result instanceof Question)) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Not a valid Question object'));
    }
    if (!result.id) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Could not resolve Question ID'));
    }
    const author = await result.getAttribution();
    if (!author || !isActor(author)) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Could not resolve Question author'));
    }
    if (!author.id || !author.inboxId) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Question author has no inbox'));
    }
    return RA.ok({ questionId: result.id, author, authorId: author.id });
  };

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('post', ({ postId }) => resolveRemotePostOrErr(postId)),
      RA.andBind('poll', ({ postId }) => resolvePollOrErr(postId)),
      RA.andBind('ownChoices', ({ actor, postId }) => resolveOwnChoices(actor.id, postId)),
      RA.andBind('voted', ({ actor, postId, choices, poll, ownChoices }): RA<
        RemotePostPollVoted,
        PollClosedError | AlreadyVotedError | InvalidPollChoicesError
      > => {
        const voted = RemotePostPollVote.vote({ postId, actorId: actor.id, choices }, poll, ownChoices, now);
        return voted.ok ? RA.ok(voted.val) : RA.err(voted.err);
      }),
      RA.andThrough(({ post, user }) => errIfAuthorBlocked(post, user.username)),
      RA.andBind('remote', ({ ctx, user, post }) => lookupQuestion(ctx, user.username, post.uri)),
      RA.andThrough(({ voted }) =>
        RA.flow(
          remotePostPollVotedStore.store(voted),
          RA.andThen(({ written }): RA<void, AlreadyVotedError> =>
            written
              ? RA.ok(undefined)
              : RA.err(AlreadyVotedError.create({
                actorId: voted.aggregateState.actorId,
                postId: voted.aggregateState.postId,
              }))
          ),
        )
      ),
      RA.andThrough(async ({ ctx, user, poll, voted, remote }) => {
        const actorUri = ctx.getActorUri(user.username);
        for (const choice of voted.aggregateState.choices) {
          const note = new Note({
            id: ctx.getObjectUri(Note, { identifier: user.username, id: crypto.randomUUID() }),
            name: poll.options[choice]?.title ?? '',
            replyTarget: remote.questionId,
            attribution: actorUri,
            to: remote.authorId,
          });
          await ctx.sendActivity(
            { username: user.username },
            remote.author,
            new Create({
              id: new URL('#activity', note.id ?? undefined),
              actor: actorUri,
              object: note,
              to: remote.authorId,
            }),
          );
        }
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const VotePollUseCase = {
  create,
} as const;
