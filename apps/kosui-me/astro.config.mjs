import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { remarkMermaid } from './src/plugins/remark-mermaid.mjs';
import { listNoindexPostPaths } from './src/utils/noindexPostPaths.ts';
import { listPostLastmods } from './src/utils/postLastmods.ts';

const postsDir = fileURLToPath(new URL('./src/content/posts', import.meta.url));
const noindexPostPaths = listNoindexPostPaths(postsDir);
const postLastmods = listPostLastmods(postsDir);

const integrations = [
  mdx({
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
    // 記事の URL には公開日時を lastmod として付け、クローラーに鮮度を伝える
    serialize: (item) => {
      const lastmod = postLastmods.get(decodeURI(new URL(item.url).pathname));
      return lastmod ? { ...item, lastmod } : item;
    },
  }),
];

if (process.env.KEYSTATIC) {
  const keystatic = (await import('@keystatic/astro')).default;
  integrations.push(keystatic());
}

export default defineConfig({
  site: 'https://kosui.me',
  output: 'static',
  // Astro 7 の既定（'jsx'）は要素間の空白や改行を落とすので、従来どおり見た目を変えない圧縮にする。
  compressHTML: true,
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations,
  markdown: {
    // Astro 7 の既定（satteri）は remark プラグインを実行しないので、unified を使う。MDX もこの設定を引き継ぐ。
    processor: unified({ remarkPlugins: [remarkMermaid] }),
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@swc/wasm-web'],
    },
  },
});
