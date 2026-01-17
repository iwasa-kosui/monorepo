import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { Layout, LayoutClient } from '../../layout.tsx';
import { ServerTimelinePage } from '../../ui/pages/serverTimeline.tsx';
import { GetServerTimelineUseCase } from '../../useCase/getServerTimeline.ts';
import { sanitize } from './helper/sanitize.ts';

const app = new Hono();

app.get('/', async (c) => {
  const sessionId = getCookie(c, 'sessionId');
  if (sessionId) {
    return c.html(
      <LayoutClient client='/static/home.js' server='/src/ui/pages/home.tsx'>
        <div id='root' />
      </LayoutClient>,
    );
  }

  const useCase = GetServerTimelineUseCase.getInstance();

  return RA.flow(
    RA.ok(undefined),
    RA.andThen(() => useCase.run({ createdAt: undefined })),
    RA.match({
      ok: ({ posts }) =>
        c.html(
          <ServerTimelinePage
            posts={posts.map((post) => ({
              ...post,
              content: sanitize(post.content),
            }))}
          />,
        ),
      err: () =>
        c.html(
          <Layout>
            <section>
              <h1>Error</h1>
              <p>Failed to load timeline</p>
            </section>
          </Layout>,
          500,
        ),
    }),
  );
});

export { app as HomeRouter };
