import type { RequestContext } from '@fedify/fedify';
import { Result } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import {
  Post,
  type PostsWithAuthorResolverByPostIds,
  type PostWithAuthor,
  type ThreadResolver,
} from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { RepostResolver, RepostResolverById } from '../../domain/repost/repost.ts';
import { RepostId } from '../../domain/repost/repostId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { SendLikeUseCase } from '../../useCase/sendLike.ts';
import type { SendRepostUseCase } from '../../useCase/sendRepost.ts';
import type { UndoLikeUseCase } from '../../useCase/undoLike.ts';
import type { UndoRepostUseCase } from '../../useCase/undoRepost.ts';
import type { Status } from '../mastodon/entities.ts';
import {
  isSourceVisibleToAnonymous,
  type StatusAssembler,
  StatusAssemblyError,
  type StatusSource,
} from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { resolveViewer } from './helper/mastodonViewer.ts';
import {
  getMastodonPrincipal,
  type MastodonAuthEnv,
  type MastodonAuthn,
  rejectUnlessTokenScope,
} from './mastodonAuthn.ts';

export type WorkerMastodonStatusesRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  repostResolverById: RepostResolverById;
  repostResolver: RepostResolver;
  threadResolver: ThreadResolver;
  statusAssembler: StatusAssembler;
  sendLikeUseCase: SendLikeUseCase;
  undoLikeUseCase: UndoLikeUseCase;
  sendRepostUseCase: SendRepostUseCase;
  undoRepostUseCase: UndoRepostUseCase;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

