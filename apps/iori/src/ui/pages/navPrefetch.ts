import { createPrefetcher, pathnameOfNavLink, readIsLoggedIn, readSaveData } from '../api/navPrefetch.ts';
import { clearAllCache } from '../api/responseCache.ts';

if (globalThis.window) {
  if (!readIsLoggedIn(document)) {
    clearAllCache();
  } else {
    const prefetcher = createPrefetcher({
      fetch: (input, init) => fetch(input, init),
      now: () => Date.now(),
      get saveData() {
        return readSaveData(navigator);
      },
      isLoggedIn: true,
    });
    const onIntent = (event: Event) => {
      const pathname = pathnameOfNavLink(event.target, window.location.origin);
      if (pathname !== undefined) void prefetcher.prefetch(pathname);
    };
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true });
  }
}
