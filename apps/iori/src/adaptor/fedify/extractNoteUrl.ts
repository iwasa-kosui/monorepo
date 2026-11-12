import { Link, type Note } from '@fedify/vocab';

const toHttpUrl = (url: URL | Link): string | null => {
  const target = url instanceof Link ? url.href : url;
  return target && (target.protocol === 'http:' || target.protocol === 'https:') ? target.href : null;
};

export const extractNoteUrl = (note: Note): string | null => {
  for (const url of note.urls) {
    const found = toHttpUrl(url);
    if (found !== null) return found;
  }
  return null;
};
