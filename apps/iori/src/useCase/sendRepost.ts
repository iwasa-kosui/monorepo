import { Announce, isActor, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { RemotePostUpserter } from '../adaptor/pg/post/remotePostUpserter.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Post, PostNotFoundError, PostResolver, RemotePost } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { AlreadyRepostedError, Repost, type RepostCreatedStore, type RepostResolver } from '../domain/repost/repost.ts';
import { RepostId } from '../domain/repost/repostId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
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
  | RemoteNoteLookupError
  | AlreadyRepostedError;

export type SendRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  repostCreatedStore: RepostCreatedStore;
  repostResolver: RepostResolver;
  remotePostUpserter: RemotePostUpserter;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  postResolver: PostResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  repostCreatedStore,
  repostResolver,
  remotePostUpserter,
  timelineItemCreatedStore,
  postResolver,
}: Deps): SendRepostUseCase => {
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
      // Check if already reposted
      RA.andThrough(async ({ actor, postId }) => {
        return RA.flow(
          repostResolver.resolve({
            actorId: actor.id,
            postId,
          }),
          RA.andThen((repost) => {
            if (repost !== undefined) {
              return RA.err(
                AlreadyRepostedError.create({ actorId: actor.id, postId }),
              );
            }
            return RA.ok(undefined);
          }),
        );
      }),
      // Create, store Repost and TimelineItem
      RA.andThrough(async ({ actor, postId, post, ctx, user }) => {
        const repostId = RepostId.generate();

        // For local posts, no ActivityPub needed
        if (post.type === 'local') {
          const repostCreated = Repost.createRepost(
            {
              repostId,
              actorId: actor.id,
              postId,
              announceActivityUri: null,
            },
            now,
          );

          await repostCreatedStore.store(repostCreated);

          const timelineItemEvent = TimelineItem.createTimelineItem({
            timelineItemId: TimelineItemId.generate(),
            type: 'repost',
            actorId: actor.id,
            postId,
            repostId: repostCreated.aggregateState.repostId,
            createdAt: now,
          }, now);
          await timelineItemCreatedStore.store(timelineItemEvent);

          return RA.ok(undefined);
        }

        // For remote posts, we need to lookup and send ActivityPub
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

        // Ensure remote post exists for timeline display
        const noteAuthorIcon = await author.getIcon();
        const remotePostResult = await remotePostUpserter.resolve({
          uri: objectUri,
          content: String(result.content ?? ''),
          authorIdentity: {
            uri: author.id.href,
            inboxUrl: author.inboxId.href,
            url: author.url instanceof URL ? author.url.href : undefined,
            username: typeof author.preferredUsername === 'string'
              ? author.preferredUsername
              : author.preferredUsername?.toString(),
            logoUri: noteAuthorIcon?.url instanceof URL ? noteAuthorIcon.url.href : undefined,
          },
        });

        if (!remotePostResult.ok) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Failed to upsert remote post'),
          );
        }

        const remotePost: RemotePost = remotePostResult.val;

        const announceActivityUri = new URL(
          `#announces/${repostId}`,
          ctx.getActorUri(user.username),
        ).href;

        const repostCreated = Repost.createRepost(
          {
            repostId,
            actorId: actor.id,
            postId: remotePost.postId,
            announceActivityUri,
          },
          now,
        );

        await repostCreatedStore.store(repostCreated);

        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'repost',
          actorId: actor.id,
          postId: remotePost.postId,
          repostId: repostCreated.aggregateState.repostId,
          createdAt: now,
        }, now);
        await timelineItemCreatedStore.store(timelineItemEvent);

        // Send the Announce activity
        const actorUri = ctx.getActorUri(user.username);
        const followersUri = new URL(`${actorUri.href}/followers`);

        await ctx.sendActivity(
          { username: user.username },
          author,
          new Announce({
            id: new URL(
              `#announces/${repostCreated.aggregateState.repostId}`,
              actorUri,
            ),
            actor: actorUri,
            object: result.id,
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

export const SendRepostUseCase = {
  create,
} as const;
