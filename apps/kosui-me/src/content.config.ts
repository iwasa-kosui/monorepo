import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    themes: z.array(z.enum(['typescript', 'architecture', 'sre', 'team'])).optional(),
    image: z.string().optional(),
    ogIcon: z.string().optional(),
    ogSvg: z.string().optional(),
    private: z.boolean().optional(),
  }),
});

const reports = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/reports' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    themes: z.array(z.string()).optional(),
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

const books = defineCollection({
  loader: glob({ pattern: '*/index.mdx', base: './src/content/books' }),
  schema: z.object({
    bookSlug: z.string(),
    seriesTitle: z.string(),
    seriesSlug: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string(),
    author: z.string().optional(),
    updatedDate: z.string(),
    draft: z.boolean().optional(),
  }),
});

const bookChapters = defineCollection({
  loader: glob({
    pattern: '*/chapters/*.mdx',
    base: './src/content/books',
  }),
  schema: z.object({
    bookSlug: z.string(),
    chapterSlug: z.string(),
    order: z.number(),
    title: z.string(),
    summary: z.string().optional(),
    codeTag: z.string().optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { posts, reports, resume, books, bookChapters };
