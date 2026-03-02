import data from './data.json' with { type: 'json' };

export type ExternalArticleMeta = {
  title: string;
  url: string;
  date: string;
  publisher: string;
  description?: string;
  image?: string;
  tags: string[];
};

export const getExternalArticles = (): ExternalArticleMeta[] => data as ExternalArticleMeta[];
