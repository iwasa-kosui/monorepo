import { Hono } from 'hono';

import { LayoutClient } from '../../layout.tsx';

const app = new Hono();

app.get('/', async (c) => {
  return c.html(
    <LayoutClient
      client='/static/signIn.js'
      server='/src/ui/pages/signIn.tsx'
      isLoggedIn={false}
    >
      <div id='root' />
    </LayoutClient>,
  );
});

export { app as SignInRouter };
