import type { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';
import { ogImageCacheControl } from '../r2/ogImageStore.ts';
import { OG_IMAGE_FOOTER_TEXT } from './ogImageElement.ts';

export type PublishedTitleResult =
  | Readonly<{ status: 'published'; title: string }>
  | Readonly<{ status: 'notFound' }>
  | Readonly<{ status: 'failed'; error?: unknown }>;

export type GenerateOgImageResult =
  | Readonly<{ status: 'found'; response: Response }>
  | Readonly<{ status: 'notFound' }>
  | Readonly<{ status: 'failed' }>;

export type OgImageFailureLog = Map<string, number>;

export type GenerateOgImageOnDemandDeps = Readonly<{
  store: OgImageStore;
  resolvePublishedTitle: (articleId: ArticleId) => Promise<PublishedTitleResult>;
  loadFont: (text: string) => Promise<ArrayBuffer>;
  render: (input: Readonly<{ title: string; fontData: ArrayBuffer }>) => Promise<Uint8Array>;
  now: () => number;
  failures: OgImageFailureLog;
}>;

export const OG_IMAGE_FAILURE_WINDOW_MS = 60_000;
export const OG_IMAGE_FAILURE_LIMIT = 1000;

const recordFailure = (failures: OgImageFailureLog, articleId: ArticleId, failedAt: number) => {
  failures.delete(articleId);
  failures.set(articleId, failedAt);
  while (failures.size > OG_IMAGE_FAILURE_LIMIT) {
    const oldest = failures.keys().next();
    if (oldest.done) break;
    failures.delete(oldest.value);
  }
};

export const generateOgImageOnDemand = (
  { store, resolvePublishedTitle, loadFont, render, now, failures }: GenerateOgImageOnDemandDeps,
) =>
async (articleId: ArticleId): Promise<GenerateOgImageResult> => {
  let stored: Response | undefined;
  try {
    stored = await store.get(articleId);
  } catch (error) {
    console.error('Failed to read the OGP image from the store.', error);
    return { status: 'failed' };
  }
  if (stored !== undefined) return { status: 'found', response: stored };

  const failedAt = failures.get(articleId);
  if (failedAt !== undefined) {
    if (now() - failedAt < OG_IMAGE_FAILURE_WINDOW_MS) return { status: 'failed' };
    failures.delete(articleId);
  }

  let resolved: PublishedTitleResult;
  try {
    resolved = await resolvePublishedTitle(articleId);
  } catch (error) {
    console.error('Failed to resolve the article title for the OGP image.', error);
    return { status: 'failed' };
  }
  if (resolved.status === 'notFound') return { status: 'notFound' };
  if (resolved.status === 'failed') {
    console.error('Failed to resolve the article title for the OGP image.', resolved.error);
    return { status: 'failed' };
  }

  let png: Uint8Array;
  try {
    const { title } = resolved;
    png = await render({ title, fontData: await loadFont(`${title}${OG_IMAGE_FOOTER_TEXT}`) });
  } catch (error) {
    console.error('Failed to generate OGP image.', error);
    recordFailure(failures, articleId, now());
    return { status: 'failed' };
  }
  failures.delete(articleId);

  try {
    await store.put({ key: articleId, body: png, contentType: 'image/png' });
  } catch (error) {
    console.error('Failed to store generated OGP image.', error);
  }

  return {
    status: 'found',
    response: new Response(png as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': ogImageCacheControl },
    }),
  };
};
