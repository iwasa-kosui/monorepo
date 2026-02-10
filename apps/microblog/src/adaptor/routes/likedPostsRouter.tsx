import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { LayoutClient } from '../../layout.tsx';

const app = new Hono();

app.get('/', async (c) => {
  const maybeSessionId = getCookie(c, 'sessionId');

  if (!maybeSessionId) {
    return c.redirect('/sign-in');
  }

  return c.html(
    <LayoutClient
      client='/static/likedPosts.js'
      server='/src/ui/pages/likedPosts.tsx'
      isLoggedIn={true}
    >
      <div id='root' />
    </LayoutClient>,
  );
});

export const LikedPostsRouter = app;
