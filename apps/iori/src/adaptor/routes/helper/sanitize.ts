import sanitizeHtml from 'sanitize-html';

export const sanitize = (html: string) => {
  const sanitized = sanitizeHtml(html, {
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
    allowedClasses: {
      'pre': ['shiki', 'shiki-themes', 'shiki-dark', 'shiki-light', 'github-light', 'github-dark'],
      'code': [
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
    allowedAttributes: {
      'pre': ['style', 'class'],
      'span': ['style', 'class'],
    },
    allowedStyles: {
      '*': {
        'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
        '--shiki-dark': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
        '--shiki-dark-bg': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
      },
    },
  });
  return sanitized;
};
