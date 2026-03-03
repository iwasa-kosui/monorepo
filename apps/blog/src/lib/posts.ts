import type { ComponentType } from "react";

export interface PostFrontmatter {
  title: string;
  date: string;
  description: string;
  tags: string[];
}

export interface PostMeta extends PostFrontmatter {
  slug: string;
}

interface MdxModule {
  default: ComponentType;
  frontmatter: PostFrontmatter;
}

const postModules = import.meta.glob<MdxModule>("../content/posts/*.mdx", {
  eager: true,
});

function extractSlug(path: string): string {
  const filename = path.split("/").pop() ?? "";
  return filename.replace(/\.mdx$/, "");
}

export function getAllPosts(): PostMeta[] {
  return Object.entries(postModules)
    .map(([path, mod]) => ({
      slug: extractSlug(path),
      ...mod.frontmatter,
    }))
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export function getPost(slug: string): { meta: PostMeta; Component: ComponentType } | undefined {
  const entry = Object.entries(postModules).find(
    ([path]) => extractSlug(path) === slug,
  );
  if (!entry) return undefined;
  const [, mod] = entry;
  return {
    meta: { slug, ...mod.frontmatter },
    Component: mod.default,
  };
}

export function getPostSlugs(): string[] {
  return Object.keys(postModules).map(extractSlug);
}
