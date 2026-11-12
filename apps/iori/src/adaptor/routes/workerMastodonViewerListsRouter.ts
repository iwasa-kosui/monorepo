import { Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { BlockedActorsResolverByUserIdWithPagination } from '../../domain/block/block.ts';
import type { BookmarkedPostIdsResolverByActorIdWithPagination } from '../../domain/bookmark/bookmark.ts';
import type { LikedPostIdsResolverByActorIdWithPagination } from '../../domain/like/like.ts';
import type { MutedActorsResolverByUserIdWithPagination } from '../../domain/mute/mute.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PostsWithAuthorResolverByPostIds } from '../../domain/post/post.ts';
import type { StatusAssembler, StatusSource } from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import {
  accountListLimits,
  parsePageRequest,
  respondWithPage,
  timelineLimits,
  toNewestFirst,
} from './helper/mastodonPage.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonViewerListsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  likedPostIdsResolverByActorIdWithPagination: LikedPostIdsResolverByActorIdWithPagination;
  bookmarkedPostIdsResolverByActorIdWithPagination: BookmarkedPostIdsResolverByActorIdWithPagination;
  mutedActorsResolverByUserIdWithPagination: MutedActorsResolverByUserIdWithPagination;
  blockedActorsResolverByUserIdWithPagination: BlockedActorsResolverByUserIdWithPagination;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const readFavourites = Scope.orThrow('read:favourites');
const readBookmarks = Scope.orThrow('read:bookmarks');
const readMutes = Scope.orThrow('read:mutes');
const readBlocks = Scope.orThrow('read:blocks');

export const createWorkerMastodonViewerListsRouter = ({
  authn,
  actorResolverByUserId,
  likedPostIdsResolverByActorIdWithPagination,
  bookmarkedPostIdsResolverByActorIdWithPagination,
  mutedActorsResolverByUserIdWithPagination,
  blockedActorsResolverByUserIdWithPagination,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
}: WorkerMastodonViewerListsRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/v1/favourites', authn.requireUser(readFavourites), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const viewer = await actorResolverByUserId.resolve(userId);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      if (viewer.val === undefined) {
        return c.json(actorNotFound, 422);
      }
      const viewerActorId = viewer.val.id;
      const page = parsePageRequest(c, timelineLimits);
      const likes = await likedPostIdsResolverByActorIdWithPagination.resolve({
        actorId: viewerActorId,
        page,
        onlyVisibleToViewer: true,
      });
      if (!likes.ok) {
        return c.json(internalServerError, 500);
      }
      const rows = toNewestFirst(likes.val, page);
      const posts = await postsWithAuthorResolverByPostIds.resolve({
        postIds: rows.map((row) => row.postId),
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      });
      if (!posts.ok) {
        return c.json(internalServerError, 500);
      }
      const sources = rows.flatMap((row): StatusSource[] => {
        const post = posts.val.get(row.postId);
        return post === undefined ? [] : [{ type: 'post', post }];
      });
      const statuses = await statusAssembler.assemble({ sources, viewerActorId, requestUrl: c.req.url });
      return respondWithPage(c, statuses, rows.map((row) => row.likeId));
    })
    .get('/v1/bookmarks', authn.requireUser(readBookmarks), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const viewer = await actorResolverByUserId.resolve(userId);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      if (viewer.val === undefined) {
        return c.json(actorNotFound, 422);
      }
      const viewerActorId = viewer.val.id;
      const page = parsePageRequest(c, timelineLimits);
      const bookmarks = await bookmarkedPostIdsResolverByActorIdWithPagination.resolve({
        actorId: viewerActorId,
        page,
      });
      if (!bookmarks.ok) {
        return c.json(internalServerError, 500);
      }
      const rows = toNewestFirst(bookmarks.val, page);
      const posts = await postsWithAuthorResolverByPostIds.resolve({
        postIds: rows.map((row) => row.postId),
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      });
      if (!posts.ok) {
        return c.json(internalServerError, 500);
      }
      const sources = rows.flatMap((row): StatusSource[] => {
        const post = posts.val.get(row.postId);
        return post === undefined ? [] : [{ type: 'post', post }];
      });
      const statuses = await statusAssembler.assemble({ sources, viewerActorId, requestUrl: c.req.url });
      return respondWithPage(c, statuses, rows.map((row) => row.bookmarkId));
    })
    .get('/v1/mutes', authn.requireUser(readMutes), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const page = parsePageRequest(c, accountListLimits);
      const mutes = await mutedActorsResolverByUserIdWithPagination.resolve({ userId, page });
      if (!mutes.ok) {
        return c.json(internalServerError, 500);
      }
      const rows = toNewestFirst(mutes.val, page);
      const accounts = await statusAssembler.assembleAccounts({
        actorIds: rows.map((row) => row.mutedActorId),
        requestUrl: c.req.url,
      });
      return respondWithPage(c, accounts, rows.map((row) => row.muteId));
    })
    .get('/v1/blocks', authn.requireUser(readBlocks), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const page = parsePageRequest(c, accountListLimits);
      const blocks = await blockedActorsResolverByUserIdWithPagination.resolve({ userId, page });
      if (!blocks.ok) {
        return c.json(internalServerError, 500);
      }
      const rows = toNewestFirst(blocks.val, page);
      const accounts = await statusAssembler.assembleAccounts({
        actorIds: rows.map((row) => row.blockedActorId),
        requestUrl: c.req.url,
      });
      return respondWithPage(c, accounts, rows.map((row) => row.blockId));
    });
