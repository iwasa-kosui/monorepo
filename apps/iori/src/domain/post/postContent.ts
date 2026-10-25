import { Marked, Renderer } from 'marked';
import type { HighlighterCore } from 'shiki/core';

let highlighterPromise: Promise<HighlighterCore> | null = null;

const getHighlighter = async (): Promise<HighlighterCore> => {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [
          import('shiki/themes/rose-pine-dawn.mjs'),
          import('shiki/themes/rose-pine.mjs'),
        ],
        langs: [
          import('shiki/langs/javascript.mjs'),
          import('shiki/langs/typescript.mjs'),
          import('shiki/langs/json.mjs'),
          import('shiki/langs/shellscript.mjs'),
        ],
        engine: createJavaScriptRegexEngine(),
      })
    );
  }
  return highlighterPromise;
};

const createRenderer = (highlighter: HighlighterCore): Renderer => {
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
