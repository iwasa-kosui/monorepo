import { describe, expect, it } from 'vitest';

import { isBlockedUri } from '../src/adaptor/fedify/blockedInboxDomain.ts';
import { createLookupUrlResolver } from '../src/adaptor/fedify/lookupUrlResolver.ts';

const URL_ = 'https://remote.example/@alice/1';

const resolverFor = (body: string) => {
  const fetched: string[] = [];
  const resolve = createLookupUrlResolver({
    isBlockedUri: (uri) => isBlockedUri(uri, ['blocked.example']),
    fetch: (async (input: Request) => {
      fetched.push(input.url);
      return input.url === URL_
        ? new Response(body, { headers: { 'Content-Type': 'text/html' } })
        : new Response('{}', { headers: { 'Content-Type': 'application/activity+json' } });
    }) as unknown as typeof fetch,
  });
  return { resolve: () => resolve(URL_, { signal: new AbortController().signal }), fetched };
};

const pageWithAlternate = (href: string) =>
  `<html><head><link rel="alternate" type="application/activity+json" href="${href}"></head></html>`;

describe('createLookupUrlResolver（workerd）', () => {
  it('HTML の rel=alternate の先がブロックしたドメインなら、その先を取得しない', async () => {
    const t = resolverFor(pageWithAlternate('https://blocked.example/notes/1'));

    expect(await t.resolve()).toEqual({ type: 'blocked' });
    expect(t.fetched).toEqual([URL_]);
  });

  it('HTML の rel=alternate の先がブロックしていないドメインなら、その URL を返す', async () => {
    const t = resolverFor(pageWithAlternate('https://remote.example/notes/1'));

    expect(await t.resolve()).toEqual({ type: 'resolved', url: 'https://remote.example/notes/1' });
  });
});
