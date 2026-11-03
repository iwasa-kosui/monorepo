import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { remarkMermaid } from './src/plugins/remark-mermaid.mjs';
import { listPrivatePostPaths } from './src/utils/privatePostPaths.ts';

const privatePostPaths = listPrivatePostPaths(
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
    // private は URL を知る人だけが読む限定公開なので、検索エンジンに URL を渡さない
    filter: (page) =>
      !page.includes('/reports')
      && !page.endsWith('.md')
      && !privatePostPaths.has(new URL(page).pathname),
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
