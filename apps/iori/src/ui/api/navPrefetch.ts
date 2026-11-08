import { parseLinkHeader } from './mastodonClient.ts';
import { prefetchUrlsFor } from './prefetchTargets.ts';
import { clearAllCache, isFresh, readCache, writeCache } from './responseCache.ts';
import { NAV_LINK_SELECTOR } from './speculationRules.ts';

export const PREFETCH_FRESH_MS = 30 * 1000;

export type PrefetchDeps = Readonly<{
  fetch: typeof fetch;
  now: () => number;
  saveData: boolean;
  isLoggedIn: boolean;
}>;

export type Prefetcher = Readonly<{
  prefetch: (pathname: string) => Promise<void>;
}>;

const isRecent = (attemptAt: number, now: number): boolean => {
  const age = now - attemptAt;
  return age >= 0 && age < PREFETCH_FRESH_MS;
};

export const createPrefetcher = (deps: PrefetchDeps): Prefetcher => {
  const inFlight = new Set<string>();
  const lastAttemptAt = new Map<string, number>();

  const prefetchOne = async (url: string): Promise<void> => {
    if (inFlight.has(url)) return;
    const cached = readCache(url, deps.now());
    if (cached !== undefined && isFresh(cached, deps.now(), PREFETCH_FRESH_MS)) return;
    const lastAttempt = lastAttemptAt.get(url);
    if (lastAttempt !== undefined && isRecent(lastAttempt, deps.now())) return;
    lastAttemptAt.set(url, deps.now());
    inFlight.add(url);
    try {
      const res = await deps.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        clearAllCache();
        return;
      }
      if (!res.ok) return;
      const body: unknown = await res.json();
      const { nextMaxId, prevMinId } = parseLinkHeader(res.headers.get('Link'));
      writeCache(url, body, {
        ...(nextMaxId === undefined ? {} : { nextMaxId }),
        ...(prevMinId === undefined ? {} : { prevMinId }),
      }, deps.now());
    } catch {
      return;
    } finally {
      inFlight.delete(url);
    }
  };

  return {
    prefetch: async (pathname) => {
      if (deps.saveData || !deps.isLoggedIn) return;
      await Promise.all(prefetchUrlsFor(pathname).map(prefetchOne));
    },
  };
};

export const pathnameOfNavLink = (target: EventTarget | null, origin: string): string | undefined => {
  if (!(target instanceof Element)) return undefined;
  const anchor = target.closest(NAV_LINK_SELECTOR);
  if (!(anchor instanceof HTMLAnchorElement)) return undefined;
  try {
    const url = new URL(anchor.href);
    return url.origin === origin ? url.pathname : undefined;
  } catch {
    return undefined;
  }
};

export const readIsLoggedIn = (doc: Document): boolean => doc.getElementById('root')?.dataset.isLoggedIn === 'true';

export const readSaveData = (nav: Navigator): boolean =>
  (nav as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
