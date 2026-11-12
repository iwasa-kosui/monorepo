import { Hashtag, Link, Mention, Note } from '@fedify/vocab';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractQuoteUri } from './extractQuoteUri.ts';

const noteId = new URL('https://remote.example/notes/1');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractQuoteUri', () => {
  it('reads quoteId', async () => {
    const note = new Note({ id: noteId, quote: new URL('https://remote.example/notes/quoted') });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/quoted');
  });

  it('reads quoteUrl', async () => {
    const note = new Note({ id: noteId, quoteUrl: new URL('https://remote.example/notes/quoted') });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/quoted');
  });

  it('prefers quoteId over quoteUrl', async () => {
    const note = new Note({
      id: noteId,
      quote: new URL('https://remote.example/notes/by-id'),
      quoteUrl: new URL('https://remote.example/notes/by-url'),
    });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/by-id');
  });

  it('reads a Link tag whose rel is the Misskey quote relation', async () => {
    const note = new Note({
      id: noteId,
      tags: [
        new Link({
          href: new URL('https://remote.example/notes/quoted'),
          rel: 'https://misskey-hub.net/ns#_misskey_quote',
        }),
      ],
    });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/quoted');
  });

  it.each([
    'application/activity+json',
    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
  ])('reads a Link tag whose mediaType is %s', async (mediaType) => {
    const note = new Note({
      id: noteId,
      tags: [new Link({ href: new URL('https://remote.example/notes/quoted'), mediaType })],
    });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/quoted');
  });

  it('takes the first quote Link and skips Links that are not quotes', async () => {
    const note = new Note({
      id: noteId,
      tags: [
        new Link({ href: new URL('https://remote.example/plain'), mediaType: 'text/html' }),
        new Link({ href: new URL('https://remote.example/notes/first'), mediaType: 'application/activity+json' }),
        new Link({ href: new URL('https://remote.example/notes/second'), mediaType: 'application/activity+json' }),
      ],
    });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/first');
  });

  it('ignores a Mention and a Hashtag even when they look like a quote Link', async () => {
    const note = new Note({
      id: noteId,
      tags: [
        new Mention({ href: new URL('https://remote.example/users/bob'), mediaType: 'application/activity+json' }),
        new Hashtag({
          href: new URL('https://remote.example/tags/a'),
          name: '#a',
          mediaType: 'application/activity+json',
        }),
      ],
    });

    expect(await extractQuoteUri(note)).toBeNull();
  });

  it('ignores a URI that is not http or https', async () => {
    const note = new Note({
      id: noteId,
      quote: new URL('ftp://remote.example/notes/quoted'),
      quoteUrl: new URL('javascript:alert(1)'),
      tags: [new Link({ href: new URL('ftp://remote.example/notes/linked'), mediaType: 'application/activity+json' })],
    });

    expect(await extractQuoteUri(note)).toBeNull();
  });

  it('falls back to quoteUrl when quoteId is not http or https', async () => {
    const note = new Note({
      id: noteId,
      quote: new URL('ftp://remote.example/notes/quoted'),
      quoteUrl: new URL('https://remote.example/notes/by-url'),
    });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/by-url');
  });

  it('does not fetch tags that are only IRIs and still reads an embedded quote Link after them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const note = new Note({
      id: noteId,
      tags: [
        new URL('https://remote.example/tags/1'),
        new URL('https://remote.example/tags/2'),
        new Link({ href: new URL('https://remote.example/notes/quoted'), mediaType: 'application/activity+json' }),
      ],
    });

    expect(await extractQuoteUri(note)).toBe('https://remote.example/notes/quoted');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null without fetching when every tag is only an IRI', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const note = new Note({
      id: noteId,
      tags: [new URL('https://remote.example/tags/1'), new URL('https://remote.example/tags/2')],
    });

    expect(await extractQuoteUri(note)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null for a Note without a quote', async () => {
    expect(await extractQuoteUri(new Note({ id: noteId }))).toBeNull();
  });
});
