const httpsUrlPattern = /^https:\/\/\S+$/i;

export const remoteSearchUrl = (q: string, ownHost: string): string | undefined => {
  const trimmed = q.trim();
  if (!httpsUrlPattern.test(trimmed) || !URL.canParse(trimmed)) {
    return undefined;
  }
  const url = new URL(trimmed);
  if (url.username !== '' || url.password !== '') {
    return undefined;
  }
  return url.host.toLowerCase() === ownHost.toLowerCase() ? undefined : trimmed;
};
