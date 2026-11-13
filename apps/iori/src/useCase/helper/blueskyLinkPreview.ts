import type { BlueskyLinkPreviewInput } from '../../adaptor/bluesky/blueskyPostRecord.ts';
import type { OgpFetcher } from '../../adaptor/ogp/ogpFetcher.ts';
import type { BlueskyThumbnailFetcher } from '../../ports/blueskyClient.ts';
import { findUrls } from './blueskyTextMatches.ts';

export type BlueskyLinkPreviewDeps = Readonly<{
  ogpFetcher: OgpFetcher;
  thumbnailFetcher: BlueskyThumbnailFetcher;
}>;

export const resolveBlueskyLinkPreview = async (
  { ogpFetcher, thumbnailFetcher }: BlueskyLinkPreviewDeps,
  text: string,
): Promise<BlueskyLinkPreviewInput | undefined> => {
  const url = findUrls(text)[0]?.uri;
  if (url === undefined) return undefined;
  const ogp = await ogpFetcher.fetch(url).catch(() => undefined);
  if (ogp === undefined || !(ogp.title ?? ogp.description)) return undefined;
  const thumb = ogp.imageUrl !== null && URL.canParse(ogp.imageUrl, url)
    ? await thumbnailFetcher.fetch(new URL(ogp.imageUrl, url).href).catch(() => undefined)
    : undefined;
  return {
    url,
    title: ogp.title,
    description: ogp.description,
    ...(thumb === undefined ? {} : { thumb }),
  };
};
