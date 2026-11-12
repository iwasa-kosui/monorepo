import type { BlueskyTimelineFacet } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { blueskyProfilePathOf, blueskyProfileUrlOfActor, BSKY_APP_URL } from '../../helper/blueskyUrl.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';

export type BlueskyTextSegment = Readonly<{ text: string; href: string | undefined }>;

const hrefOf = (facet: BlueskyTimelineFacet): string | undefined => {
  switch (facet.feature.type) {
    case 'link':
      return safeAbsoluteUrl(facet.feature.uri);
    case 'mention':
      return blueskyProfileUrlOfActor(facet.feature.did) === undefined
        ? undefined
        : blueskyProfilePathOf(facet.feature.did);
    case 'tag':
      return `${BSKY_APP_URL}/hashtag/${encodeURIComponent(facet.feature.tag)}`;
  }
};

const isContinuationByte = (byte: number | undefined): boolean => byte !== undefined && (byte & 0xc0) === 0x80;

export const segmentBlueskyText = (
  text: string,
  facets: readonly BlueskyTimelineFacet[],
): readonly BlueskyTextSegment[] => {
  const bytes = new TextEncoder().encode(text);
  const decoder = new TextDecoder();
  const segments: BlueskyTextSegment[] = [];
  let cursor = 0;
  for (const facet of facets.toSorted((a, b) => a.byteStart - b.byteStart)) {
    const href = hrefOf(facet);
    if (
      href === undefined
      || facet.byteStart < cursor
      || facet.byteEnd <= facet.byteStart
      || facet.byteEnd > bytes.length
      || isContinuationByte(bytes[facet.byteStart])
      || isContinuationByte(bytes[facet.byteEnd])
    ) continue;
    if (facet.byteStart > cursor) {
      segments.push({ text: decoder.decode(bytes.slice(cursor, facet.byteStart)), href: undefined });
    }
    segments.push({ text: decoder.decode(bytes.slice(facet.byteStart, facet.byteEnd)), href });
    cursor = facet.byteEnd;
  }
  if (cursor < bytes.length) segments.push({ text: decoder.decode(bytes.slice(cursor)), href: undefined });
  return segments;
};
