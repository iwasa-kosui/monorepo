import { readPostFrontmatters } from './postFrontmatters.ts';

export const listNoindexPostPaths = (postsDir: string): Set<string> => {
  const paths = new Set<string>();
  for (const { file, data } of readPostFrontmatters(postsDir)) {
    const { private: isPrivate, draft, slug } = data;
    if (isPrivate !== true && draft !== true) continue;
    if (typeof slug !== 'string' || slug === '') {
      throw new Error(`noindex の記事に slug がありません: ${file}`);
    }
    paths.add(`/${slug}`);
  }
  return paths;
};
