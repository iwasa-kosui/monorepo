import type { ComponentType } from 'react';

type PostFrontmatter = {
  title: string;
  date: string;
  slug: string;
  image?: string;
};

type PostModule = {
  default: ComponentType<{ components?: Record<string, ComponentType> }>;
  frontmatter: PostFrontmatter;
};

const modules = import.meta.glob('./*.mdx', { eager: true }) as Record<string, PostModule>;

export type PostMeta = PostFrontmatter & {
  fileName: string;
};

const allPosts: { meta: PostMeta; Component: PostModule['default'] }[] = Object.entries(modules)
  .map(([filePath, mod]) => ({
    meta: {
      ...mod.frontmatter,
      fileName: filePath.replace('./', '').replace('.mdx', ''),
    },
    Component: mod.default,
  }))
  .sort((a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime());

export const getPosts = (): PostMeta[] => allPosts.map((p) => p.meta);

export const getPostBySlug = (slug: string): { meta: PostMeta; Component: PostModule['default'] } | undefined =>
  allPosts.find((p) => p.meta.slug === slug);

export const getAllSlugs = (): string[] => allPosts.map((p) => p.meta.slug);
