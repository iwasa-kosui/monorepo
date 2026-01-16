import { marked } from 'marked';

/**
 * PostContent - Markdown to HTML conversion service
 */
export const PostContent = {
  fromMarkdown: (markdown: string): string => {
    return marked.parse(markdown, { async: false }) as string;
  },
} as const;
