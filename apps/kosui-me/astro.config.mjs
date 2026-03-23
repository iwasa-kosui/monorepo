import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { remarkMermaid } from './src/plugins/remark-mermaid.mjs';

const integrations = [
  mdx({
    remarkPlugins: [remarkMermaid],
    shikiConfig: {
      theme: 'github-dark',
    },
  }),
  react(),
  sitemap({
    filter: (page) => !page.includes('/reports'),
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
