import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import z from 'zod/v4';

import { PostContent } from '../../domain/post/postContent.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Federation } from '../../federation.ts';
import { Layout } from '../../layout.tsx';
import { CreatePostUseCase } from '../../useCase/createPost.ts';
import { createOgpFetcher } from '../ogp/ogpFetcher.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgPostImageCreatedStore } from '../pg/image/postImageCreatedStore.ts';
import { PgLinkPreviewCreatedStore } from '../pg/linkPreview/linkPreviewCreatedStore.ts';
import { PgPostCreatedStore } from '../pg/post/postCreatedStore.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgTimelineItemCreatedStore } from '../pg/timeline/timelineItemCreatedStore.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';

const app = new Hono();
app.post(
  '/',
  sValidator(
    'form',
    z.object({
      content: z.string().min(1),
      imageUrls: z.optional(z.string().transform((s) => s ? s.split(',').filter(Boolean) : [])),
    }),
  ),
  async (c) => {
    const useCase = CreatePostUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      postCreatedStore: PgPostCreatedStore.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      postImageCreatedStore: PgPostImageCreatedStore.getInstance(),
      timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
      linkPreviewCreatedStore: PgLinkPreviewCreatedStore.getInstance(),
      ogpFetcher: createOgpFetcher(),
    });
    const sessionId = getCookie(c, 'sessionId');
    if (!sessionId) {
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Please sign in to create a post.</p>
          </section>
        </Layout>,
      );
    }
    const form = await c.req.valid('form');
    const content = await PostContent.fromMarkdown(form.content);
    const imageUrls = form.imageUrls ?? [];
    return RA.flow(
      useCase.run({
        sessionId: SessionId.orThrow(sessionId),
        content,
        imageUrls,
        ctx: Federation.getInstance().createContext(c.req.raw, undefined),
      }),
      RA.match({
        ok: () => {
          return c.redirect('/');
        },
        err: (err) => {
          return c.html(
            <Layout>
              <section>
                <h1>Error</h1>
                <p>{String(JSON.stringify(err))}</p>
              </section>
            </Layout>,
          );
        },
      }),
    );
  },
);

export const PostsRouter = app;
