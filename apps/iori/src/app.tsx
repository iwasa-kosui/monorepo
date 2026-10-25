import { federation } from '@fedify/hono';
import { serveStatic } from '@hono/node-server/serve-static';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createNodeOgImageGenerator } from './adaptor/node/ogImageGenerator.ts';
import { AboutRouter } from './adaptor/routes/aboutRouter.tsx';
import { APIRouter } from './adaptor/routes/apiRouter.tsx';
import { ArticlesApiRouter } from './adaptor/routes/articlesApiRouter.tsx';
import { ArticlesRouter } from './adaptor/routes/articlesRouter.tsx';
import { FederatedTimelineRouter } from './adaptor/routes/federatedTimelineRouter.tsx';
import { FollowRouter } from './adaptor/routes/followRouter.tsx';
import { HomeRouter } from './adaptor/routes/homeRouter.tsx';
import { LikedPostsRouter } from './adaptor/routes/likedPostsRouter.tsx';
import { LikeRouter } from './adaptor/routes/likeRouter.tsx';
import { NotificationRouter } from './adaptor/routes/notificationRouter.tsx';
import { createOgImageRouter } from './adaptor/routes/ogImageRouter.tsx';
import { PostsRouter } from './adaptor/routes/postsRouter.tsx';
import { PushSubscriptionRouter } from './adaptor/routes/pushSubscriptionRouter.tsx';
import { RemoteUsersRouter } from './adaptor/routes/remoteUsersRouter.tsx';
import { SignInRouter } from './adaptor/routes/signInRouter.tsx';
import { SignUpRouter } from './adaptor/routes/signUpRouter.tsx';
import { UsersRouter } from './adaptor/routes/usersRouter.tsx';
import { createIoriApp } from './appFactory.tsx';
import { ImageId } from './domain/image/imageId.ts';
import { Federation } from './federation.ts';

const app = createIoriApp({
  federationMiddleware: federation(Federation.getInstance(), () => undefined),
  registerRoutes: (router) => {
    router.use('/static/*', serveStatic({ root: './' }));
    router.use('/favicon.ico', serveStatic({ path: './favicon.ico' }));
    router.use('/sw.js', serveStatic({ path: './sw.js' }));
    router.use('/manifest.json', serveStatic({ path: './manifest.json' }));
    router.use('/icon-192.png', serveStatic({ path: './icon-192.png' }));
    router.use('/icon-512.png', serveStatic({ path: './icon-512.png' }));
    router.get('/authorize_interaction', (c) => {
      const url = new URL(String(c.req.url));
      url.pathname = '/follow';
      return c.redirect(url);
    });
    router.route('/', HomeRouter);
    router.route('/api', APIRouter);
    router.route('/api/v1', ArticlesApiRouter);
    router.route('/api', PushSubscriptionRouter);
    router.route('/users', UsersRouter);
    router.route('/remote-users', RemoteUsersRouter);
    router.route('/posts', PostsRouter);
    router.route('/sign-up', SignUpRouter);
    router.route('/sign-in', SignInRouter);
    router.route('/follow', FollowRouter);
    router.route('/like', LikeRouter);
    router.route('/likes', LikedPostsRouter);
    router.route('/notifications', NotificationRouter);
    router.route('/articles', ArticlesRouter);
    router.route('/about', AboutRouter);
    router.route('/api/og', createOgImageRouter(createNodeOgImageGenerator()));
    router.route('/federated', FederatedTimelineRouter);
  },
  serveAsset: async () => undefined,
  serveUpload: async (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.webp') return undefined;
    const imageIdResult = ImageId.parse(path.basename(filename, ext));
    if (!imageIdResult.ok) return undefined;
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    try {
      const file = await fs.readFile(path.join(uploadDir, filename));
      return new Response(file, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return undefined;
    }
  },
  serveOgImage: async () =>
    new Response('OG image is served by Node routes until the OGP task is complete', {
      status: 501,
    }),
});

export default app;
