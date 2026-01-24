import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import z from 'zod/v4';

import { Actor } from '../../domain/actor/actor.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import { Layout, LayoutClient } from '../../layout.tsx';
import { GetPostUseCase } from '../../useCase/getPost.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from '../../useCase/helper/resolve.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgLogoUriUpdatedStore } from '../pg/actor/logoUriUpdatedStore.ts';
import { PgPostImagesResolverByPostId } from '../pg/image/postImagesResolver.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';

const app = new Hono();

app.get(
  '/:username',
  sValidator(
    'param',
    z.object({
      username: Username.zodType,
    }),
  ),
  async (c) => {
    const { username } = c.req.valid('param');
    const logger = getLogger('microblog:get-user');
    logger.info('Get user attempt', { username });

    const sessionId = getCookie(c, 'sessionId');
    const isLoggedIn = !!sessionId;

    return c.html(
      <LayoutClient
        client='/static/localUser.js'
        server='/src/ui/pages/localUser.tsx'
        isLoggedIn={isLoggedIn}
      >
        <div id='root' />
      </LayoutClient>,
    );
  },
);

app.post(
  '/:username',
  sValidator(
    'form',
    z.object({
      logoUri: z.string().optional(),
    }),
  ),
  async (c) => {
    const form = await c.req.valid('form');
    const logoUri = form.logoUri ? form.logoUri.trim() : '';
    if (!logoUri) {
      return c.text('logoUri is required', 400);
    }

    const now = Instant.now();
    const maybeSessionId = getCookie(c, 'sessionId');
    const resolveSession = resolveSessionWith(
      PgSessionResolver.getInstance(),
      now,
    );
    const resolveUser = resolveUserWith(PgUserResolver.getInstance());
    return RA.flow(
      RA.ok(maybeSessionId),
      RA.andThen(SessionId.parse),
      RA.andBind('session', resolveSession),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActorWith(PgActorResolverByUserId.getInstance())(user.id)),
      RA.andThen(({ actor }) => {
        if (actor.logoUri !== logoUri) {
          return RA.flow(
            RA.ok(Actor.updateLogoUri(now)(actor, logoUri)),
            RA.andThen(PgLogoUriUpdatedStore.getInstance().store),
          );
        }
        return RA.ok(undefined);
      }),
      RA.match({
        ok: () => {
          return c.redirect(`/users/${c.req.param('username')}`);
        },
        err: (err) => {
          getLogger().error('Failed to update logoUri', {
            error: String(err),
          });
          return c.html(
            <Layout>
              <section>
                <h1>Error</h1>
                <p>{String(JSON.stringify(err))}</p>
              </section>
            </Layout>,
            500,
          );
        },
      }),
    );
  },
);

app.post(
  '/:username/remote-follow',
  sValidator(
    'param',
    z.object({
      username: Username.zodType,
    }),
  ),
  sValidator(
    'form',
    z.object({
      handle: z.string().min(1),
    }),
  ),
  async (c) => {
    const { username } = c.req.valid('param');
    const { handle } = c.req.valid('form');
    const logger = getLogger('microblog:remote-follow');

    // Extract domain from handle (e.g., @user@example.com -> example.com)
    const handleMatch = handle.match(/@?[^@]+@([^@]+)/);
    if (!handleMatch) {
      logger.warn('Invalid handle format', { handle });
      return c.text('Invalid handle format. Use @user@server.example', 400);
    }

    const remoteDomain = handleMatch[1];
    const url = new URL(c.req.url);
    const targetUri = `${url.origin}/users/${username}`;

    // Redirect to the remote server's authorize_interaction endpoint
    const redirectUrl = `https://${remoteDomain}/authorize_interaction?uri=${encodeURIComponent(targetUri)}`;
    logger.info('Remote follow redirect', { remoteDomain, targetUri, redirectUrl });

    return c.redirect(redirectUrl);
  },
);

app.get(
  '/:username/posts/:postId',
  sValidator(
    'param',
    z.object({
      username: Username.zodType,
      postId: PostId.zodType,
    }),
  ),
  async (c) => {
    const { username, postId } = c.req.valid('param');
    const sessionId = getCookie(c, 'sessionId');
    const isLoggedIn = !!sessionId;

    const useCase = GetPostUseCase.create({
      postResolver: PgPostResolver.getInstance(),
      postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
    });

    // Helper function to extract plain text from HTML for OGP description
    const extractDescription = (
      html: string,
      maxLength: number = 150,
    ): string => {
      const text = html
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp;
        .replace(/&amp;/g, '&') // Replace &amp;
        .replace(/&lt;/g, '<') // Replace &lt;
        .replace(/&gt;/g, '>') // Replace &gt;
        .replace(/&quot;/g, '"') // Replace &quot;
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    };

    return RA.flow(
      RA.ok({ postId }),
      RA.andThen(({ postId }) => useCase.run({ postId })),
      RA.match({
        ok: ({ post, postImages }) => {
          const url = new URL(c.req.url);
          const postUrl = `${url.origin}/users/${username}/posts/${post.postId}`;
          const description = extractDescription(post.content);

          return c.html(
            <LayoutClient
              client='/static/localPost.js'
              server='/src/ui/pages/localPost.tsx'
              isLoggedIn={isLoggedIn}
              ogp={{
                title: `@${username}の投稿`,
                description,
                url: postUrl,
                type: 'article',
                author: String(username),
                publishedTime: new Date(post.createdAt).toISOString(),
                image: postImages.length > 0 ? postImages[0].url : undefined,
              }}
            >
              <div id='root' class='h-full flex flex-col' data-is-logged-in={String(isLoggedIn)} />
            </LayoutClient>,
          );
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

app.get(
  '/:username/articles/:articleId',
  sValidator(
    'param',
    z.object({
      username: Username.zodType,
      articleId: ArticleId.zodType,
    }),
  ),
  async (c) => {
    const sessionId = getCookie(c, 'sessionId');
    const isLoggedIn = !!sessionId;

    return c.html(
      <LayoutClient
        client='/static/articleDetail.js'
        server='/src/ui/pages/articleDetail.tsx'
        isLoggedIn={isLoggedIn}
      >
        <div id='root' class='h-full flex flex-col' data-is-logged-in={String(isLoggedIn)} />
      </LayoutClient>,
    );
  },
);

export const UsersRouter = app;
