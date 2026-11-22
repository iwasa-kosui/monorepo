import { Article, Note, Person } from '@fedify/vocab';
import { describe, expect, it, vi } from 'vitest';

import { resolveImplicitQuoteUri } from './resolveImplicitQuoteUri.ts';

const noteId = new URL('https://remote.example/users/riq0h/posts/2');
const quotedUrl = 'https://remote.example/@riq0h/1';
const quotedId = new URL('https://remote.example/users/riq0h/posts/1');
const linking = (href: string, extra: ConstructorParameters<typeof Note>[0] = {}) =>
  new Note({ id: noteId, content: `<p>再テスト。<br><br><a href="${href}">link</a></p>`, ...extra });
const options = (found: unknown, isLocal = false) => ({
  isLocalPostUri: () => isLocal,
  lookupObject: vi.fn(async () => found),
});

describe('resolveImplicitQuoteUri', () => {
  it('returns the id of the post the trailing link resolves to', async () => {
    const opts = options(new Note({ id: quotedId }));

    expect(await resolveImplicitQuoteUri(linking(quotedUrl), opts)).toBe(quotedId.href);
  });

  it('does not treat a link to something other than a post as a quote', async () => {
    expect(await resolveImplicitQuoteUri(linking(quotedUrl), options(new Person({ id: quotedId })))).toBeNull();
    expect(await resolveImplicitQuoteUri(linking(quotedUrl), options(null))).toBeNull();
  });

  it('returns null when the lookup fails', async () => {
    const opts = { isLocalPostUri: () => false, lookupObject: vi.fn(async () => Promise.reject(new Error('boom'))) };

    expect(await resolveImplicitQuoteUri(linking(quotedUrl), opts)).toBeNull();
  });

  it('uses a local post URI without fetching it', async () => {
    const opts = options(null, true);

    expect(await resolveImplicitQuoteUri(linking('https://iori.test/users/kosui/posts/1'), opts)).toBe(
      'https://iori.test/users/kosui/posts/1',
    );
    expect(opts.lookupObject).not.toHaveBeenCalled();
  });

  it('ignores a link to the note itself or to its reply target', async () => {
    const self = options(new Note({ id: noteId }));
    expect(await resolveImplicitQuoteUri(linking('https://remote.example/@riq0h/2'), self)).toBeNull();

    const parent = options(new Note({ id: quotedId }));
    expect(await resolveImplicitQuoteUri(linking(quotedUrl, { replyTarget: quotedId }), parent)).toBeNull();
  });

  it('does not fetch anything for a note without a trailing link or for an Article', async () => {
    const opts = options(new Note({ id: quotedId }));
    const article = new Article({ id: noteId, content: `<p><a href="${quotedUrl}">link</a></p>` });

    expect(await resolveImplicitQuoteUri(new Note({ id: noteId, content: '<p>hi</p>' }), opts)).toBeNull();
    expect(await resolveImplicitQuoteUri(article, opts)).toBeNull();
    expect(opts.lookupObject).not.toHaveBeenCalled();
  });
});
