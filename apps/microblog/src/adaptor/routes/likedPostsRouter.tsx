import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { SessionId } from '../../domain/session/sessionId.ts';
import { Layout } from '../../layout.tsx';
import { LikedPostsPage } from '../../ui/pages/likedPosts.tsx';
import { GetLikedPostsUseCase } from '../../useCase/getLikedPosts.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgLikedPostsResolverByActorId } from '../pg/like/likedPostsResolverByActorId.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';

const app = new Hono();

app.get('/', async (c) => {
  const logger = getLogger('microblog:liked-posts');
  const maybeSessionId = getCookie(c, 'sessionId');

  if (!maybeSessionId) {
    return c.redirect('/sign-in');
  }

  const useCase = GetLikedPostsUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    likedPostsResolver: PgLikedPostsResolverByActorId.getInstance(),
  });

  return RA.flow(
    RA.ok(maybeSessionId),
    RA.andThen(SessionId.parse),
    RA.andBind('result', (sessionId) => useCase.run({ sessionId })),
    RA.match({
      ok: ({ result: { user, posts } }) => {
        return c.html(
          <LikedPostsPage
            user={user}
            posts={posts}
          />,
        );
      },
      err: (err) => {
        logger.error('Get liked posts failed', { error: String(err) });
        return c.html(
          <Layout>
            <section>
              <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-4'>
                Error
              </h1>
              <p class='text-gray-500 dark:text-gray-400'>
                Failed to load liked posts. Please try again.
              </p>
              <a
                href='/sign-in'
                class='inline-block mt-4 text-blue-600 dark:text-blue-400 hover:underline'
              >
                Sign in
              </a>
            </section>
          </Layout>,
          401,
        );
      },
    }),
  );
});

export const LikedPostsRouter = app;
