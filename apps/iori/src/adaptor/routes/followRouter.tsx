import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { LayoutClient } from '../../layout.tsx';

const app = new Hono();

app.get('/', async (c) => {
  const sessionId = getCookie(c, 'sessionId');
  return c.html(
    <LayoutClient
      client='/static/follow.js'
      server='/src/ui/pages/follow.tsx'
      isLoggedIn={!!sessionId}
    >
      <div id='root' />
    </LayoutClient>,
  );
});

export const FollowRouter = app;
