import {
  createActivityPubRequest,
  getRemoteDocument,
  isValidPublicIPv4Address,
  isValidPublicIPv6Address,
  type RemoteDocument,
} from '@fedify/vocab-runtime';

import type { LookupUrlResolution, LookupUrlResolver } from '../../ports/lookupUrlResolver.ts';

const MAX_HOPS = 5;

const isRedirect = (status: number): boolean => status >= 300 && status < 400;

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

// fedify の validatePublicUrl は DNS を引けない環境で失敗するので、DNS を引かずに確かめられる範囲だけを確かめる
export const validateLiteralPublicUrl = async (url: string): Promise<void> => {
  const { protocol, hostname } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, '');
  const isPublic = (protocol === 'https:' || protocol === 'http:')
    && host !== 'localhost'
    && !host.endsWith('.localhost')
    && (IPV4_LITERAL.test(host)
      ? isValidPublicIPv4Address(host)
      : host.includes(':')
      ? isValidPublicIPv6Address(host)
      : true);
  if (!isPublic) throw new Error(`Invalid or private address: ${url}`);
};

const discard = (response: Response): void => {
  response.body?.cancel().catch(() => {});
};

type Deps = Readonly<{
  isBlockedUri: (uri: string) => boolean;
  fetch?: typeof fetch;
  validateUrl?: (url: string) => Promise<void>;
}>;

// fedify の document loader は rel=alternate とリダイレクトの先を内部で追うので、ブロックしたドメインに届く前に自前で1 hop ずつ確かめる
export const createLookupUrlResolver = ({
  isBlockedUri,
  fetch: fetchImpl = globalThis.fetch,
  validateUrl = validateLiteralPublicUrl,
}: Deps): LookupUrlResolver =>
async (url, { signal }) => {
  let current = new URL(url).href;
  const visited = new Set<string>();
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (isBlockedUri(current)) return { type: 'blocked' };
    if (visited.has(current)) break;
    visited.add(current);
    try {
      await validateUrl(current);
    } catch {
      return { type: 'blocked' };
    }
    let response: Response;
    try {
      response = await fetchImpl(createActivityPubRequest(current), { signal });
    } catch {
      break;
    }
    const location = response.headers.get('Location');
    if (isRedirect(response.status) && location !== null) {
      discard(response);
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) {
      discard(response);
      break;
    }
    let alternate: string | undefined;
    try {
      await getRemoteDocument(current, response, async (alternateUrl: string): Promise<RemoteDocument> => {
        alternate = alternateUrl;
        return { contextUrl: null, document: null, documentUrl: alternateUrl };
      }, { signal, suppressError: true });
    } catch {
      break;
    }
    if (alternate === undefined) break;
    current = alternate;
  }
  return isBlockedUri(current) ? { type: 'blocked' } : { type: 'resolved', url: current } satisfies LookupUrlResolution;
};
