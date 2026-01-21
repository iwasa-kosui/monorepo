import { Marked, Renderer } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';

const highlighterPromise = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: [
    'javascript',
    'typescript',
    'python',
    'rust',
    'go',
    'java',
    'c',
    'cpp',
    'json',
    'yaml',
    'html',
    'css',
    'sql',
    'bash',
    'shell',
    'markdown',
    'plaintext',
  ],
});

const createRenderer = (highlighter: Highlighter): Renderer => {
  const renderer = new Renderer();

  renderer.code = ({ text, lang }) => {
    const language = lang || 'plaintext';
    try {
      return highlighter.codeToHtml(text, {
        lang: language,
        themes: {
          light: 'github-light',
          dark: 'github-dark',
        },
      });
    } catch {
      return highlighter.codeToHtml(text, {
        lang: 'plaintext',
        themes: {
          light: 'github-light',
          dark: 'github-dark',
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
    const highlighter = await highlighterPromise;
    const marked = new Marked({ renderer: createRenderer(highlighter) });
    return marked.parse(markdown, { async: false }) as string;
  },
} as const;
