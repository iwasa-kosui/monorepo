import type { Status } from '../../adaptor/mastodon/entities.ts';

export type QuoteView =
  | Readonly<{ kind: 'card'; status: Status }>
  | Readonly<{ kind: 'link'; url: string }>;

export const quoteOf = (post: Status): QuoteView | undefined => {
  const { quote, iori } = post;
  if (quote != null && quote.state === 'accepted' && quote.quoted_status != null) {
    return { kind: 'card', status: quote.quoted_status };
  }
  const quoteUrl = iori?.quote_url;
  return typeof quoteUrl === 'string' && quoteUrl !== '' ? { kind: 'link', url: quoteUrl } : undefined;
};

export const quoteTargetUrls = (view: QuoteView): readonly string[] =>
  view.kind === 'link'
    ? [view.url]
    : [view.status.uri, view.status.url].filter((url): url is string => typeof url === 'string' && url !== '');

const PARAGRAPH = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi;
const ANCHOR_HREF = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

const decodeAmp = (value: string): string => value.replaceAll('&amp;', '&');

const textOf = (html: string): string => html.replace(/<[^>]*>/g, '').trim();

const hrefsOf = (html: string): readonly string[] =>
  [...html.matchAll(ANCHOR_HREF)].map((match) => decodeAmp((match[1] ?? match[2] ?? '').trim()));

export const hideQuoteInline = (html: string, targetUrls: readonly string[]): string =>
  html.replace(PARAGRAPH, (paragraph, attributes: string | undefined, inner: string) => {
    if (/\bclass\s*=\s*["'][^"']*\bquote-inline\b/i.test(attributes ?? '')) return '';
    if (!/^RE:/i.test(textOf(inner))) return paragraph;
    return hrefsOf(inner).some((href) => targetUrls.includes(href)) ? '' : paragraph;
  });

export const withoutAnchors = (html: string): string => html.replace(/<\/?a(?:\s[^>]*)?>/gi, '');
