import { federation } from '@fedify/hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { AboutRouter } from './adaptor/routes/aboutRouter.tsx';
import { APIRouter } from './adaptor/routes/apiRouter.tsx';
import { FollowRouter } from './adaptor/routes/followRouter.tsx';
import { HomeRouter } from './adaptor/routes/homeRouter.tsx';
import { LikeRouter } from './adaptor/routes/likeRouter.tsx';
import { NotificationRouter } from './adaptor/routes/notificationRouter.tsx';
import { PostsRouter } from './adaptor/routes/postsRouter.tsx';
import { PushSubscriptionRouter } from './adaptor/routes/pushSubscriptionRouter.tsx';
import { RemoteUsersRouter } from './adaptor/routes/remoteUsersRouter.tsx';
import { SignInRouter } from './adaptor/routes/signInRouter.tsx';
import { SignUpRouter } from './adaptor/routes/signUpRouter.tsx';
import { UsersRouter } from './adaptor/routes/usersRouter.tsx';
import { Federation } from './federation.ts';

const app = new Hono();
const fed = Federation.getInstance();
app.use(federation(fed, () => undefined));
app.use('/static/*', serveStatic({ root: './' }));
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }));
app.use('/sw.js', serveStatic({ path: './sw.js' }));
app.use('/manifest.json', serveStatic({ path: './manifest.json' }));
app.use('/icon-192.png', serveStatic({ path: './icon-192.png' }));
app.use('/icon-512.png', serveStatic({ path: './icon-512.png' }));

// Serve uploaded files from UPLOAD_DIR (outside of dist directory)
app.get('/uploads/:filename', async (c) => {
  const filename = c.req.param('filename');
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadDir, filename);

  // Prevent directory traversal
  if (!filePath.startsWith(uploadDir)) {
    return c.notFound();
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.webp'
      ? 'image/webp'
      : ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.gif'
      ? 'image/gif'
      : 'application/octet-stream';
    return c.body(file, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  } catch {
    return c.notFound();
  }
});

app.get('/authorize_interaction', (c) => {
  const url = new URL(String(c.req.url));
  url.pathname = '/follow';
  return c.redirect(url);
});
app.get('/health', (c) => c.text('OK'));
app.route('/', HomeRouter);
app.route('/api', APIRouter);
app.route('/api', PushSubscriptionRouter);
app.route('/users', UsersRouter);
app.route('/remote-users', RemoteUsersRouter);
app.route('/posts', PostsRouter);
app.route('/sign-up', SignUpRouter);
app.route('/sign-in', SignInRouter);
app.route('/follow', FollowRouter);
app.route('/like', LikeRouter);
app.route('/notifications', NotificationRouter);
app.route('/about', AboutRouter);
export default app;
