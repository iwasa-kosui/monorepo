export type OgImageBackfillArticle = Readonly<{
  articleId: string;
  title: string;
}>;

export type OgImageBackfillInput = Readonly<{
  key: string;
  body: Uint8Array;
  cacheControl: string;
}>;

export type OgImageBackfillDeps = Readonly<{
  articles: readonly OgImageBackfillArticle[];
  generate: (title: string) => Promise<Uint8Array>;
  upload: (input: OgImageBackfillInput) => Promise<void>;
}>;

const cacheControl = 'public, max-age=31536000, immutable';

export const ogImageObjectKey = (articleId: string): string => `og/${articleId}.png`;

export const backfillOgImages = async ({
  articles,
  generate,
  upload,
}: OgImageBackfillDeps): Promise<Readonly<{ backfilled: number }>> => {
  for (const article of articles) {
    await upload({
      key: ogImageObjectKey(article.articleId),
      body: await generate(article.title),
      cacheControl,
    });
  }

  return { backfilled: articles.length };
};
