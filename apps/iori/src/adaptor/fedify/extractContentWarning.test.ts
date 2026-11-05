import { Note } from '@fedify/vocab';
import { LanguageString } from '@fedify/vocab-runtime';
import { describe, expect, it } from 'vitest';

import { extractContentWarning } from './extractContentWarning.ts';

const noteId = new URL('https://remote.example/notes/1');

describe('extractContentWarning', () => {
  it('reads a string summary and the sensitive flag of a Note', () => {
    const note = new Note({ id: noteId, summary: 'ネタバレ注意', sensitive: true });

    expect(extractContentWarning(note)).toEqual({ summary: 'ネタバレ注意', sensitive: true });
  });

  it('turns a LanguageString summary into a plain string', () => {
    const note = new Note({ id: noteId, summary: new LanguageString('spoiler', 'en'), sensitive: true });

    const { summary } = extractContentWarning(note);

    expect(summary).toBe('spoiler');
    expect(typeof summary).toBe('string');
  });

  it('turns an empty summary into null', () => {
    const note = new Note({ id: noteId, summary: '', sensitive: false });

    expect(extractContentWarning(note)).toEqual({ summary: null, sensitive: false });
  });

  it('returns null and false for a Note without summary and sensitive', () => {
    expect(extractContentWarning(new Note({ id: noteId }))).toEqual({ summary: null, sensitive: false });
  });

  it('turns a null sensitive into false and keeps the summary', () => {
    const note = new Note({ id: noteId, summary: 'CW', sensitive: null });

    expect(extractContentWarning(note)).toEqual({ summary: 'CW', sensitive: false });
  });
});
