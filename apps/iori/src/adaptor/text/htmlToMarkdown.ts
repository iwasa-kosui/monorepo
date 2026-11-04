import { createDocument } from '@mixmark-io/domino';
import TurndownService from 'turndown';

const service = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});
service.keep(['table']);

export const htmlToMarkdown = (html: string): string => service.turndown(createDocument(html).body).trim();
