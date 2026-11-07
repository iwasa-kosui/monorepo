import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/chapters' }),
  schema: z.object({
    goal: z.string(),
  }),
});

export const collections = { chapters };
