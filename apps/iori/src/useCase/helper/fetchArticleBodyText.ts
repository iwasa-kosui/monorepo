import type { SafeFetcher, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import { htmlToPlainText } from '../../adaptor/text/htmlToPlainText.ts';

const BODY_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const BODY_HTML_MAX_CHARS = 524_288;
const BODY_FETCH_MAX_REDIRECTS = 3;
const BODY_MEDIA_TYPES_HTML: ReadonlySet<string> = new Set(['text/html', 'application/xhtml+xml']);

const toBodyText = (fetched: SafeFetchResult, maxChars: number): string => {
  if (fetched.body === undefined) return '';
  const mediaType = fetched.contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'text/plain') {
    return Array.from(fetched.body.slice(0, maxChars * 2)).slice(0, maxChars).join('');
  }
  if (!BODY_MEDIA_TYPES_HTML.has(mediaType)) return '';
  return htmlToPlainText(fetched.body.slice(0, BODY_HTML_MAX_CHARS), maxChars);
};

export const fetchArticleBodyText = async (
  safeFetcher: Pick<SafeFetcher, 'fetchText'>,
  url: string,
  options: Readonly<{ timeoutMs: number; maxChars: number }>,
): Promise<string> => {
  const fetched = await safeFetcher.fetchText(url, {
    timeoutMs: options.timeoutMs,
    maxBytes: BODY_FETCH_MAX_BYTES,
    maxRedirects: BODY_FETCH_MAX_REDIRECTS,
  });
  return fetched.ok ? toBodyText(fetched.val, options.maxChars) : '';
};
