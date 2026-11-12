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

export type RemoteImportResult = Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'loaded'; count: number }>;

export const isRemoteImportFailure = (result: RemoteImportResult | undefined): boolean =>
  result !== undefined && (result.kind === 'failed' || result.count === 0);
