export type BlueskyFeedKind = 'feed' | 'list';

const FEED_URI_PATTERN = /^at:\/\/[^/]+\/(app\.bsky\.feed\.generator|app\.bsky\.graph\.list)\/[^/]+$/;

export const blueskyFeedKindOf = (uri: string): BlueskyFeedKind | undefined => {
  const collection = FEED_URI_PATTERN.exec(uri)?.[1];
  if (collection === undefined) return undefined;
  return collection === 'app.bsky.feed.generator' ? 'feed' : 'list';
};

export type BlueskyFeedUrl = Readonly<{ actor: string; kind: BlueskyFeedKind; rkey: string }>;

const BSKY_APP_FEED_URL_PATTERN = /^https:\/\/bsky\.app\/profile\/([^/?#]+)\/(feed|lists)\/([^/?#]+)\/?(?:[?#].*)?$/;
const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;
const HANDLE_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
const RKEY_PATTERN = /^[a-zA-Z0-9._~:-]+$/;

export const parseBlueskyFeedUrl = (url: string): BlueskyFeedUrl | undefined => {
  const match = BSKY_APP_FEED_URL_PATTERN.exec(url.trim());
  const actor = match?.[1];
  const rkey = match?.[3];
  if (match === null || actor === undefined || rkey === undefined) return undefined;
  if (!DID_PATTERN.test(actor) && !HANDLE_PATTERN.test(actor)) return undefined;
  if (!RKEY_PATTERN.test(rkey) || rkey === '.' || rkey === '..') return undefined;
  return { actor, kind: match[2] === 'feed' ? 'feed' : 'list', rkey };
};

export const isBlueskyDid = (value: string): boolean => DID_PATTERN.test(value);

export const blueskyFeedUriOf = (did: string, kind: BlueskyFeedKind, rkey: string): string =>
  `at://${did}/${kind === 'feed' ? 'app.bsky.feed.generator' : 'app.bsky.graph.list'}/${rkey}`;
