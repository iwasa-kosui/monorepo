import { Hono } from 'hono';

import { LayoutClient } from '../../layout.tsx';

const app = new Hono();

app.get('/', (c) => {
  return c.html(
    <LayoutClient
      client='/static/about.js'
      server='/src/ui/pages/about.tsx'
      isLoggedIn={false}
    >
      <div id='root' />
    </LayoutClient>,
  );
});

export { app as AboutRouter };
