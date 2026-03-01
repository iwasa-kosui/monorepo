declare module '*.mdx' {
  import type { ComponentType } from 'react';

  export const frontmatter: {
    title: string;
    date: string;
    slug: string;
    image?: string;
    ogIcon?: string;
    ogSvg?: string;
    description?: string;
    tags?: string[];
  };

  const MDXComponent: ComponentType;
  export default MDXComponent;
}
