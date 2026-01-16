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

  return {
    plugins: [
      build({
        entry: 'src/index.ts',
      }),
      devServer({
        entry: 'src/app.tsx',
      }),
    ],
  };
});
