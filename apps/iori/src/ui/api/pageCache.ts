import type { CredentialAccount } from '../../adaptor/mastodon/entities.ts';
import { type Page, verifyCredentialsUrl } from './mastodonClient.ts';
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

export const readMeCache = (): CredentialAccount | undefined => {
  const body = readCache(verifyCredentialsUrl())?.body;
  return typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
    ? body as CredentialAccount
    : undefined;
};

export const writeMeCache = (me: CredentialAccount): void => writeCache(verifyCredentialsUrl(), me);

export const keepsCachedView = (hasCache: boolean, isUnauthorized: boolean): boolean => hasCache && !isUnauthorized;
