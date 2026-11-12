import { toByteIndex } from '../../adaptor/bluesky/blueskyPostRecord.ts';
import type { BlueskyFacet, BlueskyMentionFacet } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { findMentions, findUrls } from './publishBlueskyPost.ts';

export const findMentionHandles = (text: string): string[] => [
  ...new Set(findMentions(text, findUrls(text)).map(({ handle }) => handle)),
];

export const withMentionFacets = (
  text: string,
  facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>,
  dids: ReadonlyMap<string, string>,
): Array<BlueskyFacet | BlueskyMentionFacet> => {
  const mentionFacets = findMentions(text, findUrls(text)).flatMap(({ start, end, handle }): BlueskyMentionFacet[] => {
    const did = dids.get(handle);
    if (did === undefined) return [];
    const index = toByteIndex(text, start, end);
    const overlaps = facets.some((facet) =>
      index.byteStart < facet.index.byteEnd && facet.index.byteStart < index.byteEnd
    );
    return overlaps ? [] : [{ index, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] }];
  });
  return [...facets, ...mentionFacets].sort((a, b) => a.index.byteStart - b.index.byteStart);
};
