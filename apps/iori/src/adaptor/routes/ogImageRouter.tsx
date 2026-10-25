import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import z from 'zod/v4';

import { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';

export const createOgImageRouter = (store: OgImageStore): Hono => {
  const app = new Hono();

  app.get(
    '/articles/:articleId',
    sValidator(
      'param',
      z.object({
        articleId: ArticleId.zodType,
      }),
    ),
    async (c) => {
      const response = await store.get(c.req.valid('param').articleId);
      return response ?? c.notFound();
    },
  );

  return app;
};
