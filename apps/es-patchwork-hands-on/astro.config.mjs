import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://es-patchwork-hands-on.kosui.workers.dev',
  output: 'static',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
