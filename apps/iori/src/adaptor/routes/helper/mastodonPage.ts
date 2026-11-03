import type { Context } from 'hono';

import type { PageRequest } from '../../../domain/page/page.ts';

export type PageLimits = Readonly<{ defaultLimit: number; maxLimit: number }>;

export const timelineLimits: PageLimits = { defaultLimit: 20, maxLimit: 40 };
export const accountListLimits: PageLimits = { defaultLimit: 40, maxLimit: 80 };
export const notificationLimits: PageLimits = { defaultLimit: 40, maxLimit: 80 };
export const unreadCountLimits: PageLimits = { defaultLimit: 100, maxLimit: 1000 };

export const isTrue = (value: string | undefined): boolean => value === 'true' || value === '1';

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

export const parseLimit = (value: string | undefined, { defaultLimit, maxLimit }: PageLimits): number => {
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? defaultLimit : Math.min(parsed, maxLimit);
};

export const parsePageRequest = (c: Context, limits: PageLimits): PageRequest => {
  const minId = nonEmpty(c.req.query('min_id'));
  return {
    limit: parseLimit(c.req.query('limit'), limits),
    olderThanId: nonEmpty(c.req.query('max_id')),
    newerThanId: minId ?? nonEmpty(c.req.query('since_id')),
    order: minId === undefined ? 'newestFirst' : 'oldestFirst',
  };
};

export const toNewestFirst = <T>(items: ReadonlyArray<T>, page: PageRequest): T[] =>
  page.order === 'oldestFirst' ? [...items].reverse() : [...items];

const pageUrl = (requestUrl: string, name: 'max_id' | 'min_id', id: string): string => {
  const url = new URL(requestUrl);
  for (const key of ['max_id', 'since_id', 'min_id']) url.searchParams.delete(key);
  url.searchParams.set(name, id);
  return url.href;
};

export const linkHeaderOf = (
  requestUrl: string,
  ids: Readonly<{ first: string; last: string }> | undefined,
): string | undefined =>
  ids === undefined
    ? undefined
    : `<${pageUrl(requestUrl, 'max_id', ids.last)}>; rel="next", <${
      pageUrl(requestUrl, 'min_id', ids.first)
    }>; rel="prev"`;

export const respondWithPage = <T>(
  c: Context,
  items: ReadonlyArray<T>,
  rowIds: ReadonlyArray<string>,
): Response => {
  const first = rowIds[0];
  const last = rowIds[rowIds.length - 1];
  const link = first === undefined || last === undefined
    ? undefined
    : linkHeaderOf(c.req.url, { first, last });
  if (link !== undefined) c.header('Link', link);
  return c.json(items);
};
