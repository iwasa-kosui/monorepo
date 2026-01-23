import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import z from 'zod/v4';

import { ArticleId } from '../../domain/article/articleId.ts';
import { LayoutClient } from '../../layout.tsx';

const app = new Hono();

app.get('/', async (c) => {
  const sessionId = getCookie(c, 'sessionId');
  const isLoggedIn = !!sessionId;

  return c.html(
    <LayoutClient
      client='/static/articles.js'
      server='/src/ui/pages/articles.tsx'
      isLoggedIn={isLoggedIn}
    >
      <div id='root' class='h-full flex flex-col' data-is-logged-in={String(isLoggedIn)} />
    </LayoutClient>,
  );
});

app.get(
  '/:articleId',
  sValidator(
    'param',
    z.object({
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

export const ArticlesRouter = app;
