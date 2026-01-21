import { Marked } from 'marked';
import { createHighlighter } from 'shiki';

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

const markedInstance = new Marked();

/**
 * PostContent - Markdown to HTML conversion service
 */
export const PostContent = {
  fromMarkdown: async (markdown: string): Promise<string> => {
    const highlighter = await highlighterPromise;
    const renderer = new markedInstance.Renderer();

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

    markedInstance.setOptions({ renderer });
    return markedInstance.parse(markdown, { async: false }) as string;
  },
} as const;
