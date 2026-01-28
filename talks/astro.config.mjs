import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    tailwind({
      configFile: './tailwind.config.mjs',
    }),
  ],
  output: 'static',
  outDir: './dist-astro',
  srcDir: './src',
});
