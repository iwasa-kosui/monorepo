import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { LayoutClient } from '../../layout.tsx';

const app = new Hono();

app.get('/', async (c) => {
  const sessionId = getCookie(c, 'sessionId');
  return c.html(
    <LayoutClient
      client='/static/home.js'
      server='/src/ui/pages/home.tsx'
      isLoggedIn={!!sessionId}
    >
      <div id='root' />
    </LayoutClient>,
  );
});

export { app as HomeRouter };