type ActingOnPost = Readonly<{ userId: UserId; viewerActorId: ActorId; post: PostWithAuthor }>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const cannotReblog = { error: 'Validation failed: Private and direct statuses cannot be reblogged' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeStatuses = Scope.orThrow('write:statuses');
const writeFavourites = Scope.orThrow('write:favourites');

const failed = (c: Context, err: Readonly<{ type: string }>): Response => {
  switch (err.type) {
    case 'PostNotFoundError':
      return c.json(recordNotFound, 404);
    case 'RemoteNoteLookupError':
      return c.json({ error: 'The remote server could not be reached' }, 502);
    default:
      throw new Error(`The status action failed: ${err.type}`);
  }
};

export const createWorkerMastodonStatusesRouter = ({
  authn,
  actorResolverByUserId,
  postsWithAuthorResolverByPostIds,
  repostResolverById,
  repostResolver,
  threadResolver,
  statusAssembler,
  sendLikeUseCase,
  undoLikeUseCase,
  sendRepostUseCase,
  undoRepostUseCase,
  createContext,
}: WorkerMastodonStatusesRouterDeps): Hono<MastodonAuthEnv> => {
  const resolveSource = async (
    id: PostId,
    viewerActorId: ActorId | undefined,
  ): Promise<StatusSource | undefined> => {
    const [posts, repost] = await Promise.all([
      postsWithAuthorResolverByPostIds.resolve({
        postIds: [id],
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      }),
      repostResolverById.resolve(RepostId.orThrow(id)),
    ]);
    if (!posts.ok || !repost.ok) {
      throw new StatusAssemblyError('Failed to resolve the status');
    }
    const post = posts.val.get(id);
    if (post !== undefined) {
      return { type: 'post', post };
    }
    if (repost.val === undefined) {
      return undefined;
    }
    const original = await postsWithAuthorResolverByPostIds.resolve({
      postIds: [repost.val.postId],
      currentActorId: viewerActorId,
      onlyVisibleToViewer: true,
    });
    if (!original.ok) {
      throw new StatusAssemblyError('Failed to resolve the reposted status');
    }
    const originalPost = original.val.get(repost.val.postId);
    return originalPost === undefined ? undefined : {
      type: 'repost',
      repostId: repost.val.repostId,
      reposterActorId: repost.val.actorId,
      createdAt: repost.val.createdAt,
      post: originalPost,
    };
  };

  const resolvePost = async (id: PostId, viewerActorId: ActorId): Promise<PostWithAuthor | undefined> => {
    const posts = await postsWithAuthorResolverByPostIds.resolve({
      postIds: [id],
      currentActorId: viewerActorId,
      onlyVisibleToViewer: true,
    });
    if (!posts.ok) {
      throw new StatusAssemblyError('Failed to resolve the status');
    }
    return posts.val.get(id);
  };

  const resolveActingPost = async (c: Context<MastodonAuthEnv>): Promise<Result<ActingOnPost, Response>> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return Result.err(c.json(invalidToken, 401));
    }
    const id = PostId.parse(c.req.param('id'));
    if (!id.ok) {
      return Result.err(c.json(recordNotFound, 404));
    }
    const viewer = await actorResolverByUserId.resolve(userId);
    if (!viewer.ok) {
      return Result.err(c.json(internalServerError, 500));
    }
    if (viewer.val === undefined) {
      return Result.err(c.json(actorNotFound, 422));
    }
    const post = await resolvePost(id.val, viewer.val.id);
    return post === undefined
      ? Result.err(c.json(recordNotFound, 404))
      : Result.ok({ userId, viewerActorId: viewer.val.id, post });
  };

  const respondWithStatus = async (
    c: Context<MastodonAuthEnv>,
    { viewerActorId, post }: ActingOnPost,
    boost?: Readonly<{ repostId: RepostId }>,
  ): Promise<Response> => {
    const [updated, repost] = await Promise.all([
      resolvePost(post.postId, viewerActorId),
      boost === undefined ? undefined : repostResolverById.resolve(boost.repostId),
    ]);
    if (repost !== undefined && !repost.ok) {
      throw new StatusAssemblyError('Failed to resolve the repost');
    }
    if (updated === undefined || (boost !== undefined && repost?.val === undefined)) {
      return c.json(recordNotFound, 404);
    }
    const source: StatusSource = boost === undefined || repost?.val === undefined
      ? { type: 'post', post: updated }
      : {
        type: 'repost',
        repostId: repost.val.repostId,
        reposterActorId: viewerActorId,
        createdAt: repost.val.createdAt,
        post: updated,
      };
    const [status] = await statusAssembler.assemble({
      sources: [source],
      viewerActorId,
      requestUrl: c.req.url,
    });
    return status === undefined ? c.json(recordNotFound, 404) : c.json(status);
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/v1/statuses/:id/favourite', authn.requireUser(writeFavourites), async (c) => {
      const acting = await resolveActingPost(c);
      if (!acting.ok) {
        return acting.err;
      }
      const { userId, post } = acting.val;
      const liked = await sendLikeUseCase.run({
        userId,
        postId: post.postId,
        request: c.req.raw,
        ctx: createContext(c.req.raw),
      });
      return !liked.ok && liked.err.type !== 'AlreadyLikedError'
        ? failed(c, liked.err)
        : respondWithStatus(c, acting.val);
    })
    .post('/v1/statuses/:id/unfavourite', authn.requireUser(writeFavourites), async (c) => {
      const acting = await resolveActingPost(c);
      if (!acting.ok) {
        return acting.err;
      }
      const { userId, post } = acting.val;
      const unliked = await undoLikeUseCase.run({
        userId,
        postId: post.postId,
        request: c.req.raw,
        ctx: createContext(c.req.raw),
      });
      return !unliked.ok && unliked.err.type !== 'NotLikedError'
        ? failed(c, unliked.err)
        : respondWithStatus(c, acting.val);
    })
    .post('/v1/statuses/:id/reblog', authn.requireUser(writeStatuses), async (c) => {
      const acting = await resolveActingPost(c);
      if (!acting.ok) {
        return acting.err;
      }
      const { userId, viewerActorId, post } = acting.val;
      if (!Post.isVisibleToAnonymous(post)) {
        return c.json(cannotReblog, 422);
      }
      const sent = await sendRepostUseCase.run({
        userId,
        postId: post.postId,
        request: c.req.raw,
        ctx: createContext(c.req.raw),
      });
      if (sent.ok) {
        return respondWithStatus(c, acting.val, sent.val);
      }
      if (sent.err.type === 'RepostNotAllowedError') {
        return c.json(cannotReblog, 422);
      }
      if (sent.err.type !== 'AlreadyRepostedError') {
        return failed(c, sent.err);
      }
      const existing = await repostResolver.resolve({ actorId: viewerActorId, postId: post.postId });
      if (!existing.ok || existing.val === undefined) {
        throw new StatusAssemblyError('Failed to resolve the existing repost');
      }
      return respondWithStatus(c, acting.val, existing.val);
    })
    .post('/v1/statuses/:id/unreblog', authn.requireUser(writeStatuses), async (c) => {
      const acting = await resolveActingPost(c);
      if (!acting.ok) {
        return acting.err;
      }
      const { userId, post } = acting.val;
      const undone = await undoRepostUseCase.run({
        userId,
        postId: post.postId,
        request: c.req.raw,
        ctx: createContext(c.req.raw),
      });
      return !undone.ok && undone.err.type !== 'RepostNotFoundForUndoError'
        ? failed(c, undone.err)
        : respondWithStatus(c, acting.val);
    })
    .get('/v1/statuses/:id', authn.optionalAuth, async (c) => {
      const principal = getMastodonPrincipal(c);
      const rejection = rejectUnlessTokenScope(c, principal, [readStatuses]);
      if (rejection !== undefined) {
        return rejection;
      }
      const id = PostId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const viewer = await resolveViewer(actorResolverByUserId, principal);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      const source = await resolveSource(id.val, viewer.viewerActorId);
      if (source === undefined || (viewer.viewerActorId === undefined && !isSourceVisibleToAnonymous(source))) {
        return c.json(recordNotFound, 404);
      }
      const [status] = await statusAssembler.assemble({
        sources: [source],
        viewerActorId: viewer.viewerActorId,
        requestUrl: c.req.url,
      });
      return status === undefined ? c.json(recordNotFound, 404) : c.json(status);
    })
    .get('/v1/statuses/:id/context', authn.optionalAuth, async (c) => {
      const principal = getMastodonPrincipal(c);
      const rejection = rejectUnlessTokenScope(c, principal, [readStatuses]);
      if (rejection !== undefined) {
        return rejection;
      }
      const id = PostId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const viewer = await resolveViewer(actorResolverByUserId, principal);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      const { viewerActorId } = viewer;
      const thread = await threadResolver.resolve({
        postId: id.val,
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      });
      if (!thread.ok) {
        return c.json(internalServerError, 500);
      }
      const { currentPost } = thread.val;
      if (currentPost === null || (viewerActorId === undefined && !Post.isVisibleToAnonymous(currentPost))) {
        return c.json(recordNotFound, 404);
      }
      const visible = (posts: ReadonlyArray<PostWithAuthor>): PostWithAuthor[] =>
        viewerActorId === undefined ? posts.filter(Post.isVisibleToAnonymous) : [...posts];
      const ancestors = visible(thread.val.ancestors);
      const descendants = visible(thread.val.descendants);
      const statuses = await statusAssembler.assemble({
        sources: [...ancestors, ...descendants].map((post): StatusSource => ({ type: 'post', post })),
        viewerActorId,
        requestUrl: c.req.url,
      });
      const statusById = new Map<string, Status>(statuses.map((status) => [status.id, status]));
      const pick = (posts: ReadonlyArray<{ postId: string }>): Status[] =>
        posts.flatMap((post) => statusById.get(post.postId) ?? []);
      return c.json({ ancestors: pick(ancestors), descendants: pick(descendants) });
    });
};
