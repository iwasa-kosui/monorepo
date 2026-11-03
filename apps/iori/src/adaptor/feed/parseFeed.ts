import { Result } from '@iwasa-kosui/result';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { htmlToPlainText } from '../text/htmlToPlainText.ts';

export const MAX_FEED_ITEMS = 30;
export const MAX_DESCRIPTION_CHARS = 1000;
const MAX_TITLE_CHARS = 1000;

export type ParsedFeedItem = Readonly<{
  guid: string;
  url: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  hatenaBookmarkCount: number | null;
}>;

export type FeedParseError = Readonly<{ type: 'FeedParseError'; message: string }>;

const feedParseError = (message: string): FeedParseError => ({ type: 'FeedParseError', message });

type Node = Readonly<Record<string, unknown>>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

const toArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const textOf = (value: unknown): string | undefined => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === 'string') return candidate.trim();
  if (typeof candidate === 'number') return String(candidate);
  if (isNode(candidate)) return textOf(candidate['#text']);
  return undefined;
};

const firstText = (node: Node, keys: ReadonlyArray<string>): string | undefined => {
  for (const key of keys) {
    const text = textOf(node[key]);
    if (text !== undefined && text !== '') return text;
  }
  return undefined;
};

const attributeOf = (value: unknown, name: string): string | undefined => {
  if (!isNode(value)) return undefined;
  const attribute = value[`@_${name}`];
  return typeof attribute === 'string' ? attribute : undefined;
};

const atomLink = (entry: Node): string | undefined => {
  for (const link of toArray(entry['link'])) {
    const rel = attributeOf(link, 'rel');
    if (rel === undefined || rel === 'alternate') {
      const href = attributeOf(link, 'href');
      if (href !== undefined) return href;
    }
  }
  return undefined;
};

const plainDescription = (node: Node): string => {
  for (const key of ['description', 'summary', 'content']) {
    const raw = textOf(node[key]);
    if (raw === undefined) continue;
    const text = htmlToPlainText(raw, MAX_DESCRIPTION_CHARS);
    if (text !== '') return text;
  }
  return '';
};

const toDate = (value: string | undefined): Date | null => {
  if (value === undefined) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
};

const toBookmarkCount = (value: string | undefined): number | null => {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
};

const toItem = (
  node: Node,
  link: string | undefined,
  guid: string | undefined,
): ParsedFeedItem | undefined => {
  const url = safeAbsoluteUrl(link);
  const rawTitle = textOf(node['title']);
  if (url === undefined || rawTitle === undefined) return undefined;
  const title = htmlToPlainText(rawTitle, MAX_TITLE_CHARS).replace(/\s+/g, ' ').trim();
  if (title === '') return undefined;
  return {
    guid: guid === undefined || guid === '' ? url : guid,
    url,
    title,
    description: plainDescription(node),
    publishedAt: toDate(firstText(node, ['pubDate', 'dc:date', 'published', 'updated'])),
    hatenaBookmarkCount: toBookmarkCount(textOf(node['hatena:bookmarkcount'])),
  };
};

const collectItems = (root: Node): ParsedFeedItem[] | undefined => {
  const rdf = root['rdf:RDF'];
  if (isNode(rdf)) {
    return toArray(rdf['item']).filter(isNode).flatMap((node) => {
      const link = textOf(node['link']);
      const item = toItem(node, link, attributeOf(node, 'rdf:about') ?? link);
      return item === undefined ? [] : [item];
    });
  }
  const rss = root['rss'];
  if (isNode(rss)) {
    return toArray(rss['channel']).filter(isNode).flatMap((channel) =>
      toArray(channel['item']).filter(isNode).flatMap((node) => {
        const link = textOf(node['link']);
        const item = toItem(node, link, textOf(node['guid']) ?? link);
        return item === undefined ? [] : [item];
      })
    );
  }
  const feed = root['feed'];
  if (isNode(feed)) {
    return toArray(feed['entry']).filter(isNode).flatMap((node) => {
      const item = toItem(node, atomLink(node), textOf(node['id']));
      return item === undefined ? [] : [item];
    });
  }
  return undefined;
};

const byNewest = (a: ParsedFeedItem, b: ParsedFeedItem): number => {
  if (a.publishedAt === null && b.publishedAt === null) return 0;
  if (a.publishedAt === null) return 1;
  if (b.publishedAt === null) return -1;
  return b.publishedAt.getTime() - a.publishedAt.getTime();
};

export const parseFeed = (xml: string): Result<ParsedFeedItem[], FeedParseError> => {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) return Result.err(feedParseError(`Invalid XML: ${validation.err.msg}`));
  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch (error) {
    return Result.err(feedParseError(`Invalid XML: ${error instanceof Error ? error.message : String(error)}`));
  }
  const items = isNode(root) ? collectItems(root) : undefined;
  if (items === undefined) return Result.err(feedParseError('Unsupported feed format.'));
  return Result.ok(items.toSorted(byNewest).slice(0, MAX_FEED_ITEMS));
};
