declare module '*.mdx' {
  import type { ComponentType } from 'react';

  export const frontmatter: {
    title: string;
    date: string;
    slug: string;
    image?: string;
  };

  const MDXComponent: ComponentType;
  export default MDXComponent;
}
