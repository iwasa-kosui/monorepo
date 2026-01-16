import sanitizeHtml from 'sanitize-html';

export const sanitize = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [
      'p',
      'span',
      'br',
      'a',
      'del',
      'pre',
      'code',
      'em',
      'strong',
      'b',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'blockquote',
    ],
  });
