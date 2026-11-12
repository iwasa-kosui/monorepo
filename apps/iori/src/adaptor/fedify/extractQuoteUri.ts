import { Hashtag, Link, Mention, type Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';

const MISSKEY_QUOTE_REL = 'https://misskey-hub.net/ns#_misskey_quote';
const ACTIVITY_STREAMS_MEDIA_TYPE = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const ACTIVITY_JSON_MEDIA_TYPE = 'application/activity+json';

const toHttpUri = (url: URL | null | undefined): string | null =>
  url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;

const isQuoteLink = (link: Link): boolean =>
  link.rels.includes(MISSKEY_QUOTE_REL)
  || link.mediaType === ACTIVITY_STREAMS_MEDIA_TYPE
  || link.mediaType === ACTIVITY_JSON_MEDIA_TYPE;

const findQuoteLinkUri = async (note: Note, documentLoader: DocumentLoader): Promise<string | null> => {
  try {
    for await (const tag of note.getTags({ documentLoader })) {
      if (!(tag instanceof Link) || tag instanceof Mention || tag instanceof Hashtag || !isQuoteLink(tag)) continue;
      const uri = toHttpUri(tag.href);
      if (uri !== null) return uri;
    }
  } catch {
    return null;
  }
  return null;
};

export const extractQuoteUri = async (note: Note, documentLoader: DocumentLoader): Promise<string | null> =>
  toHttpUri(note.quoteId) ?? toHttpUri(note.quoteUrl) ?? await findQuoteLinkUri(note, documentLoader);
