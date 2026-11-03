import { isActor, Like, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  AlreadyLikedError,
  Like as AppLike,
  type LikeResolver,
  type LocalLikeCreatedStore,
} from '../domain/like/like.ts';
import { LikeId } from '../domain/like/likeId.ts';
import type { Post, PostNotFoundError, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
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
  | AlreadyLikedError;

export type SendLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  localLikeCreatedStore: LocalLikeCreatedStore;
  likeResolver: LikeResolver;
  postResolver: PostResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  localLikeCreatedStore,
  likeResolver,
  postResolver,
}: Deps): SendLikeUseCase => {
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
      // Check if already liked
      RA.andThrough(async ({ actor, postId }) => {
        return RA.flow(
          likeResolver.resolve({
            actorId: actor.id,
            postId,
          }),
          RA.andThen((like) => {
            if (like !== undefined) {
              return RA.err(
                AlreadyLikedError.create({ actorId: actor.id, postId }),
              );
            }
            return RA.ok(undefined);
          }),
        );
      }),
      RA.andBind('remote', async ({ user, post, ctx }) => {
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

        return RA.ok({ noteId: result.id, author, authorId: author.id });
      }),
      // Create and store like
      RA.bind('likeCreated', ({ actor, postId }) =>
        AppLike.createLocalLike(
          {
            likeId: LikeId.generate(),
            actorId: actor.id,
            postId,
          },
          now,
        )),
      RA.andThrough(async ({ likeCreated }) => localLikeCreatedStore.store(likeCreated)),
      // Send ActivityPub Like if remote post
      RA.andThrough(async ({ user, ctx, likeCreated, remote }) => {
        if (remote === undefined) {
          return RA.ok(undefined);
        }

        await ctx.sendActivity(
          { username: user.username },
          remote.author,
          new Like({
            id: new URL(
              `#likes/${likeCreated.aggregateId.likeId}`,
              ctx.getActorUri(user.username),
            ),
            actor: ctx.getActorUri(user.username),
            object: remote.noteId,
            to: remote.authorId,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const SendLikeUseCase = {
  create,
} as const;
