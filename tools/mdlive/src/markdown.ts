import { err, ok, Result } from '@iwasa-kosui/result';
import { Marked } from 'marked';
import { type BundledLanguage, createHighlighter, type Highlighter } from 'shiki';

export type MarkdownError = Readonly<{
  type: 'MarkdownError';
  message: string;
  cause?: unknown;
}>;

export const MarkdownError = {
  new: (message: string, cause?: unknown): MarkdownError => ({
    type: 'MarkdownError',
    message,
    cause,
  }),
} as const;

const SUPPORTED_LANGUAGES: readonly BundledLanguage[] = [
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'json',
  'html',
  'css',
  'scss',
  'markdown',
  'yaml',
  'toml',
  'bash',
  'shell',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'sql',
  'graphql',
  'diff',
];

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...SUPPORTED_LANGUAGES],
    });
  }
  return highlighterPromise;
};

export type MarkdownConverter = Readonly<{
  convert: (markdown: string) => Promise<Result<string, MarkdownError>>;
}>;

export const createMarkdownConverter = (): MarkdownConverter => {
  const convert = async (markdown: string): Promise<Result<string, MarkdownError>> => {
    try {
      const highlighter = await getHighlighter();

      const marked = new Marked({
        async: true,
        renderer: {
          code: ({ text, lang }) => {
            // Mermaid diagrams
            if (lang === 'mermaid') {
              return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
            }

            const language = lang && SUPPORTED_LANGUAGES.includes(lang as BundledLanguage)
              ? lang
              : 'text';

            if (language === 'text') {
              return `<pre><code>${escapeHtml(text)}</code></pre>`;
            }

            const html = highlighter.codeToHtml(text, {
              lang: language as BundledLanguage,
              themes: {
                light: 'github-light',
                dark: 'github-dark',
              },
            });
            return html;
          },
        },
      });

      const html = await marked.parse(markdown);
      return ok(html);
    } catch (error) {
      return err(MarkdownError.new('Failed to convert markdown', error));
    }
  };

  return { convert } as const;
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
