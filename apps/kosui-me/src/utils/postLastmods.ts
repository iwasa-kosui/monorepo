import { readPostFrontmatters } from './postFrontmatters.ts';

const toIsoString = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

/**
 * サイトマップの lastmod に使う、記事のパス（/slug）から最終更新日時（ISO 8601）への対応を返す。
 * 更新日時（updatedDate）があればそれを、なければ公開日時（date）を使う。どちらも日時として読めない記事は含めない。
 */
export const listPostLastmods = (postsDir: string): Map<string, string> => {
  const lastmods = new Map<string, string>();
  for (const { data } of readPostFrontmatters(postsDir)) {
    const { slug, date, updatedDate } = data;
    if (typeof slug !== 'string' || slug === '') continue;
    const lastmod = toIsoString(updatedDate) ?? toIsoString(date);
    if (lastmod === undefined) continue;
    lastmods.set(`/${slug}`, lastmod);
  }
  return lastmods;
};
