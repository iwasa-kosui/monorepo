import mdx from '@mdx-js/rollup';
import rehypeShiki from '@shikijs/rehype';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { defineConfig } from 'vite';

const mdxPlugin = mdx({
  remarkPlugins: [
    remarkFrontmatter,
    remarkMdxFrontmatter,
    remarkGfm,
  ],
  rehypePlugins: [
    [rehypeShiki, {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    }],
  ],
});

export default defineConfig({
  plugins: [
    { enforce: 'pre' as const, ...mdxPlugin },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    tailwindcss(),
  ],
  build: {
    outDir: 'dist',
  },
});
