// src/types/pagefind.d.ts

export interface PagefindSearchResult {
  id: string;
  data: () => Promise<PagefindSearchData>;
}

export interface PagefindSearchData {
  url: string;
  meta: {
    title?: string;
    type?: string;
    [key: string]: string | undefined;
  };
  excerpt: string;
  content: string;
}

export interface PagefindSearchResponse {
  results: PagefindSearchResult[];
}

export interface PagefindInstance {
  search: (query: string) => Promise<PagefindSearchResponse>;
}
