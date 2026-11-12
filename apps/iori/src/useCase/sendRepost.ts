import { type RequestContext } from '@fedify/fedify';
import { isActor } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';

import { ActorIdentity } from '../adaptor/fedify/actorIdentity.ts';
import { extractContentWarning } from '../adaptor/fedify/extractContentWarning.ts';
import { extractQuoteUri } from '../adaptor/fedify/extractQuoteUri.ts';
import { extractRecipientActorUris } from '../adaptor/fedify/extractRecipients.ts';
import { extractVisibility } from '../adaptor/fedify/extractVisibility.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ArticleResolverByRootPostId } from '../domain/article/article.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Post,
  type PostNotFoundError,
  type PostResolver,
  type RemotePost,
  type RemotePostUpserter,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { Visibility } from '../domain/post/visibility.ts';
import {
  AlreadyRepostedError,
  Repost,
  type RepostCreatedStore,
  RepostNotAllowedError,
  type RepostResolver,
} from '../domain/repost/repost.ts';
import { RepostId } from '../domain/repost/repostId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { buildRemotePostBody, isRemotePostObject } from './helper/remotePostObject.ts';
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

type Ok = Readonly<{ repostId: RepostId }>;

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
  | AlreadyRepostedError
  | RepostNotAllowedError;

export type SendRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  repostCreatedStore: RepostCreatedStore;
  repostResolver: RepostResolver;
  remotePostUpserter: RemotePostUpserter;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  postResolver: PostResolver;
  articleResolverByRootPostId: ArticleResolverByRootPostId;
}>;

const create = ({
  origin,
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  repostCreatedStore,
  repostResolver,
  remotePostUpserter,
  timelineItemCreatedStore,
  postResolver,
  articleResolverByRootPostId,
}: Deps): SendRepostUseCase => {
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
      RA.andBind(
        'createdRepostId',
        async (
          { actor, postId, post, ctx, user },
        ): RA<RepostId, RemoteNoteLookupError | RepostNotAllowedError | UserNotFoundError> => {
          const repostId = RepostId.generate();

          const announceId = repostAnnounceUri(ctx, user.username, repostId);

          if (post.type === 'local') {
            if (!Post.isVisibleToAnonymous(post)) {
              return RA.err(RepostNotAllowedError.create({ postId }));
            }
            const postAuthor = await resolveUser(post.userId);
            if (!postAuthor.ok) {
              return postAuthor;
            }

            const repostCreated = Repost.createRepost(
              {
                repostId,
                actorId: actor.id,
                postId,
                announceActivityUri: announceId.href,
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

            const objectUri = await resolveLocalPostObjectUri({
              ctx,
              authorUsername: postAuthor.val.username,
              postId,
              articleResolverByRootPostId,
            });
            await ctx.sendActivity(
              { identifier: user.username },
              'followers',
              createRepostAnnounce({
                ctx,
                username: user.username,
                id: announceId,
                object: objectUri,
                authorActorUri: ctx.getActorUri(postAuthor.val.username),
                published: Temporal.Instant.fromEpochMilliseconds(now),
              }),
            );
            return RA.ok(repostId);
          }

          // For remote posts, we need to lookup and send ActivityPub
          const objectUri = post.uri;
          const documentLoader = await ctx.getDocumentLoader({
            identifier: user.username,
          });
          const result = await ctx.lookupObject(objectUri.trim(), {
            documentLoader,
          });

          if (!isRemotePostObject(result)) {
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

          const fetchedVisibility = extractVisibility(result, author.followersId);
          if (fetchedVisibility === null || !Visibility.isVisibleToAnonymous(fetchedVisibility)) {
            return RA.err(RepostNotAllowedError.create({ postId }));
          }

          // Ensure remote post exists for timeline display
          const authorIdentity = await ActorIdentity.fromFedifyActor(author);
          if (!authorIdentity.ok) {
            return RA.err(
              RemoteNoteLookupError.create(objectUri, authorIdentity.err.message),
            );
          }
          const remotePostResult = await remotePostUpserter.resolve({
            uri: objectUri,
            ...await buildRemotePostBody(result),
            ...extractContentWarning(result),
            visibility: fetchedVisibility,
            recipientActorUris: extractRecipientActorUris([result], origin),
            quoteUri: await extractQuoteUri(result),
            authorIdentity: authorIdentity.val,
          });

          if (!remotePostResult.ok) {
            return RA.err(
              RemoteNoteLookupError.create(objectUri, 'Failed to upsert remote post'),
            );
          }

          const remotePost: RemotePost = remotePostResult.val;

          const repostCreated = Repost.createRepost(
            {
              repostId,
              actorId: actor.id,
              postId: remotePost.postId,
              announceActivityUri: announceId.href,
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

          const announce = createRepostAnnounce({
            ctx,
            username: user.username,
            id: announceId,
            object: result.id,
            authorActorUri: author.id,
            published: Temporal.Instant.fromEpochMilliseconds(now),
          });
          await ctx.sendActivity({ identifier: user.username }, author, announce);
          await ctx.sendActivity({ identifier: user.username }, 'followers', announce);
          return RA.ok(repostId);
        },
      ),
      RA.map(({ createdRepostId }) => ({ repostId: createdRepostId })),
    );

  return { run };
};

export const SendRepostUseCase = {
  create,
} as const;
