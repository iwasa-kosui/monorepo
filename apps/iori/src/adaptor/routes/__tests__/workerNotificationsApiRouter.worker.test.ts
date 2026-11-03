import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { GetLikedPostsUseCase } from '../../../useCase/getLikedPosts.ts';
import { createWorkerNotificationsApiRouter } from '../workerNotificationsApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';

describe('createWorkerNotificationsApiRouter', () => {
  it('returns sanitized liked posts', async () => {
    const user = { id: UserId.generate(), username: Username.orThrow('kosui') };
    const actorId = ActorId.generate();
    const postId = PostId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
    const post = {
      type: 'local' as const,
      postId,
      actorId,
      userId: user.id,
      content: '<p>safe</p><script>alert(1)</script>',
      createdAt,
      inReplyToUri: null,
    };
    const getLikedPostsUseCase: GetLikedPostsUseCase = {
      run: async () =>
        RA.ok({
          user,
          posts: [{
            ...post,
            username: user.username,
            logoUri: undefined,
            liked: true,
            reposted: false,
            images: [],
            likeCount: 1,
            repostCount: 0,
            reactions: [],
            linkPreviews: [],
          }],
        }),
    };
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerNotificationsApiRouter({ getLikedPostsUseCase }),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const likedPosts = await app.request('https://worker.test/api/v1/liked-posts', {
      headers: { Cookie: sessionCookie },
    });

    await expect(likedPosts.json()).resolves.toMatchObject({
      posts: [{ content: '<p>safe</p>' }],
    });
  });
});
