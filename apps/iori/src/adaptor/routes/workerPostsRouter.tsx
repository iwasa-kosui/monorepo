import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { PostContent } from '../../domain/post/postContent.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Layout } from '../../layout.tsx';
import type { CreatePostUseCase } from '../../useCase/createPost.ts';

export type WorkerPostsRouterDeps = Readonly<{
  createPostUseCase: CreatePostUseCase;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export const createWorkerPostsRouter = ({
  createPostUseCase,
  createContext,
}: WorkerPostsRouterDeps): Hono =>
  new Hono().post(
    '/',
    sValidator(
      'form',
      z.object({
        content: z.string().min(1),
        imageUrls: z.optional(z.string().transform((s) => s ? s.split(',').filter(Boolean) : [])),
      }),
    ),
    async (c) => {
      const sessionIdResult = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionIdResult.ok) {
        return c.html(
          <Layout>
            <section>
              <h1>Error</h1>
              <p>Please sign in to create a post.</p>
            </section>
          </Layout>,
        );
      }
      const form = c.req.valid('form');
      const content = await PostContent.fromMarkdown(form.content);
      return RA.flow(
        createPostUseCase.run({
          sessionId: sessionIdResult.val,
          content,
          imageUrls: form.imageUrls ?? [],
          ctx: createContext(c.req.raw),
        }),
        RA.match({
          ok: () => c.redirect('/'),
          err: (error) =>
            c.html(
              <Layout>
                <section>
                  <h1>Error</h1>
                  <p>{String(JSON.stringify(error))}</p>
                </section>
              </Layout>,
            ),
        }),
      );
    },
  );
