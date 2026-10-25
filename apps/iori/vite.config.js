import { execFileSync } from 'node:child_process';
import build from '@hono/vite-build/node';
import devServer from '@hono/vite-dev-server';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'client') {
    return {
      esbuild: {
        jsxImportSource: 'hono/jsx/dom',
      },
      build: {
        rollupOptions: {
          input: {
            home: './src/ui/pages/home.tsx',
            remoteUser: './src/ui/pages/remoteUser.tsx',
            localUser: './src/ui/pages/localUser.tsx',
            localPost: './src/ui/pages/localPost.tsx',
            articles: './src/ui/pages/articles.tsx',
            articleDetail: './src/ui/pages/articleDetail.tsx',
            signIn: './src/ui/pages/signIn.tsx',
            signUp: './src/ui/pages/signUp.tsx',
            follow: './src/ui/pages/follow.tsx',
            about: './src/ui/pages/about.tsx',
            notifications: './src/ui/pages/notifications.tsx',
            likedPosts: './src/ui/pages/likedPosts.tsx',
            federatedTimeline: './src/ui/pages/federatedTimeline.tsx',
          },
          output: {
            entryFileNames: 'static/[name].js',
            chunkFileNames: 'static/[name]-[hash].js',
            assetFileNames: 'static/[name]-[hash][extname]',
          },
        },
      },
    };
  }

  // Embed a clean build's revision into the bundle, never reread the checkout at runtime.
  let sourceRevision;
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (dirty.length === 0 && /^[a-f0-9]{40}$/.test(sha)) sourceRevision = sha;
  } catch { /* Development builds may run without migration capability. */ }
  return {
    define: { __IORI_SOURCE_REVISION__: JSON.stringify(sourceRevision) ?? 'undefined' },
    plugins: [
      build({
        entry: 'src/index.ts',
        external: ['sharp', 'shiki'],
      }),
      devServer({
        entry: 'src/app.tsx',
      }),
    ],
    build: {
      sourcemap: true,
    },
  };
});
