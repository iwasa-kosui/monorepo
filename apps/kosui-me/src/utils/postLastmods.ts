import { readPostFrontmatters } from './postFrontmatters.ts';

/**
 * サイトマップの lastmod に使う、記事のパス（/slug）から最終更新日時（ISO 8601）への対応を返す。
 * 記事には更新日の項目がないので、公開日時を使う。日時として読めない記事は含めない。
 */
export const listPostLastmods = (postsDir: string): Map<string, string> => {
  const lastmods = new Map<string, string>();
  for (const { data } of readPostFrontmatters(postsDir)) {
    const { slug, date } = data;
    if (typeof slug !== 'string' || slug === '') continue;
    if (typeof date !== 'string' && !(date instanceof Date)) continue;
    const time = new Date(date).getTime();
    if (Number.isNaN(time)) continue;
    lastmods.set(`/${slug}`, new Date(time).toISOString());
  }
  return lastmods;
};
