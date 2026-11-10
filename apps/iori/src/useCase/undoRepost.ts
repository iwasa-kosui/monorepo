import { type RequestContext } from '@fedify/fedify';
import { PUBLIC_COLLECTION, type Recipient, Undo } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import type { ArticleResolverByRootPostId } from '../domain/article/article.ts';
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
import { createRepostAnnounce, repostAnnounceUri, resolveLocalPostObjectUri } from './helper/repostAnnounce.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith, resolveUserWith } from './helper/resolve.ts';
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
  articleResolverByRootPostId: ArticleResolverByRootPostId;
}>;

type UndoTarget =
  | Readonly<{ type: 'local'; objectUri: URL; authorActorUri: URL }>
  | Readonly<{ type: 'remote'; objectUri: URL; authorActorUri: URL; recipient: Recipient }>
  | Readonly<{ type: 'remoteAuthorUnresolved'; objectUri: URL | undefined; authorActorUri: URL | undefined }>;

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
  articleResolverByRootPostId,
}: Deps): UndoRepostUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);
  const resolveUser = resolveUserWith(userResolver);

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
      RA.andBind('target', async ({ post, ctx }): RA<UndoTarget, UserNotFoundError> => {
        if (post.type === 'local') {
          const postAuthor = await resolveUser(post.userId);
          if (!postAuthor.ok) {
            return postAuthor;
          }
          const objectUri = await resolveLocalPostObjectUri({
            ctx,
            authorUsername: postAuthor.val.username,
            postId: post.postId,
            articleResolverByRootPostId,
          });
          return RA.ok({
            type: 'local',
            objectUri,
            authorActorUri: ctx.getActorUri(postAuthor.val.username),
          });
        }

        return RA.flow(
          actorResolverById.resolve(post.actorId),
          RA.map((author): UndoTarget => {
            const objectUri = URL.canParse(post.uri) ? new URL(post.uri) : undefined;
            const authorActorUri = author?.type === 'remote' && URL.canParse(author.uri)
              ? new URL(author.uri)
              : undefined;
            if (
              author?.type !== 'remote' || objectUri === undefined || authorActorUri === undefined
              || !URL.canParse(author.inboxUrl)
            ) {
              return { type: 'remoteAuthorUnresolved', objectUri, authorActorUri };
            }
            const recipient: Recipient = { id: authorActorUri, inboxId: new URL(author.inboxUrl) };
            return { type: 'remote', objectUri, authorActorUri, recipient };
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
      RA.andThrough(async ({ ctx, user, repost, target }) => {
        if (target.objectUri === undefined) {
          return RA.ok(undefined);
        }

        const actorUri = ctx.getActorUri(user.username);
        const undo = new Undo({
          id: new URL(`#undo-announces/${repost.repostId}`, actorUri),
          actor: actorUri,
          object: createRepostAnnounce({
            ctx,
            username: user.username,
            id: repost.announceActivityUri
              ? new URL(repost.announceActivityUri)
              : repostAnnounceUri(ctx, user.username, repost.repostId),
            object: target.objectUri,
            authorActorUri: target.authorActorUri,
          }),
          to: PUBLIC_COLLECTION,
          cc: ctx.getFollowersUri(user.username),
        });

        if (target.type === 'remote') {
          await ctx.sendActivity({ identifier: user.username }, target.recipient, undo);
        }
        await ctx.sendActivity({ identifier: user.username }, 'followers', undo);
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UndoRepostUseCase = {
  create,
} as const;
