export const BSKY_APP_URL = 'https://bsky.app';
export const BLUESKY_STATUS_ID_PREFIX = 'bluesky:';
const atUriPattern = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/;
const didPattern = /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;
const handlePattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export const blueskyProfileUrlOfActor = (actor: string): string | undefined =>
  didPattern.test(actor) || (handlePattern.test(actor) && actor !== 'handle.invalid')
    ? `${BSKY_APP_URL}/profile/${actor}`
    : undefined;

export const blueskyPostUrl = (did: string, uri: string): string | undefined => {
  const rkey = atUriPattern.exec(uri)?.[2];
  const profileUrl = blueskyProfileUrlOfActor(did);
  return rkey === undefined || profileUrl === undefined
    ? undefined
    : `${profileUrl}/post/${encodeURIComponent(rkey)}`;
};

export const blueskyPostUrlOfUri = (uri: string): string | undefined => {
  const did = atUriPattern.exec(uri)?.[1];
  return did === undefined ? undefined : blueskyPostUrl(did, uri);
};
