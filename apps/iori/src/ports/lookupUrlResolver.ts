export type LookupUrlResolution =
  | Readonly<{ type: 'resolved'; url: string }>
  | Readonly<{ type: 'blocked' }>;

export type LookupUrlResolver = (
  url: string,
  options: Readonly<{ signal: AbortSignal }>,
) => Promise<LookupUrlResolution>;
