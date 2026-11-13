import { toByteIndex } from '../../adaptor/bluesky/blueskyPostRecord.ts';
import type {
  BlueskyFacet,
  BlueskyMentionFacet,
  BlueskyTagFacet,
} from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { findHashtags } from './blueskyTextMatches.ts';

type Facet = BlueskyFacet | BlueskyMentionFacet | BlueskyTagFacet;

export type TagOptions = Readonly<{ excludeTruncated?: boolean }>;

const truncatedTagTail = /^\p{P}*…/u;

const isHashtagPageUri = (uri: string, tag: string): boolean => {
  try {
    const [marker, name] = new URL(uri).pathname.split('/').filter((segment) => segment !== '').slice(-2);
    return marker === 'tags' && name !== undefined && decodeURIComponent(name).toLowerCase() === tag.toLowerCase();
  } catch {
    return false;
  }
};

export const withTagFacets = (
  text: string,
  facets: ReadonlyArray<Facet>,
  { excludeTruncated = false }: TagOptions = {},
): Facet[] => {
  const replaced = new Set<Facet>();
  const tagFacets = findHashtags(text).flatMap(({ start, end, tag }): BlueskyTagFacet[] => {
    if (excludeTruncated && truncatedTagTail.test(text.slice(end))) return [];
    const index = toByteIndex(text, start, end);
    const overlapping = facets.filter((facet) =>
      index.byteStart < facet.index.byteEnd && facet.index.byteStart < index.byteEnd
    );
    const [only] = overlapping;
    const [feature] = only?.features ?? [];
    const isSameRangeLink = overlapping.length === 1 && only !== undefined
      && feature?.$type === 'app.bsky.richtext.facet#link' && isHashtagPageUri(feature.uri, tag)
      && only.index.byteStart === index.byteStart && only.index.byteEnd === index.byteEnd;
    if (overlapping.length > 0 && !isSameRangeLink) return [];
    if (only !== undefined) replaced.add(only);
    return [{ index, features: [{ $type: 'app.bsky.richtext.facet#tag', tag }] }];
  });
  return [...facets.filter((facet) => !replaced.has(facet)), ...tagFacets]
    .sort((a, b) => a.index.byteStart - b.index.byteStart);
};
