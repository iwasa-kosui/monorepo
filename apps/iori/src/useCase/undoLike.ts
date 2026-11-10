import { type RequestContext } from '@fedify/fedify';
import { Like, type Recipient, Undo } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Like as AppLike,
  type LikeResolver,
  type LocalLike,
  type LocalLikeDeletedStore,
  NotLikedError,
} from '../domain/like/like.ts';
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

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | NotLikedError;

export type UndoLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: Agg.Resolver<ActorId, Actor | undefined>;
  likeResolver: LikeResolver;
  localLikeDeletedStore: LocalLikeDeletedStore;
  postResolver: PostResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  actorResolverById,
  likeResolver,
  localLikeDeletedStore,
  postResolver,
}: Deps): UndoLikeUseCase => {
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
      // Find the like (must be a local like)
      RA.andBind('like', async ({ actor, postId }): RA<LocalLike, NotLikedError> => {
        return RA.flow(
          likeResolver.resolve({
            actorId: actor.id,
            postId,
          }),
          RA.andThen((like) => {
            if (like === undefined || like.type !== 'local') {
              return RA.err(NotLikedError.create(postId));
            }
            return RA.ok(like);
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
            return { noteId: new URL(post.uri), recipient, authorId: new URL(author.uri) };
          }),
        );
      }),
      // Delete the like
      RA.andThrough(async ({ like }) => {
        const deletedEvent = AppLike.deleteLocalLike(like, now);
        return localLikeDeletedStore.store(deletedEvent);
      }),
      // Send Undo Like activity for remote posts
      RA.andThrough(async ({ ctx, user, like, remote }) => {
        if (remote === undefined) {
          return RA.ok(undefined);
        }

        const actorUri = ctx.getActorUri(user.username);

        await ctx.sendActivity(
          { username: user.username },
          remote.recipient,
          new Undo({
            id: new URL(`#undo-likes/${like.likeId}`, actorUri),
            actor: actorUri,
            object: new Like({
              id: new URL(`#likes/${like.likeId}`, actorUri),
              actor: actorUri,
              object: remote.noteId,
            }),
            to: remote.authorId,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UndoLikeUseCase = {
  create,
} as const;
