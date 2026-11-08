const KEY_PREFIX = 'iori:response-cache:';

export const CACHE_TTL_MS = 5 * 60 * 1000;

export type CacheCursors = Readonly<{
  nextMaxId?: string;
  prevMinId?: string;
}>;

export type CacheEntry = Readonly<{
  body: unknown;
  savedAt: number;
  cursors?: CacheCursors;
}>;

const currentUserId = (): string | undefined => {
  try {
    const userId = document.getElementById('root')?.dataset.userId;
    return userId === undefined || userId === '' ? undefined : userId;
  } catch {
    return undefined;
  }
};

const keyOf = (url: string): string | undefined => {
  const userId = currentUserId();
  return userId === undefined ? undefined : `${KEY_PREFIX}${userId}:${url}`;
};

const isCacheEntry = (value: unknown): value is CacheEntry =>
  typeof value === 'object'
  && value !== null
  && 'body' in value
  && 'savedAt' in value
  && typeof value.savedAt === 'number'
  && Number.isFinite(value.savedAt);

export const isFresh = (entry: CacheEntry, now: number, maxAgeMs: number): boolean => {
  const age = now - entry.savedAt;
  return age >= 0 && age < maxAgeMs;
};

export const readCache = (url: string, now: number = Date.now()): CacheEntry | undefined => {
  try {
    const key = keyOf(url);
    if (key === undefined) return undefined;
    const raw = sessionStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (isCacheEntry(parsed) && isFresh(parsed, now, CACHE_TTL_MS)) return parsed;
    sessionStorage.removeItem(key);
    return undefined;
  } catch {
    return undefined;
  }
};

export const writeCache = (
  url: string,
  body: unknown,
  cursors?: CacheCursors,
  now: number = Date.now(),
): void => {
  try {
    const key = keyOf(url);
    if (key === undefined) return;
    const entry: CacheEntry = cursors === undefined ? { body, savedAt: now } : { body, savedAt: now, cursors };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    return;
  }
};

export const clearAllCache = (): void => {
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key !== null && key.startsWith(KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    return;
  }
};
