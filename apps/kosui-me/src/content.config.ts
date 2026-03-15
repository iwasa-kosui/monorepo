import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    image: z.string().optional(),
    ogIcon: z.string().optional(),
    ogSvg: z.string().optional(),
    private: z.boolean().optional(),
  }),
});

const resume = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/resume' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { posts, resume };
