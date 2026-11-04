import { type RequestContext } from '@fedify/fedify';
import { Announce, type Recipient, Undo } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Post, PostNotFoundError, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { Repost, type RepostDeletedStore, type RepostResolver } from '../domain/repost/repost.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import {
  TimelineItem,
  type TimelineItemDeletedStore,
  type TimelineItemResolverByRepostId,
} from '../domain/timeline/timelineItem.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    postId: PostId;
    request: Request;
    ctx: RequestContext<unknown>;
  }>;

type Ok = void;

export type RepostNotFoundForUndoError = Readonly<{
  type: 'RepostNotFoundForUndoError';
  message: string;
  detail: {
    postId: PostId;
  };
}>;

export const RepostNotFoundForUndoError = {
  create: (postId: PostId): RepostNotFoundForUndoError => ({
    type: 'RepostNotFoundForUndoError',
    message: `No repost found for post "${postId}"`,
    detail: { postId },
  }),
} as const;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | RepostNotFoundForUndoError;

export type UndoRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: Agg.Resolver<ActorId, Actor | undefined>;
  repostResolver: RepostResolver;
  repostDeletedStore: RepostDeletedStore;
  timelineItemResolverByRepostId: TimelineItemResolverByRepostId;
  timelineItemDeletedStore: TimelineItemDeletedStore;
  postResolver: PostResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  actorResolverById,
  repostResolver,
  repostDeletedStore,
  timelineItemResolverByRepostId,
  timelineItemDeletedStore,
  postResolver,
}: Deps): UndoRepostUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const resolvePostOrErr = (postId: PostId): RA<Post, PostNotFoundError> =>
    RA.flow(
      postResolver.resolve(postId),
      RA.andThen((post) =>
        post === undefined
          ? RA.err(
            {
              type: 'PostNotFoundError',
              message: `Post not found: ${postId}`,
              detail: { postId },
            } as PostNotFoundError,
          )
          : RA.ok(post)
      ),
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      // Resolve the post
      RA.andBind('post', ({ postId }) => resolvePostOrErr(postId)),
      // Find the repost
      RA.andBind('repost', async ({ actor, postId }) => {
        return RA.flow(
          repostResolver.resolve({
            actorId: actor.id,
            postId,
          }),
          RA.andThen((repost) => {
            if (repost === undefined) {
              return RA.err(RepostNotFoundForUndoError.create(postId));
            }
            return RA.ok(repost);
          }),
        );
      }),
      RA.andBind('remote', ({ post }) => {
        // Local posts don't need ActivityPub delivery
        if (post.type === 'local') {
          return RA.ok(undefined);
        }

        return RA.flow(
          actorResolverById.resolve(post.actorId),
          RA.map((author) => {
            if (
              author?.type !== 'remote' || !URL.canParse(post.uri) || !URL.canParse(author.uri)
              || !URL.canParse(author.inboxUrl)
            ) {
              return undefined;
            }
            const recipient: Recipient = { id: new URL(author.uri), inboxId: new URL(author.inboxUrl) };
            return { noteId: new URL(post.uri), recipient };
          }),
        );
      }),
      // Delete the timeline item if it exists
      RA.andThrough(async ({ repost }) => {
        const timelineItemResult = await timelineItemResolverByRepostId.resolve({
          repostId: repost.repostId,
        });
        if (timelineItemResult.ok && timelineItemResult.val) {
          const deletedEvent = TimelineItem.deleteTimelineItem(
            timelineItemResult.val.timelineItemId,
            now,
          );
          await timelineItemDeletedStore.store(deletedEvent);
        }
        return RA.ok(undefined);
      }),
      // Delete the repost
      RA.andThrough(async ({ repost }) => {
        const deletedEvent = Repost.deleteRepost(repost, now);
        return repostDeletedStore.store(deletedEvent);
      }),
      // Send Undo Announce activity for remote posts
      RA.andThrough(async ({ ctx, user, repost, remote }) => {
        if (remote === undefined) {
          return RA.ok(undefined);
        }

        const actorUri = ctx.getActorUri(user.username);
        const followersUri = new URL(`${actorUri.href}/followers`);

        const announceId = repost.announceActivityUri
          ? new URL(repost.announceActivityUri)
          : new URL(`#announces/${repost.repostId}`, actorUri);

        await ctx.sendActivity(
          { username: user.username },
          remote.recipient,
          new Undo({
            id: new URL(`#undo-announces/${repost.repostId}`, actorUri),
            actor: actorUri,
            object: new Announce({
              id: announceId,
              actor: actorUri,
              object: remote.noteId,
            }),
            to: new URL('https://www.w3.org/ns/activitystreams#Public'),
            cc: followersUri,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UndoRepostUseCase = {
  create,
} as const;
