import { PostContent } from '../../../domain/post/postContent.ts';
import { htmlToTextWithLinks } from '../../bluesky/htmlToTextWithLinks.ts';

export type BlueskyPostContentType = 'text/plain' | 'text/markdown';

export const blueskyPostTextOf = async (status: string, contentType: BlueskyPostContentType): Promise<string> => {
  if (contentType === 'text/plain') return status;
  const { text, links } = htmlToTextWithLinks(await PostContent.fromMarkdown(status));
  let result = '';
  let cursor = 0;
  for (const { start, end, uri } of links) {
    result += text.slice(cursor, end);
    if (text.slice(start, end) !== uri) result += ` (${uri})`;
    cursor = end;
  }
  return result + text.slice(cursor);
};
