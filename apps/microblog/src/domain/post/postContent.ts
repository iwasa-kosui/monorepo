import { Marked, Renderer } from 'marked';
import type { Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['rose-pine-dawn', 'rose-pine'],
        langs: [
          'javascript',
          'typescript',
          'json',
          'bash',
          'plaintext',
        ],
      })
    );
  }
  return highlighterPromise;
};

const createRenderer = (highlighter: Highlighter): Renderer => {
  const renderer = new Renderer();

  renderer.code = ({ text, lang }) => {
    const language = lang || 'plaintext';
    try {
      return highlighter.codeToHtml(text, {
        lang: language,
        themes: {
          light: 'rose-pine-dawn',
          dark: 'rose-pine',
        },
      });
    } catch {
      return highlighter.codeToHtml(text, {
        lang: 'plaintext',
        themes: {
          light: 'rose-pine-dawn',
          dark: 'rose-pine',
        },
      });
    }
  };

  return renderer;
};

/**
 * PostContent - Markdown to HTML conversion service
 */
export const PostContent = {
  fromMarkdown: async (markdown: string): Promise<string> => {
    const highlighter = await getHighlighter();
    const marked = new Marked({ renderer: createRenderer(highlighter) });
    return marked.parse(markdown, { async: false }) as string;
  },
} as const;
