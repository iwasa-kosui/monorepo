import { toByteIndex } from '../../adaptor/bluesky/blueskyPostRecord.ts';
import type { BlueskyFacet, BlueskyMentionFacet } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { findMentions, findUrls } from './publishBlueskyPost.ts';

// 本文1件ごとの resolveHandle の同時問い合わせを抑える
export const MAX_RESOLVED_MENTIONS = 10;

const usableMentions = (text: string, facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>) =>
  findMentions(text, findUrls(text)).flatMap(({ start, end, handle }) => {
    if (text[end] === '…') return [];
    const index = toByteIndex(text, start, end);
    const overlaps = facets.some((facet) =>
      index.byteStart < facet.index.byteEnd && facet.index.byteStart < index.byteEnd
    );
    return overlaps ? [] : [{ index, handle }];
  });

export const findMentionHandles = (
  text: string,
  facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>,
): string[] => [...new Set(usableMentions(text, facets).map(({ handle }) => handle))].slice(0, MAX_RESOLVED_MENTIONS);

export const withMentionFacets = (
  text: string,
  facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>,
  dids: ReadonlyMap<string, string>,
): Array<BlueskyFacet | BlueskyMentionFacet> => {
  const mentionFacets = usableMentions(text, facets).flatMap(({ index, handle }): BlueskyMentionFacet[] => {
    const did = dids.get(handle);
    return did === undefined ? [] : [{ index, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] }];
  });
  return [...facets, ...mentionFacets].sort((a, b) => a.index.byteStart - b.index.byteStart);
};
