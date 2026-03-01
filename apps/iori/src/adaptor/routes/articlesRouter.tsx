import { sValidator } from '@hono/standard-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import z from 'zod/v4';

import { ArticleId } from '../../domain/article/articleId.ts';
import { LayoutClient } from '../../layout.tsx';
import { DB } from '../pg/db.ts';
import { articlesTable, usersTable } from '../pg/schema.ts';

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
    const { articleId } = c.req.valid('param');

    // Get the article's author username for redirect
    const rows = await DB.getInstance().select({
      username: usersTable.username,
    })
      .from(articlesTable)
      .innerJoin(usersTable, eq(articlesTable.authorUserId, usersTable.userId))
      .where(eq(articlesTable.articleId, articleId))
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return c.notFound();
    }

    const username = rows[0].username;
    return c.redirect(`/users/${username}/articles/${articleId}`, 301);
  },
);

export const ArticlesRouter = app;
