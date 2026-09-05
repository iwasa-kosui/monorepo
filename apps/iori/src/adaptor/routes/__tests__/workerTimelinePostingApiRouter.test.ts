import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import type { Actor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { CreatePostUseCase } from '../../../useCase/createPost.ts';
import type { GetTimelineUseCase } from '../../../useCase/getTimeline.ts';
import { createWorkerTimelinePostingApiRouter } from '../workerTimelinePostingApiRouter.ts';

describe('createWorkerTimelinePostingApiRouter', () => {
  it('serves health, home timeline, and post creation through the Worker app', async () => {
    const user = { id: UserId.generate(), username: Username.orThrow('kosui') };
    const actor: Actor = {
      id: ActorId.generate(),
      userId: user.id,
      uri: 'https://worker.test/users/kosui',
      inboxUrl: 'https://worker.test/inbox',
      type: 'local',
    };
    const post = {
      postId: PostId.generate(),
      actorId: actor.id,
      userId: user.id,
      content: '<img src=x onerror=alert(1)><p>Timeline post</p><script>alert(1)</script>',
      createdAt: Instant.now(),
      inReplyToUri: null,
      type: 'local' as const,
      username: user.username,
      logoUri: undefined,
      liked: false,
      reposted: false,
      images: [],
      likeCount: 0,
      repostCount: 0,
      reactions: [],
      linkPreviews: [],
    };
    const getTimelineUseCase: GetTimelineUseCase = {
      run: async () =>
        RA.ok({
          user,
          actor,
          following: [],
          followers: [],
          timelineItems: [{
            type: 'post',
            timelineItemId: TimelineItemId.generate(),
            post,
            createdAt: Instant.now(),
          }],
        }),
    };
    const createPostUseCase: CreatePostUseCase = {
      run: async () => RA.ok({ post, user }),
    };
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerTimelinePostingApiRouter({
            getTimelineUseCase,
            createPostUseCase,
            createContext: () => createMockRequestContext(),
          }),
        );
      },
      serveAsset: async () => undefined,
      servePage: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });
    const cookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';

    const health = await app.request('https://worker.test/health');
    const home = await app.request('https://worker.test/');
    const timeline = await app.request('https://worker.test/api/v1/home', { headers: { Cookie: cookie } });
    const created = await app.request('https://worker.test/api/v1/posts', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Created from Worker', imageUrls: [] }),
    });

    expect(await health.text()).toBe('OK');
    expect(home.headers.get('content-type')).toContain('text/html');
    await expect(timeline.json()).resolves.toMatchObject({
      timelineItems: [{ post: { content: '<p>Timeline post</p>' } }],
    });
    await expect(created.json()).resolves.toEqual({ success: true });
  });
});
