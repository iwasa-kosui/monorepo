export type BlueskyFeedKind = 'feed' | 'list';

const FEED_URI_PATTERN = /^at:\/\/[^/]+\/(app\.bsky\.feed\.generator|app\.bsky\.graph\.list)\/[^/]+$/;

export const blueskyFeedKindOf = (uri: string): BlueskyFeedKind | undefined => {
  const collection = FEED_URI_PATTERN.exec(uri)?.[1];
  if (collection === undefined) return undefined;
  return collection === 'app.bsky.feed.generator' ? 'feed' : 'list';
};
