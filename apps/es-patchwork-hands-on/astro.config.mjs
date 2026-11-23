import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://es-patchwork-hands-on.kosui.workers.dev',
  output: 'static',
  // Astro 7 の既定（'jsx'）は要素間の空白や改行を落とすので、従来どおり見た目を変えない圧縮にする。
  compressHTML: true,
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
