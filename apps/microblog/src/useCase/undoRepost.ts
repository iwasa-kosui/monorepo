import { Announce, isActor, Note, type RequestContext, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Post, PostNotFoundError, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { Repost, type RepostDeletedStore, type RepostResolver } from '../domain/repost/repost.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import {
  TimelineItem,
  type TimelineItemDeletedStore,
  type TimelineItemResolverByRepostId,
} from '../domain/timeline/timelineItem.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
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

export type RemoteNoteLookupError = Readonly<{
  type: 'RemoteNoteLookupError';
  message: string;
  detail: {
    objectUri: string;
    reason: string;
  };
}>;

export const RemoteNoteLookupError = {
  create: (objectUri: string, reason: string): RemoteNoteLookupError => ({
    type: 'RemoteNoteLookupError',
    message: `Failed to lookup remote note "${objectUri}": ${reason}`,
    detail: { objectUri, reason },
  }),
} as const;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | RepostNotFoundForUndoError
  | RemoteNoteLookupError;

export type UndoRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
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
  repostResolver,
  repostDeletedStore,
  timelineItemResolverByRepostId,
  timelineItemDeletedStore,
  postResolver,
}: Deps): UndoRepostUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
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
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
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
      RA.andThrough(async ({ ctx, user, repost, post }) => {
        // Local posts don't need ActivityPub delivery
        if (post.type === 'local') {
          return RA.ok(undefined);
        }

        const objectUri = post.uri;
        const documentLoader = await ctx.getDocumentLoader({
          identifier: user.username,
        });
        const result = await ctx.lookupObject(objectUri.trim(), {
          documentLoader,
        });

        if (!(result instanceof Note)) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Not a valid Note object'),
          );
        }

        if (!result.id) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Could not resolve Note ID'),
          );
        }

        const author = await result.getAttribution();
        if (!author || !isActor(author)) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Could not resolve Note author'),
          );
        }
        if (!author.id || !author.inboxId) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Note author has no inbox'),
          );
        }

        const actorUri = ctx.getActorUri(user.username);
        const followersUri = new URL(`${actorUri.href}/followers`);

        const announceId = repost.announceActivityUri
          ? new URL(repost.announceActivityUri)
          : new URL(`#announces/${repost.repostId}`, actorUri);

        await ctx.sendActivity(
          { username: user.username },
          author,
          new Undo({
            id: new URL(`#undo-announces/${repost.repostId}`, actorUri),
            actor: actorUri,
            object: new Announce({
              id: announceId,
              actor: actorUri,
              object: result.id,
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
