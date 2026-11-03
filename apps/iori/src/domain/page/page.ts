export type PageOrder = 'newestFirst' | 'oldestFirst';

export type PageRequest = Readonly<{
  limit: number;
  olderThanId: string | undefined;
  newerThanId: string | undefined;
  order: PageOrder;
}>;
