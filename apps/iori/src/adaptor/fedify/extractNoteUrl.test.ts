import { Link, Note } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { extractNoteUrl } from './extractNoteUrl.ts';

const noteId = new URL('https://remote.example/notes/1');

describe('extractNoteUrl', () => {
  it('reads a URL', () => {
    const note = new Note({ id: noteId, url: new URL('https://remote.example/@alice/1') });

    expect(extractNoteUrl(note)).toBe('https://remote.example/@alice/1');
  });

  it('reads the href of a Link', () => {
    const note = new Note({ id: noteId, url: new Link({ href: new URL('https://remote.example/@alice/1') }) });

    expect(extractNoteUrl(note)).toBe('https://remote.example/@alice/1');
  });

  it('returns null for a url that is not http or https', () => {
    expect(extractNoteUrl(new Note({ id: noteId, url: new URL('ftp://remote.example/@alice/1') }))).toBeNull();
  });

  it('skips a url that is not http or https and reads the next one', () => {
    const note = new Note({
      id: noteId,
      urls: [new URL('ftp://remote.example/@alice/1'), new Link({ href: new URL('https://remote.example/@alice/1') })],
    });

    expect(extractNoteUrl(note)).toBe('https://remote.example/@alice/1');
  });

  it('returns null for a url whose origin differs from the id', () => {
    const note = new Note({ id: noteId, url: new URL('https://other.example/@victim/1') });

    expect(extractNoteUrl(note)).toBeNull();
  });

  it('skips a url whose origin differs from the id and reads the next one', () => {
    const note = new Note({
      id: noteId,
      urls: [new URL('https://other.example/@victim/1'), new URL('https://remote.example/@alice/1')],
    });

    expect(extractNoteUrl(note)).toBe('https://remote.example/@alice/1');
  });
});
