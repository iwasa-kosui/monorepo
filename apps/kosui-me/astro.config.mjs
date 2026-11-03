import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { remarkMermaid } from './src/plugins/remark-mermaid.mjs';
import { listNoindexPostPaths } from './src/utils/noindexPostPaths.ts';

const noindexPostPaths = listNoindexPostPaths(
  fileURLToPath(new URL('./src/content/posts', import.meta.url)),
);

const integrations = [
  mdx({
    remarkPlugins: [remarkMermaid],
    shikiConfig: {
      theme: 'github-dark',
    },
  }),
  react(),
  sitemap({
    // 記事ページに noindex を付ける private と draft は、検索エンジンに URL を渡さない
    filter: (page) =>
      !page.includes('/reports')
      && !page.endsWith('.md')
      && !noindexPostPaths.has(decodeURI(new URL(page).pathname)),
  }),
];

if (process.env.KEYSTATIC) {
  const keystatic = (await import('@keystatic/astro')).default;
  integrations.push(keystatic());
}

export default defineConfig({
  site: 'https://kosui.me',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations,
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@swc/wasm-web'],
    },
  },
});
