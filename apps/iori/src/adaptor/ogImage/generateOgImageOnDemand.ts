import type { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';
import { ogImageCacheControl } from '../r2/ogImageStore.ts';

export type GenerateOgImageOnDemandDeps = Readonly<{
  store: OgImageStore;
  resolvePublishedTitle: (articleId: ArticleId) => Promise<string | undefined>;
  loadFont: (text: string) => Promise<ArrayBuffer>;
  render: (input: Readonly<{ title: string; fontData: ArrayBuffer }>) => Promise<Uint8Array>;
}>;

const footerText = 'blog.kosui.me';

export const generateOgImageOnDemand = (
  { store, resolvePublishedTitle, loadFont, render }: GenerateOgImageOnDemandDeps,
) =>
async (articleId: ArticleId): Promise<Response | undefined> => {
  const stored = await store.get(articleId);
  if (stored !== undefined) return stored;

  const title = await resolvePublishedTitle(articleId);
  if (title === undefined) return undefined;

  let png: Uint8Array;
  try {
    png = await render({ title, fontData: await loadFont(`${title}${footerText}`) });
  } catch (error) {
    console.error('Failed to generate OGP image.', error);
    return undefined;
  }

  try {
    await store.put({ key: articleId, body: png, contentType: 'image/png' });
  } catch (error) {
    console.error('Failed to store generated OGP image.', error);
  }

  return new Response(png as BodyInit, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': ogImageCacheControl },
  });
};
