// src/components/SearchModal/usePagefind.ts
import { useCallback, useRef, useState } from 'react';

import type {
  PagefindInstance,
  PagefindSearchData,
} from '../../types/pagefind';

export type SearchResult = {
  url: string;
  title: string;
  excerpt: string;
  type: string;
};

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; results: SearchResult[] }
  | { status: 'no-results' }
  | { status: 'dev-unavailable' };

export function usePagefind() {
  const pagefindRef = useRef<PagefindInstance | null>(null);
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  const loadPagefind = useCallback(async (): Promise<PagefindInstance | null> => {
    if (pagefindRef.current) return pagefindRef.current;

    try {
      const pf = await import(
        /* @vite-ignore */ '/pagefind/pagefind.js'
      ) as unknown as PagefindInstance;
      pagefindRef.current = pf;
      return pf;
    } catch {
      setState({ status: 'dev-unavailable' });
      return null;
    }
  }, []);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'loading' });

    const pf = await loadPagefind();
    if (!pf) return;

    const response = await pf.search(query);
    const top = response.results.slice(0, 10);
    const dataResults = await Promise.all(top.map((r) => r.data()));

    const results: SearchResult[] = dataResults.map(
      (d: PagefindSearchData) => ({
        url: d.url,
        title: d.meta.title ?? '',
        excerpt: d.excerpt,
        type: d.meta.type ?? 'post',
      }),
    );

    if (results.length === 0) {
      setState({ status: 'no-results' });
    } else {
      setState({ status: 'results', results });
    }
  }, [loadPagefind]);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, search, reset, loadPagefind };
}
