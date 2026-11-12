import { Link } from '@fedify/vocab';

import type { RemotePostObject } from '../../useCase/helper/remotePostObject.ts';

const toHttpUrl = (url: URL | Link): string | null => {
  const target = url instanceof Link ? url.href : url;
  return target && (target.protocol === 'http:' || target.protocol === 'https:') ? target.href : null;
};

export const extractNoteUrl = (note: RemotePostObject): string | null => {
  if (note.id === null) return null;
  for (const url of note.urls) {
    const found = toHttpUrl(url);
    if (found !== null && new URL(found).origin === note.id.origin) return found;
  }
  return null;
};
