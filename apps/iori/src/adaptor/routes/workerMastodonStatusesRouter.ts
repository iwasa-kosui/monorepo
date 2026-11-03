import { Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { PostsWithAuthorResolverByPostIds, ThreadResolver } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { RepostResolverById } from '../../domain/repost/repost.ts';
import { RepostId } from '../../domain/repost/repostId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { Status } from '../mastodon/entities.ts';
import type { StatusAssembler, StatusSource } from '../mastodon/statusAssembler.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonStatusesRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  repostResolverById: RepostResolverById;
  threadResolver: ThreadResolver;
  statusAssembler: StatusAssembler;
}>;

const recordNotFound = { error: 'Record not found' } as const;

export const createWorkerMastodonStatusesRouter = ({
  authn,
  actorResolverByUserId,
  postsWithAuthorResolverByPostIds,
  repostResolverById,
  threadResolver,
  statusAssembler,
}: WorkerMastodonStatusesRouterDeps): Hono<MastodonAuthEnv> => {
  const resolveViewerActorId = async (userId: UserId | null | undefined): Promise<ActorId | undefined> => {
    if (userId === null || userId === undefined) {
      return undefined;
    }
    const actor = await actorResolverByUserId.resolve(userId);
    return actor.ok ? actor.val?.id : undefined;
  };

  const resolveSource = async (
    id: PostId,
    viewerActorId: ActorId | undefined,
  ): Promise<StatusSource | undefined> => {
    const [posts, repost] = await Promise.all([
      postsWithAuthorResolverByPostIds.resolve({ postIds: [id], currentActorId: viewerActorId }),
      repostResolverById.resolve(RepostId.orThrow(id)),
    ]);
    const post = posts.ok ? posts.val.get(id) : undefined;
    if (post !== undefined) {
      return { type: 'post', post };
    }
    if (!repost.ok || repost.val === undefined) {
      return undefined;
    }
    const original = await postsWithAuthorResolverByPostIds.resolve({
      postIds: [repost.val.postId],
      currentActorId: viewerActorId,
    });
    const originalPost = original.ok ? original.val.get(repost.val.postId) : undefined;
    return originalPost === undefined ? undefined : {
      type: 'repost',
      repostId: repost.val.repostId,
      reposterActorId: repost.val.actorId,
      createdAt: repost.val.createdAt,
      post: originalPost,
    };
  };

  return new Hono<MastodonAuthEnv>()
    .get('/v1/statuses/:id', authn.optionalAuth, async (c) => {
      const id = PostId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const viewerActorId = await resolveViewerActorId(getMastodonPrincipal(c)?.userId);
      const source = await resolveSource(id.val, viewerActorId);
      const [status] = source === undefined
        ? []
        : await statusAssembler.assemble({ sources: [source], viewerActorId, requestUrl: c.req.url });
      return status === undefined ? c.json(recordNotFound, 404) : c.json(status);
    })
    .get('/v1/statuses/:id/context', authn.optionalAuth, async (c) => {
      const id = PostId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const viewerActorId = await resolveViewerActorId(getMastodonPrincipal(c)?.userId);
      const thread = await threadResolver.resolve({ postId: id.val, currentActorId: viewerActorId });
      if (!thread.ok || thread.val.currentPost === null) {
        return c.json(recordNotFound, 404);
      }
      const descendants = [...thread.val.descendants]
        .sort((a, b) => a.createdAt - b.createdAt || (a.postId < b.postId ? -1 : 1));
      const statuses = await statusAssembler.assemble({
        sources: [...thread.val.ancestors, ...descendants].map((post): StatusSource => ({ type: 'post', post })),
        viewerActorId,
        requestUrl: c.req.url,
      });
      const statusById = new Map<string, Status>(statuses.map((status) => [status.id, status]));
      const pick = (posts: ReadonlyArray<{ postId: string }>): Status[] =>
        posts.flatMap((post) => statusById.get(post.postId) ?? []);
      return c.json({ ancestors: pick(thread.val.ancestors), descendants: pick(descendants) });
    });
};
