import { toByteIndex } from '../../adaptor/bluesky/blueskyPostRecord.ts';
import type { BlueskyFacet, BlueskyMentionFacet } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { findMentions, findUrls } from './blueskyTextMatches.ts';

// 本文1件ごとの resolveHandle の同時問い合わせを抑える
export const MAX_RESOLVED_MENTIONS = 10;

export type MentionOptions = Readonly<{ excludeTruncated?: boolean }>;

const truncatedHandleTail = /^[a-zA-Z0-9.-]*…/;

const usableMentions = (
  text: string,
  facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>,
  { excludeTruncated = false }: MentionOptions,
) =>
  findMentions(text, findUrls(text)).flatMap(({ start, end, handle }) => {
    if (excludeTruncated && truncatedHandleTail.test(text.slice(end))) return [];
    const index = toByteIndex(text, start, end);
    const overlaps = facets.some((facet) =>
      index.byteStart < facet.index.byteEnd && facet.index.byteStart < index.byteEnd
    );
    return overlaps ? [] : [{ index, handle }];
  });

export const findMentionHandles = (
  text: string,
  facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>,
  options: MentionOptions = {},
): string[] =>
  [...new Set(usableMentions(text, facets, options).map(({ handle }) => handle))].slice(0, MAX_RESOLVED_MENTIONS);

export const withMentionFacets = (
  text: string,
  facets: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet>,
  dids: ReadonlyMap<string, string>,
  options: MentionOptions = {},
): Array<BlueskyFacet | BlueskyMentionFacet> => {
  const mentionFacets = usableMentions(text, facets, options).flatMap(({ index, handle }): BlueskyMentionFacet[] => {
    const did = dids.get(handle);
    return did === undefined ? [] : [{ index, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] }];
  });
  return [...facets, ...mentionFacets].sort((a, b) => a.index.byteStart - b.index.byteStart);
};
