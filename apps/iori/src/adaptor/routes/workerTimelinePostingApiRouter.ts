import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { Instant } from '../../domain/instant/instant.ts';
import { PostContent } from '../../domain/post/postContent.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { CreatePostUseCase } from '../../useCase/createPost.ts';
import type { GetTimelineUseCase } from '../../useCase/getTimeline.ts';
import { sanitize } from './helper/sanitize.ts';

export type WorkerTimelinePostingApiRouterDeps = Readonly<{
  getTimelineUseCase: GetTimelineUseCase;
  createPostUseCase: CreatePostUseCase;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export const createWorkerTimelinePostingApiRouter = ({
  getTimelineUseCase,
  createPostUseCase,
  createContext,
}: WorkerTimelinePostingApiRouterDeps): Hono =>
  new Hono()
    .get(
      '/v1/home',
      sValidator(
        'query',
        z.object({
          createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)),
        }),
      ),
      async (c) => {
        const sessionId = getCookie(c, 'sessionId');
        if (sessionId === undefined) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        const sessionIdResult = SessionId.parse(sessionId);
        if (!sessionIdResult.ok) {
          return c.json({ error: 'Invalid session' }, 401);
        }

        return RA.flow(
          getTimelineUseCase.run({
            sessionId: sessionIdResult.val,
            createdAt: c.req.valid('query').createdAt,
          }),
          RA.match({
            ok: ({ user, timelineItems, actor, followers, following }) =>
              c.json({
                user,
                timelineItems: timelineItems.map((item) => ({
                  ...item,
                  post: { ...item.post, content: sanitize(item.post.content) },
                })),
                actor,
                followers,
                following,
              }),
            err: (error) => {
              deleteCookie(c, 'sessionId');
              return c.json({ error: JSON.stringify(error) }, 400);
            },
          }),
        );
      },
    )
    .post(
      '/v1/posts',
      sValidator(
        'json',
        z.object({
          content: z.string().min(1),
          imageUrls: z.optional(z.array(z.string())),
        }),
      ),
      async (c) => {
        const sessionId = getCookie(c, 'sessionId');
        if (sessionId === undefined) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        const sessionIdResult = SessionId.parse(sessionId);
        if (!sessionIdResult.ok) {
          return c.json({ error: 'Invalid session' }, 401);
        }

        const { content, imageUrls } = c.req.valid('json');
        const postContent = await PostContent.fromMarkdown(content);
        return RA.flow(
          createPostUseCase.run({
            sessionId: sessionIdResult.val,
            content: postContent,
            imageUrls: imageUrls ?? [],
            ctx: createContext(c.req.raw),
          }),
          RA.match({
            ok: () => c.json({ success: true }),
            err: (error) => c.json({ error: `Failed to create post: ${JSON.stringify(error)}` }, 400),
          }),
        );
      },
    );
