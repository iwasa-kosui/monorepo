import { Hono } from 'hono';

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
import type { RepostResolverById } from '../../domain/repost/repost.ts';
import { RepostId } from '../../domain/repost/repostId.ts';
import type { Status } from '../mastodon/entities.ts';
import {
  isSourceVisibleToAnonymous,
  type StatusAssembler,
  StatusAssemblyError,
  type StatusSource,
} from '../mastodon/statusAssembler.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
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
  threadResolver: ThreadResolver;
  statusAssembler: StatusAssembler;
}>;

const recordNotFound = { error: 'Record not found' } as const;
const readStatuses = Scope.orThrow('read:statuses');

export const createWorkerMastodonStatusesRouter = ({
  authn,
  actorResolverByUserId,
  postsWithAuthorResolverByPostIds,
  repostResolverById,
  threadResolver,
  statusAssembler,
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

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
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
