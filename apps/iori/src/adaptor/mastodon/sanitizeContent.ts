import sanitizeHtml from 'sanitize-html';

const hexOrRgb = [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/];

export const sanitizeStatusContent = (html: string): string =>
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
      'h1',
      'h2',
      'h3',
    ],
    allowedAttributes: {
      a: ['href', 'rel', 'class'],
      span: ['class', 'style'],
      pre: ['class', 'style'],
      code: ['class'],
    },
    allowedClasses: {
      pre: ['shiki', 'shiki-themes', 'shiki-dark', 'shiki-light', 'github-light', 'github-dark'],
      code: [
        'language-javascript',
        'language-typescript',
        'language-ts',
        'language-python',
        'language-ruby',
        'language-java',
        'language-cpp',
        'language-html',
        'language-css',
      ],
    },
    allowedSchemes: ['http', 'https'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        'color': hexOrRgb,
        'background-color': hexOrRgb,
        '--shiki-dark': hexOrRgb,
        '--shiki-dark-bg': hexOrRgb,
      },
    },
  });
