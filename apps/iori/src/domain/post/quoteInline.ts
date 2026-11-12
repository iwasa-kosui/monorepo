import { escapeHtml } from './textSyntax.ts';

const HREF_ATTRIBUTE = /<a\b[^>]*?\bhref\s*=\s*"([^"]*)"/gi;

const decodeEntities = (text: string): string =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', '\'')
    .replaceAll('&amp;', '&');

const normalize = (url: string): string => {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
};

const linksTo = (html: string, uri: string): boolean => {
  const target = normalize(uri);
  return [...html.matchAll(HREF_ATTRIBUTE)].some((match) => normalize(decodeEntities(match[1] ?? '')) === target);
};

const quoteParagraph = (quoteUri: string): string =>
  `<p>RE: <a href="${escapeHtml(quoteUri)}">${escapeHtml(quoteUri)}</a></p>`;

export const appendQuoteInline = (html: string, quoteUri: string): string =>
  linksTo(html, quoteUri) ? html : `${html}${quoteParagraph(quoteUri)}`;

export const removeQuoteInline = (html: string, quoteUri: string): string => {
  const paragraph = quoteParagraph(quoteUri);
  return html.endsWith(paragraph) ? html.slice(0, -paragraph.length) : html;
};
