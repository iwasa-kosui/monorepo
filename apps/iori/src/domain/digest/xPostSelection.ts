import type { Instant } from '../instant/instant.ts';
import { type InterestVector, Recommendation } from '../recommendation/recommendation.ts';
import type { XPost } from './digestMaterial.ts';

const newestFirst = (a: XPost, b: XPost): number =>
  b.postedAt - a.postedAt || (a.feedEntryId < b.feedEntryId ? -1 : a.feedEntryId > b.feedEntryId ? 1 : 0);

export const selectXPosts = ({ posts, materials, now, limit }: Readonly<{
  posts: ReadonlyArray<XPost>;
  materials: ReadonlyArray<InterestVector>;
  now: Instant;
  limit: number;
}>): ReadonlyArray<XPost> => {
  const newest = [...posts].sort(newestFirst);
  if (newest.length <= limit) return newest;
  const embedded = newest.flatMap((post) =>
    post.embedding === null
      ? []
      : [{ feedEntryId: post.feedEntryId, hatenaBookmarkCount: null, embedding: post.embedding }]
  );
  const postById = new Map(newest.map((post) => [post.feedEntryId, post]));
  const scored = Recommendation.scoreArticles({ materials, articles: embedded, now, limit })
    .map(({ feedEntryId }) => postById.get(feedEntryId)!);
  return scored.length === 0 ? newest.slice(0, limit) : scored;
};
