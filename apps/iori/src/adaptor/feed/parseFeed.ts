import { Result } from '@iwasa-kosui/result';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { FEED_ENTRY_KEY_MAX_CHARS } from '../../domain/feedEntry/feedEntry.ts';
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

type Candidate = Readonly<{
  node: Node;
  guid: string;
  url: string;
  publishedAt: Date | null;
}>;

const toCandidate = (
  node: Node,
  link: string | undefined,
  guid: string | undefined,
): Candidate | undefined => {
  const url = safeAbsoluteUrl(link);
  if (url === undefined) return undefined;
  const resolvedGuid = guid === undefined || guid === '' ? url : guid;
  if (url.length > FEED_ENTRY_KEY_MAX_CHARS || resolvedGuid.length > FEED_ENTRY_KEY_MAX_CHARS) return undefined;
  return {
    node,
    guid: resolvedGuid,
    url,
    publishedAt: toDate(firstText(node, ['pubDate', 'dc:date', 'published', 'updated'])),
  };
};

const toItem = ({ node, guid, url, publishedAt }: Candidate): ParsedFeedItem | undefined => {
  const rawTitle = textOf(node['title']);
  if (rawTitle === undefined) return undefined;
  const title = htmlToPlainText(rawTitle, MAX_TITLE_CHARS).replace(/\s+/g, ' ').trim();
  if (title === '') return undefined;
  return {
    guid,
    url,
    title,
    description: plainDescription(node),
    publishedAt,
    hatenaBookmarkCount: toBookmarkCount(textOf(node['hatena:bookmarkcount'])),
  };
};

const collectCandidates = (root: Node): Candidate[] | undefined => {
  const rdf = root['rdf:RDF'];
  if (isNode(rdf)) {
    return toArray(rdf['item']).filter(isNode).flatMap((node) => {
      const link = textOf(node['link']);
      const candidate = toCandidate(node, link, attributeOf(node, 'rdf:about') ?? link);
      return candidate === undefined ? [] : [candidate];
    });
  }
  const rss = root['rss'];
  if (isNode(rss)) {
    return toArray(rss['channel']).filter(isNode).flatMap((channel) =>
      toArray(channel['item']).filter(isNode).flatMap((node) => {
        const link = textOf(node['link']);
        const candidate = toCandidate(node, link, textOf(node['guid']) ?? link);
        return candidate === undefined ? [] : [candidate];
      })
    );
  }
  const feed = root['feed'];
  if (isNode(feed)) {
    return toArray(feed['entry']).filter(isNode).flatMap((node) => {
      const candidate = toCandidate(node, atomLink(node), textOf(node['id']));
      return candidate === undefined ? [] : [candidate];
    });
  }
  return undefined;
};

const byNewest = (a: Candidate, b: Candidate): number => {
  if (a.publishedAt === null && b.publishedAt === null) return 0;
  if (a.publishedAt === null) return 1;
  if (b.publishedAt === null) return -1;
  return b.publishedAt.getTime() - a.publishedAt.getTime();
};

export type ParseFeedOptions = Readonly<{ maxItems?: number }>;

export const parseFeed = (
  xml: string,
  { maxItems = MAX_FEED_ITEMS }: ParseFeedOptions = {},
): Result<ParsedFeedItem[], FeedParseError> => {
  if (/<!ENTITY/i.test(xml)) return Result.err(feedParseError('Invalid XML: entity declarations are not supported'));
  const validation = XMLValidator.validate(xml);
  if (validation !== true) return Result.err(feedParseError(`Invalid XML: ${validation.err.msg}`));
  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch (error) {
    return Result.err(feedParseError(`Invalid XML: ${error instanceof Error ? error.message : String(error)}`));
  }
  const candidates = isNode(root) ? collectCandidates(root) : undefined;
  if (candidates === undefined) return Result.err(feedParseError('Unsupported feed format.'));
  return Result.ok(
    candidates.toSorted(byNewest).slice(0, maxItems).flatMap((candidate) => {
      const item = toItem(candidate);
      return item === undefined ? [] : [item];
    }),
  );
};
