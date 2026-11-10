import type { CredentialAccount } from '../../adaptor/mastodon/entities.ts';
import { type BlueskyTimelinePage, type Page, verifyCredentialsUrl } from './mastodonClient.ts';
import { readCache, writeCache } from './responseCache.ts';

export type CachedPage<T> = Readonly<{
  items: readonly T[];
  nextMaxId: string | undefined;
}>;

export const readPageCache = <T>(url: string): CachedPage<T> | undefined => {
  const entry = readCache(url);
  if (entry === undefined || !Array.isArray(entry.body)) return undefined;
  return { items: entry.body as T[], nextMaxId: entry.cursors?.nextMaxId };
};

export const writePageCache = <T>(url: string, page: Page<T>): void => {
  writeCache(url, page.items, {
    ...(page.nextMaxId === undefined ? {} : { nextMaxId: page.nextMaxId }),
    ...(page.prevMinId === undefined ? {} : { prevMinId: page.prevMinId }),
  });
};

const isBlueskyTimelinePage = (body: unknown): body is BlueskyTimelinePage =>
  typeof body === 'object'
  && body !== null
  && 'items' in body
  && Array.isArray(body.items)
  && 'nextBefore' in body
  && (body.nextBefore === null || typeof body.nextBefore === 'number')
  && 'nextBeforeId' in body
  && (body.nextBeforeId === null || typeof body.nextBeforeId === 'string');

export const readBlueskyPageCache = (url: string): BlueskyTimelinePage | undefined => {
  const body = readCache(url)?.body;
  return isBlueskyTimelinePage(body) ? body : undefined;
};

export const writeBlueskyPageCache = (url: string, page: BlueskyTimelinePage): void => writeCache(url, page);

export const readMeCache = (): CredentialAccount | undefined => {
  const body = readCache(verifyCredentialsUrl())?.body;
  return typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
    ? body as CredentialAccount
    : undefined;
};

export const writeMeCache = (me: CredentialAccount): void => writeCache(verifyCredentialsUrl(), me);

export const keepsCachedView = (hasCache: boolean, isUnauthorized: boolean): boolean => hasCache && !isUnauthorized;
